import { defineConfig, devices } from '@playwright/test';
import {
	AUTH_STATE,
	PASSWORD_PROJECT_HEADERS,
	projectHeaders,
	SETUP_CODE
} from './tests/support/auth.ts';
import { JOURNEY_TIME_ZONE } from './tests/support/household.ts';

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: 'tests',
	testMatch: '**/*.e2e.ts',
	forbidOnly: !!process.env.CI,
	// Every project shares one server whose in-process PGlite runs each query in turn on the server's
	// own event loop, so browsers beyond a few only queue behind it, and WebKit's timing-sensitive
	// tests then miss their waits. Three keeps the suite green; more were flaky, not faster.
	workers: 3,
	// JUnit for /setup, which records each run against the task id in the test's name.
	reporter: [['list'], ['junit', { outputFile: 'reports/playwright.xml' }]],
	// adapter-node builds the request URL as https://<Host> unless PROTOCOL_HEADER names a header that
	// says otherwise (it ignores ORIGIN). Behind a TLS-terminating proxy that default is right; here the server is
	// plain http, and passkeys check the origin exactly, so the browser says so on every request.
	//
	// The service worker is blocked everywhere but tests/offline.e2e.ts, which turns it back on. Every
	// test opens a fresh browser, where the worker installs from nothing and fetches the whole shell at
	// once from this one server, just as the test starts typing; on a busy machine that was the load
	// behind first taps racing their page. A person's phone installs it once.
	use: {
		baseURL: ORIGIN,
		extraHTTPHeaders: { 'x-forwarded-proto': 'http' },
		serviceWorkers: 'block'
	},
	// The iPhone's engine is WebKit: it is where installing and, in Phase 1, passkeys can differ.
	// `setup` runs first: it registers the owner with a password (and adds a passkey) and saves the
	// session, which the other projects start from, so every existing test runs signed in behind the guard.
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.ts$/, use: { ...devices['Desktop Chrome'] } },
		// All projects share ONE server and ONE in-process Postgres (PGlite), so the one journey that changes
		// it (first-run setup, then the schedule) runs once, on a phone, before the rest. Everything
		// after it reads the finished household and changes nothing that outlives its own test.
		{
			name: 'journey',
			testMatch: /journey\.e2e\.ts$/,
			dependencies: ['setup'],
			use: {
				...devices['iPhone 15'],
				storageState: AUTH_STATE,
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE
			}
		},
		// The check-in changes the shared database too (balances, history, reminders), so it also runs
		// once, on a phone, after the journey and before the read-only projects. It leaves the
		// household as it found it: every missed payment is confirmed paid, the balance is back.
		{
			name: 'checkin',
			testMatch: /checkin\.e2e\.ts$/,
			dependencies: ['setup', 'journey'],
			use: {
				...devices['iPhone 15'],
				storageState: AUTH_STATE,
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE
			}
		},
		// Loans change the shared database too (loans, balances, two more check-ins), so they run once,
		// on a phone, after the check-in and before the read-only projects. It ends on the
		// household's balance again, nothing owed on the schedule, and every payment confirmed.
		{
			name: 'loans',
			testMatch: /loans\.e2e\.ts$/,
			dependencies: ['setup', 'journey', 'checkin'],
			use: {
				...devices['iPhone 15'],
				storageState: AUTH_STATE,
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE
			}
		},
		{
			name: 'iphone',
			dependencies: ['setup', 'journey', 'checkin', 'loans'],
			testIgnore:
				/(journey|checkin|loans|marks|expenses|spent-vs-logged|backup|password|reset|rhythm)\.e2e\.ts$/,
			use: {
				...devices['iPhone 15'],
				storageState: AUTH_STATE,
				extraHTTPHeaders: projectHeaders(61)
			}
		},
		{
			name: 'android',
			dependencies: ['setup', 'journey', 'checkin', 'loans'],
			testIgnore:
				/(journey|checkin|loans|marks|expenses|spent-vs-logged|backup|password|reset|rhythm)\.e2e\.ts$/,
			use: {
				...devices['Pixel 7'],
				storageState: AUTH_STATE,
				extraHTTPHeaders: projectHeaders(62)
			}
		},
		{
			name: 'laptop',
			dependencies: ['setup', 'journey', 'checkin', 'loans'],
			testIgnore:
				/(journey|checkin|loans|marks|expenses|spent-vs-logged|backup|password|reset|rhythm)\.e2e\.ts$/,
			use: {
				...devices['Desktop Chrome'],
				storageState: AUTH_STATE,
				extraHTTPHeaders: projectHeaders(63)
			}
		},
		{
			// Marks bills and puts them back, so it runs alone, after the read-only projects.
			name: 'marks',
			testMatch: /marks\.e2e\.ts$/,
			dependencies: ['setup', 'journey', 'checkin', 'loans', 'iphone', 'android', 'laptop'],
			use: {
				...devices['iPhone 15'],
				storageState: AUTH_STATE,
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE
			}
		},
		// Logged expenses change the shared database (the number moves), so they run alone, one size
		// after another, after the read-only projects and the marks. Each test removes what it logged.
		{
			name: 'expenses-iphone',
			testMatch: /expenses\.e2e\.ts$/,
			dependencies: [
				'setup',
				'journey',
				'checkin',
				'loans',
				'iphone',
				'android',
				'laptop',
				'marks'
			],
			use: {
				...devices['iPhone 15'],
				storageState: AUTH_STATE,
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE
			}
		},
		{
			name: 'expenses-android',
			testMatch: /expenses\.e2e\.ts$/,
			dependencies: [
				'setup',
				'journey',
				'checkin',
				'loans',
				'iphone',
				'android',
				'laptop',
				'marks',
				'expenses-iphone'
			],
			use: {
				...devices['Pixel 7'],
				storageState: AUTH_STATE,
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE
			}
		},
		{
			name: 'expenses-laptop',
			testMatch: /expenses\.e2e\.ts$/,
			dependencies: [
				'setup',
				'journey',
				'checkin',
				'loans',
				'iphone',
				'android',
				'laptop',
				'marks',
				'expenses-iphone',
				'expenses-android'
			],
			use: {
				...devices['Desktop Chrome'],
				storageState: AUTH_STATE,
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE
			}
		},
		// A check-in with logged expenses changes the shared database (a balance, a check-in, the Visa),
		// so it runs alone after the expenses projects. It removes what it logged and restores the balance.
		{
			name: 'expenses-checkin',
			testMatch: /spent-vs-logged\.e2e\.ts$/,
			dependencies: [
				'setup',
				'journey',
				'checkin',
				'loans',
				'iphone',
				'android',
				'laptop',
				'marks',
				'expenses-iphone',
				'expenses-android',
				'expenses-laptop'
			],
			use: {
				...devices['iPhone 15'],
				storageState: AUTH_STATE,
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE
			}
		},
		// A restore replaces the shared household (and puts it back), so it runs alone, after the others.
		{
			name: 'backup',
			testMatch: /backup\.e2e\.ts$/,
			dependencies: [
				'setup',
				'journey',
				'checkin',
				'loans',
				'iphone',
				'android',
				'laptop',
				'marks',
				'expenses-iphone',
				'expenses-android',
				'expenses-laptop',
				'expenses-checkin'
			],
			use: {
				...devices['iPhone 15'],
				storageState: AUTH_STATE,
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE,
				extraHTTPHeaders: projectHeaders(64)
			}
		},
		// Changing the password ends every other session, including the one every project above starts
		// from. So this runs after all of them, alone, and changes the password back.
		{
			name: 'password',
			testMatch: /password\.e2e\.ts$/,
			dependencies: [
				'setup',
				'journey',
				'checkin',
				'loans',
				'iphone',
				'android',
				'laptop',
				'marks',
				'expenses-iphone',
				'expenses-android',
				'expenses-laptop',
				'expenses-checkin',
				'backup'
			],
			use: {
				...devices['Desktop Chrome'],
				storageState: AUTH_STATE,
				extraHTTPHeaders: PASSWORD_PROJECT_HEADERS
			}
		},
		// Starting over deletes the household every project above reads, so it runs after all of them.
		{
			name: 'reset',
			testMatch: /reset\.e2e\.ts$/,
			dependencies: [
				'setup',
				'journey',
				'checkin',
				'loans',
				'iphone',
				'android',
				'laptop',
				'marks',
				'expenses-iphone',
				'expenses-android',
				'expenses-laptop',
				'password'
			],
			use: { ...devices['Desktop Chrome'] }
		},
		// Owners of other pay rhythms start over, so this runs after everything, even the reset that leaves
		// the owner at setup. It signs in with the password and ends on a finished budget.
		{
			name: 'rhythm',
			testMatch: /rhythm\.e2e\.ts$/,
			dependencies: [
				'setup',
				'journey',
				'checkin',
				'loans',
				'iphone',
				'android',
				'laptop',
				'marks',
				'expenses-iphone',
				'expenses-android',
				'expenses-laptop',
				'expenses-checkin',
				'backup',
				'password',
				'reset'
			],
			use: {
				...devices['iPhone 15'],
				locale: 'en-US',
				timezoneId: JOURNEY_TIME_ZONE,
				extraHTTPHeaders: projectHeaders(65)
			}
		}
	],
	// The production build of the same server code, not the dev server: what ships is what is tested.
	// Production runs it on Netlify's functions, which no browser test can start, so the tests build
	// with adapter-node (PAYDAY_ADAPTER=node, see vite.config.ts) and run it as a plain Node process.
	// An in-memory database gives every run a fresh, migrated copy.
	webServer: {
		command: 'pnpm build && node build',
		url: `${ORIGIN}/health`,
		// The command is a full production build first. Right after the unit tests on a busy Windows
		// machine (pre-push), that has taken longer than Playwright's default 60 seconds.
		timeout: 180_000,
		reuseExistingServer: false,
		env: {
			PAYDAY_ADAPTER: 'node',
			HOST: '127.0.0.1',
			PROTOCOL_HEADER: 'x-forwarded-proto',
			// So the last project can present its own client address (PASSWORD_PROJECT_HEADERS): the
			// failed sign-ins the earlier projects make fill the one per-IP limit they share, and the
			// password tests make a few more. Requests with no such header still share one key.
			ADDRESS_HEADER: 'x-forwarded-for',
			PORT: String(PORT),
			ORIGIN,
			DATABASE_URL: 'memory://',
			// The production build refuses the first registration without it.
			OWNER_SETUP_CODE: SETUP_CODE
		}
	}
});
