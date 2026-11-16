import { minifySync, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterNode from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * Production is Netlify (ADR-0013): `pnpm build` writes the Netlify output. The browser tests are
 * the one exception. They run the built server in a plain Node process (`node build`), so
 * playwright.config.ts builds with PAYDAY_ADAPTER=node. Both adapters wrap the same SvelteKit server
 * code; only the entry point differs.
 */
const forNode = process.env.PAYDAY_ADAPTER === 'node';
// Passed explicitly, so NETLIFY_SVELTEKIT_USE_EDGE cannot switch the app to edge functions.
const adapter = forNode ? adapterNode() : adapterNetlify({ edge: false });

/**
 * The timing tests (the SPECS performance budget, for one person and for 100 people), run on their
 * own: see `projects` below.
 */
const PERFORMANCE_TESTS = [
	'src/lib/server/money/performance.test.ts',
	'src/lib/server/money/performanceMany.test.ts'
];

/**
 * The plain scripts every page loads from the layout's <head> (`#lib/glow/glow.js`,
 * `#lib/ui/menus.js`, `#lib/offline/guard.js`) are imported with `?url&no-inline`, which copies a
 * file as it is: their explaining comments would ship to every phone, and they count toward the home
 * screen's 60 KB budget (SPECS). This minifies them as they are written, with Vite's own minifier.
 * A file that would not minify is left as it is, and the build says so.
 */
const PLAIN_SCRIPT = /(^|\/)(glow|menus|guard)\.[\w-]+\.js$/;
function minifyPlainScripts(): Plugin {
	return {
		name: 'payday:minify-plain-scripts',
		apply: 'build',
		generateBundle(_options, bundle) {
			for (const file of Object.values(bundle)) {
				if (file.type !== 'asset' || !PLAIN_SCRIPT.test(file.fileName)) continue;
				const source =
					typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source);
				const result = minifySync(file.fileName, source, {});
				if (result.errors.length > 0) {
					this.warn(`${file.fileName} was not minified: ${result.errors[0]?.message}`);
					continue;
				}
				file.source = result.code;
			}
		}
	};
}

export default defineConfig(({ command, mode }) => ({
	// True only in the production build for Netlify. Then the server bundle holds no local database
	// (PGlite) at all, and a DATABASE_URL that is not postgres:// is refused: production must never
	// quietly fall back to a database that lives in the function. Development, the tests and the
	// browser tests' adapter-node build keep it. See src/lib/server/db/open.ts.
	define: { __PAYDAY_HOSTED__: JSON.stringify(command === 'build' && mode !== 'test' && !forNode) },
	plugins: [
		minifyPlainScripts(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter,
			// SvelteKit adds a nonce (dynamic pages) or a hash (prerendered ones) for the few inline
			// scripts it writes, so script-src needs no 'unsafe-inline'. The global header set
			// (HSTS, nosniff and the rest) is in src/lib/server/auth/headers.ts.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self'],
					// SvelteKit's own screen-reader announcer element carries one inline style attribute. This
					// allows exactly that string (its hash) and no other style attribute, so style-src itself
					// stays 'self' without 'unsafe-inline'. If a SvelteKit upgrade changes the string, the
					// 'no CSP violation' tests in tests/auth.e2e.ts fail and say the new hash.
					'style-src-attr': [
						'unsafe-hashes',
						'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='
					],
					'img-src': ['self', 'data:'],
					'connect-src': ['self'],
					'frame-ancestors': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'object-src': ['none']
				}
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		// Every test file starts its own in-process Postgres (PGlite), and a full run starts dozens at
		// once: the slowest few seconds of that must not count against a single test.
		testTimeout: 30_000,
		// Fewer files at once: every file starts its own in-process Postgres. The timing test runs on
		// its own after the rest (the `performance` project below).
		maxWorkers: 4,
		hookTimeout: 120_000,
		// JUnit for /setup, which records each run against the task id in the test's name.
		reporters: ['default', 'junit'],
		outputFile: { junit: 'reports/vitest.xml' },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', ...PERFORMANCE_TESTS]
				}
			},
			{
				// The timing tests run alone, after every other file has finished: on a shared CI
				// runner the same code measured 64 to 156 ms at p95 when other files ran beside it (and the
				// 100-people loans screen 170 to 190 ms, against 59 ms alone). The budget is unchanged.
				extends: './vite.config.ts',
				test: {
					name: 'performance',
					environment: 'node',
					include: PERFORMANCE_TESTS,
					// One file at a time, so the two timing tests never measure each other.
					fileParallelism: false,
					sequence: { groupOrder: 1 }
				}
			}
		]
	}
}));
