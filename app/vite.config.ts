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

/** The one timing test (the SPECS performance budget), run on its own: see `projects` below. */
const PERFORMANCE_TEST = 'src/lib/server/money/performance.test.ts';

export default defineConfig(({ command, mode }) => ({
	// True only in the production build for Netlify. Then the server bundle holds no local database
	// (PGlite) at all, and a DATABASE_URL that is not postgres:// is refused: production must never
	// quietly fall back to a database that lives in the function. Development, the tests and the
	// browser tests' adapter-node build keep it. See src/lib/server/db/open.ts.
	define: { __PAYDAY_HOSTED__: JSON.stringify(command === 'build' && mode !== 'test' && !forNode) },
	plugins: [
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
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', PERFORMANCE_TEST]
				}
			},
			{
				// The timing test runs alone, after every other file has finished: on a shared CI
				// runner the same code measured 64 to 156 ms at p95 when other files ran beside it.
				// The budget it checks is unchanged.
				extends: './vite.config.ts',
				test: {
					name: 'performance',
					environment: 'node',
					include: [PERFORMANCE_TEST],
					sequence: { groupOrder: 1 }
				}
			}
		]
	}
}));
