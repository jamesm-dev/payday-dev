import { defineConfig, devices } from '@playwright/test';
import webpush from 'web-push';
import {
	AUTH_STATE,
	PASSWORD_PROJECT_HEADERS,
	projectHeaders,
	SETUP_CODE
} from './tests/support/auth.ts';
import { JOURNEY_TIME_ZONE } from './tests/support/household.ts';

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;

// Reminders need a VAPID key pair. The tests make their own, fresh on every run, and never send
// anything: no phone is subscribed, and the one synthetic subscription points at a name that
// cannot resolve.
const VAPID = webpush.generateVAPIDKeys();

export default defineConfig({
	testDir: 'tests',
	testMatch: '**/*.e2e.ts',
	forbidOnly: !!process.env.CI,
	// JUnit for /setup, which records each run against the task id in the test's name.
	reporter: [['list'], ['junit', { outputFile: 'reports/playwright.xml' }]],
	// adapter-node builds the request URL as https://<Host> unless PROTOCOL_HEADER names a header that
	// says otherwise (it ignores ORIGIN). Behind Fly's proxy that default is right; here the server is
	// plain http, and passkeys check the origin exactly, so the browser says so on every request.
	use: { baseURL: ORIGIN, extraHTTPHeaders: { 'x-forwarded-proto': 'http' } },
	// The iPhone's engine is WebKit: it is where installing and, in Phase 1, passkeys can differ.
	// `setup` runs first: it registers the owner with a password (and adds a passkey) and saves the
	// session, which the other projects start from, so every existing test runs signed in behind the guard.
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.ts$/, use: { ...devices['Desktop Chrome'] } },
		// All projects share ONE server and ONE in-memory database, so the one journey that changes
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
			testIgnore: /(journey|checkin|loans|marks|expenses|spent-vs-logged|password|reset)\.e2e\.ts$/,
			use: {
				...devices['iPhone 15'],
				storageState: AUTH_STATE,
				extraHTTPHeaders: projectHeaders(61)
			}
		},
		{
			name: 'android',
			dependencies: ['setup', 'journey', 'checkin', 'loans'],
			testIgnore: /(journey|checkin|loans|marks|expenses|spent-vs-logged|password|reset)\.e2e\.ts$/,
			use: {
				...devices['Pixel 7'],
				storageState: AUTH_STATE,
				extraHTTPHeaders: projectHeaders(62)
			}
		},
		{
			name: 'laptop',
			dependencies: ['setup', 'journey', 'checkin', 'loans'],
			testIgnore: /(journey|checkin|loans|marks|expenses|spent-vs-logged|password|reset)\.e2e\.ts$/,
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
				'expenses-checkin'
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
		}
	],
	// The production server, not the dev server: what ships is what is tested. An in-memory
	// database gives every run a fresh, migrated copy.
	webServer: {
		command: 'pnpm build && node build',
		url: `${ORIGIN}/health`,
		reuseExistingServer: false,
		env: {
			HOST: '127.0.0.1',
			PROTOCOL_HEADER: 'x-forwarded-proto',
			// So the last project can present its own client address (PASSWORD_PROJECT_HEADERS): the
			// failed sign-ins the earlier projects make fill the one per-IP limit they share, and the
			// password tests make a few more. Requests with no such header still share one key.
			ADDRESS_HEADER: 'x-forwarded-for',
			PORT: String(PORT),
			ORIGIN,
			DATABASE_URL: ':memory:',
			// The production build refuses the first registration without it.
			OWNER_SETUP_CODE: SETUP_CODE,
			VAPID_PUBLIC_KEY: VAPID.publicKey,
			VAPID_PRIVATE_KEY: VAPID.privateKey,
			VAPID_SUBJECT: 'mailto:e2e@example.invalid'
		}
	}
});
