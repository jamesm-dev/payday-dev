import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './support/googleApp.ts';
import type { BadToken } from './support/fakeGoogle.ts';
import type { Page } from './support/test.ts';
import { SIGNED_OUT } from './support/auth.ts';
import { newAddress, newEmail, PEOPLE_PASSWORD, presentAs, signUp } from './support/people.ts';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './support/googleApp.ts';

/*
 * Phase 12, "Ready for Google" (TSK-9a4d16, TSK-5c19e2): Continue with Google, tested against a fake
 * Google (tests/support/fakeGoogle.ts).
 *
 *   - The main test server keeps Google OFF: nothing says Google and its routes do not exist.
 *   - A second server from the same build has Google ON (tests/support/googleApp.ts), one per worker,
 *     with its own in-memory database, so the sign-ups here never touch the main server's limits.
 *
 * Everyone here is a new person with an address and (for Google) an account number of their own, so
 * nothing touches the shared owner's budget, and a sign-up costs the site one of its 30 an hour.
 */
test.use({ storageState: SIGNED_OUT });
test.setTimeout(90_000);

const newSub = () => `google-${randomBytes(8).toString('hex')}`;
const CODES_HEADING = 'Save your recovery codes';

/** Presses "Continue with Google" on the page it is on, and waits for the fake Google's form. */
async function startGoogle(page: Page) {
	await page.waitForLoadState('networkidle');
	await page.getByRole('link', { name: 'Continue with Google' }).click();
	await expect(page.getByRole('heading', { name: 'Fake Google' })).toBeVisible();
}

/** Fills the fake Google's form and sends the person back. */
async function chooseAccount(
	page: Page,
	account: { sub: string; email: string; verified?: boolean }
) {
	await page.getByLabel('Account number (sub)').fill(account.sub);
	await page.getByLabel('Google email').fill(account.email);
	if (account.verified === false) await page.getByLabel('Email verified').selectOption('false');
	await page.getByRole('button', { name: 'Sign in with this account' }).click();
}

/** Start from the page the person is on and choose an account; returns once Payday has answered. */
async function continueWithGoogle(page: Page, account: { sub: string; email: string }) {
	await startGoogle(page);
	await chooseAccount(page, account);
}

/** A new person, through Google, from an address of their own. Left on the page that shows the codes. */
async function newcomer(page: Page, account: { sub: string; email: string }) {
	await presentAs(page, newAddress());
	await page.goto('/signin/new');
	await continueWithGoogle(page, account);
	await expect(page.getByRole('heading', { name: CODES_HEADING })).toBeVisible();
}

/** The least guided setup asks for: pay, a balance, no bills, no loans. */
async function setUp(page: Page) {
	await page.getByRole('link', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/setup$/);
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByRole('heading', { name: 'Your currency and time zone' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your pay' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Pay each payday').fill('18,000.00');
	await page.getByLabel('Your last or next payday').fill('2026-01-09');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'What is in your account today?' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Balance', { exact: true }).fill('25,000.00');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Your bills' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: "That's all" }).click();
	await expect(page.getByRole('heading', { name: 'Loan payments' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: "That's all" }).click();
	await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
	await page.getByRole('button', { name: 'Open Payday' }).click();
	await expect(page.getByTestId('safe-to-spend')).toBeVisible();
	await page.waitForLoadState('networkidle');
}

const budgetNumber = async (page: Page) => (await page.getByTestId('safe-to-spend').textContent())!;

async function signOut(page: Page) {
	await page.goto('/settings');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
	await expect(page).toHaveURL(/\/signin$/);
	await page.goto('/schedule');
	await expect(page).toHaveURL(/\/signin\?next=%2Fschedule$/);
}

/** The plain flash a refusal leaves on the sign-in page (a status, not an alert: it is a notice, not a form error). */
const flashed = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

const SIGN_IN_EXPIRED = 'That Google sign-in took too long or was already used.';

/* ---------------------------------------------------------------------------------------------- */

test.describe('TSK-5c19e2 TSK-9a4d16 off: the main server says nothing about Google', () => {
	test('TSK-5c19e2 no sign-in, sign-up, privacy or security page mentions it, and its routes are 404', async ({
		page
	}) => {
		for (const path of ['/signin', '/signin/new']) {
			await page.goto(path);
			await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);
			await expect(page.locator('body')).not.toContainText('Continue with Google');
		}
		await page.goto('/privacy');
		await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Continue with Google' })).toHaveCount(0);
		await expect(page.locator('body')).not.toContainText('Google sends Payday');

		for (const path of ['/signin/google', '/signin/google/callback']) {
			const response = await page.goto(path);
			expect(response?.status(), path).toBe(404);
		}

		// Signed in, Settings › Security has no Google section, and its start address is 404 too.
		await signUp(page, { email: newEmail(), address: newAddress() });
		await page.goto('/settings/security');
		await expect(page.getByRole('heading', { name: 'Confirm it is you' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Google', exact: true })).toHaveCount(0);
		for (const text of ['Connect Google', 'Disconnect Google', 'Confirm with Google']) {
			await expect(page.getByText(text)).toHaveCount(0);
		}
		for (const path of [
			'/settings/security/google?intent=connect',
			'/settings/security/google?intent=confirm'
		]) {
			const response = await page.goto(path);
			expect(response?.status(), path).toBe(404);
		}
	});
});

test.describe('TSK-9a4d16 on: the Google server', () => {
	test.use({ googleOn: true });

	test('TSK-9a4d16 TSK-5c19e2 a newcomer gets codes once, reaches setup, and signs in again to the same account', async ({
		page
	}) => {
		const account = { sub: newSub(), email: newEmail() };
		await presentAs(page, newAddress());
		await page.goto('/signin/new');
		await continueWithGoogle(page, account);

		// Back from Google: the codes, shown once, and nothing from Google in the address bar.
		await expect(page.getByRole('heading', { name: CODES_HEADING })).toBeVisible();
		await expect(page).toHaveURL(/\/signin\/new$/);
		await expect(page.getByTestId('recovery-code')).toHaveCount(10);
		await expect(page.getByText('This is the only time they are shown.')).toBeVisible();

		// Continue goes on to setup, where the person makes a budget of their own.
		await setUp(page);
		const number = await budgetNumber(page);

		// Signing in again with the same Google account is the same account: no codes, the same budget.
		await signOut(page);
		await page.goto('/signin');
		await continueWithGoogle(page, account);
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		expect(await budgetNumber(page)).toBe(number);
		await expect(page.getByTestId('recovery-code')).toHaveCount(0);
		await expect(page.getByRole('heading', { name: CODES_HEADING })).toHaveCount(0);
	});

	test('TSK-9a4d16 an email that belongs to a password account is refused in plain words', async ({
		page
	}) => {
		const email = newEmail();
		await signUp(page, { email, address: newAddress() });
		await signOut(page);

		await presentAs(page, newAddress());
		await page.goto('/signin');
		// Any case: the match is on the normalised email, and no account is linked by it.
		await continueWithGoogle(page, { sub: newSub(), email: email.toUpperCase() });
		await expect(page).toHaveURL(/\/signin$/);
		await expect(
			flashed(
				page,
				'An account with this email already exists. Sign in with your password, then connect Google in Settings › Security.'
			)
		).toBeVisible();
		await page.goto('/schedule');
		await expect(page).toHaveURL(/\/signin\?next=%2Fschedule$/);
	});

	test('TSK-9a4d16 a person who signed up with a password connects Google and signs in with it to the same budget', async ({
		page
	}) => {
		await signUp(page, { email: newEmail(), address: newAddress() });
		await setUp(page);
		const number = await budgetNumber(page);

		// Signing up counts as a confirmation, so Connect Google is offered at once.
		await page.goto('/settings/security');
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { name: 'Google', exact: true })).toBeVisible();
		const sub = newSub();
		await page.getByRole('link', { name: 'Connect Google' }).click();
		await expect(page.getByRole('heading', { name: 'Fake Google' })).toBeVisible();
		await chooseAccount(page, { sub, email: newEmail() });
		await expect(page).toHaveURL(/\/settings\/security$/);
		await expect(page.getByText('Google is connected.')).toBeVisible();
		await expect(page.getByText('Connected to Google. You can use it to sign in.')).toBeVisible();

		await signOut(page);
		await page.goto('/signin');
		await continueWithGoogle(page, { sub, email: newEmail() });
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		expect(await budgetNumber(page)).toBe(number);
		await expect(page.getByTestId('recovery-code')).toHaveCount(0);
	});

	test('TSK-9a4d16 disconnecting the last way in is refused, and allowed once there is a password', async ({
		page
	}) => {
		const account = { sub: newSub(), email: newEmail() };
		await newcomer(page, account);

		// Google is this person's only way in (bar the codes): a Google sign-in counts as a confirmation.
		await page.goto('/settings/security');
		await page.waitForLoadState('networkidle');
		await expect(page.getByText('Connected to Google. You can use it to sign in.')).toBeVisible();
		await page.getByRole('button', { name: 'Disconnect Google' }).click();
		await expect(page.getByRole('alert')).toContainText(
			'Add a password or a device first, so you can still sign in.'
		);
		await expect(page.getByText('Connected to Google. You can use it to sign in.')).toBeVisible();

		// A password is another way in: now Google can go.
		await page.goto('/settings/security/password');
		await page.waitForLoadState('networkidle');
		await page.getByLabel('New password', { exact: true }).fill(PEOPLE_PASSWORD);
		await page.getByLabel('Type the new password again').fill(PEOPLE_PASSWORD);
		const saved = page.waitForResponse(
			(r) =>
				r.request().method() === 'POST' &&
				new URL(r.url()).pathname === '/settings/security/password'
		);
		await page.getByRole('button', { name: 'Save new password' }).click();
		expect((await saved).status()).toBeLessThan(400);
		await page.waitForLoadState('networkidle');

		await page.goto('/settings/security');
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Disconnect Google' }).click();
		await expect(page.getByText('Google is disconnected.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'Connect Google' })).toBeVisible();

		// It no longer opens the account: the email is still the account's, so a new account is refused.
		await signOut(page);
		await presentAs(page, newAddress());
		await page.goto('/signin');
		await continueWithGoogle(page, account);
		await expect(flashed(page, 'An account with this email already exists')).toBeVisible();
		await page.goto('/schedule');
		await expect(page).toHaveURL(/\/signin\?next=%2Fschedule$/);
	});

	test('TSK-9a4d16 a token that does not check out is refused, and nobody is signed in', async ({
		page,
		googleApp
	}) => {
		for (const kind of ['wrong-aud', 'expired', 'wrong-nonce'] satisfies BadToken[]) {
			await presentAs(page, newAddress());
			await page.goto('/signin');
			googleApp.provider.failNext(kind);
			await continueWithGoogle(page, { sub: newSub(), email: newEmail() });
			await expect(flashed(page, 'Google sign-in did not work.'), kind).toBeVisible();
			await page.goto('/schedule');
			await expect(page).toHaveURL(/\/signin\?next=%2Fschedule$/);
		}
	});

	test('TSK-9a4d16 a cancelled Google sign-in says so', async ({ page }) => {
		await presentAs(page, newAddress());
		await page.goto('/signin');
		await startGoogle(page);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(flashed(page, 'Google sign-in was cancelled.')).toBeVisible();
	});

	test('TSK-9a4d16 a callback that is replayed is refused', async ({ page, context }) => {
		await presentAs(page, newAddress());
		await page.goto('/signin/new');
		await startGoogle(page);
		const flowCookie = (await context.cookies()).find((c) => /google-flow$/.test(c.name));
		expect(flowCookie, 'the flow cookie is set while Google has the person').toBeTruthy();

		const callback = page.waitForRequest(
			(r) => new URL(r.url()).pathname === '/signin/google/callback'
		);
		await chooseAccount(page, { sub: newSub(), email: newEmail() });
		const callbackUrl = (await callback).url();
		await expect(page.getByRole('heading', { name: CODES_HEADING })).toBeVisible();

		await signOut(page);
		// Even with the browser's own flow cookie back, the one-time state and code are used up.
		await context.addCookies([flowCookie!]);
		await page.goto(callbackUrl);
		await expect(flashed(page, SIGN_IN_EXPIRED)).toBeVisible();
		await page.goto('/schedule');
		await expect(page).toHaveURL(/\/signin\?next=%2Fschedule$/);
	});

	test('TSK-9a4d16 a callback opened in another browser is refused', async ({
		page,
		browser,
		googleApp
	}) => {
		await presentAs(page, newAddress());
		await page.goto('/signin/new');
		await startGoogle(page);

		// Google holds the person back, so this browser never uses the return address: it is carried
		// to another browser instead.
		googleApp.provider.holdNextReturn();
		await chooseAccount(page, { sub: newSub(), email: newEmail() });
		const callbackUrl = (await page
			.getByRole('link', { name: 'Return to Payday' })
			.getAttribute('href'))!;
		expect(new URL(callbackUrl).pathname).toBe('/signin/google/callback');

		const other = await browser.newContext({
			baseURL: googleApp.baseURL,
			storageState: SIGNED_OUT,
			serviceWorkers: 'block',
			extraHTTPHeaders: { 'x-forwarded-proto': 'http', 'x-forwarded-for': newAddress() }
		});
		try {
			const stranger = await other.newPage();
			await stranger.goto(callbackUrl);
			await expect(flashed(stranger, SIGN_IN_EXPIRED)).toBeVisible();
			await stranger.goto('/schedule');
			await expect(stranger).toHaveURL(/\/signin\?next=%2Fschedule$/);
		} finally {
			await other.close();
		}
	});
});

/*
 * /privacy is PRERENDERED at build (gap 7): which sentence it holds is fixed when the app is built,
 * from the build's own environment, not when the server starts. So the Google server above, which
 * runs the shared build made with Google off, serves the notice WITHOUT the paragraph, exactly as
 * production does until a new deploy. The honest proof is a second build with the variables set:
 * made from a copy of the sources (node_modules shared through a junction), it takes seconds. The
 * unit test beside the page covers its load function; this proves the prerender reads the env.
 */
test.describe('TSK-9a4d16 TSK-5c19e2 the privacy notice follows the build', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'one build is enough');
	test.setTimeout(240_000);

	test('TSK-9a4d16 a build made with the Google variables prerenders the Google paragraph, and never the keys', async () => {
		const app = fileURLToPath(new URL('../', import.meta.url));
		const copy = mkdtempSync(join(tmpdir(), 'payday-google-build-'));
		const link = join(copy, 'node_modules');
		try {
			for (const name of [
				'src',
				'static',
				'drizzle',
				'package.json',
				'pnpm-workspace.yaml',
				'.npmrc',
				'tsconfig.json',
				'vite.config.ts'
			]) {
				cpSync(join(app, name), join(copy, name), { recursive: true });
			}
			symlinkSync(join(app, 'node_modules'), link, 'junction');
			const build = (extra: Record<string, string>) =>
				execFileSync(process.execPath, [join(link, 'vite', 'bin', 'vite.js'), 'build'], {
					cwd: copy,
					env: {
						...process.env,
						PAYDAY_ADAPTER: 'node',
						GOOGLE_CLIENT_ID: '',
						GOOGLE_CLIENT_SECRET: '',
						...extra
					},
					stdio: 'pipe',
					timeout: 180_000
				});
			const privacy = () => readFileSync(join(copy, 'build/prerendered/privacy.html'), 'utf8');

			build({ GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET });
			const on = privacy();
			expect(on).toContain('Continue with Google');
			expect(on).toMatch(/Google sends Payday only your Google account number/);
			expect(on).not.toContain(GOOGLE_CLIENT_ID);
			expect(on).not.toContain(GOOGLE_CLIENT_SECRET);

			// The same sources with the variables empty: the paragraph is gone again.
			build({});
			const off = privacy();
			expect(off).not.toContain('Continue with Google');
			expect(off).not.toContain('Google sends Payday');
		} finally {
			// Remove the junction itself first: deleting the copy must never reach the real node_modules.
			try {
				unlinkSync(link);
			} catch {
				// never made
			}
			rmSync(copy, { recursive: true, force: true });
		}
	});
});
