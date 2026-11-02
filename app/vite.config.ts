import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
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
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
