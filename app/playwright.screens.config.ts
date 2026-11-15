import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.ts';
import { AUTH_STATE } from './tests/support/auth.ts';

/*
 * `pnpm screens`: photographs the real app for the product page (static/landing/), with a made-up
 * household set up through the app itself. Never part of `pnpm test`: it writes files into the app.
 * Same server and owner registration as the browser tests (playwright.config.ts), its own projects.
 */
const setup = base.projects!.find((project) => project.name === 'setup')!;

export default defineConfig({
	...base,
	reporter: [['list']],
	projects: [
		setup,
		{
			name: 'screens',
			testDir: 'tests/screens',
			testMatch: /shoot\.ts$/,
			dependencies: ['setup'],
			use: {
				...devices['Desktop Chrome'],
				storageState: AUTH_STATE,
				locale: 'en-PH',
				timezoneId: 'Asia/Manila',
				serviceWorkers: 'block'
			}
		}
	]
});
