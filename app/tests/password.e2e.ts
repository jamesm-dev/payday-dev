import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	expectSignedOut,
	NEW_PASSWORD,
	OWNER_PASSWORD,
	PASSWORD_PROJECT_HEADERS,
	readOwner,
	SIGNED_OUT,
	signInWithPassword
} from './support/auth.ts';

/*
 * These tests CHANGE the owner's password, which ends every other session, including the one the
 * other projects start from (storageState). So it runs after them all (playwright.config.ts); only
 * the reset project, which signs in afresh, runs later. Each test also puts the password back, so a
 * test can be re-run alone.
 *
 * One recovery code is spent here: the laptop project's spare, index 8 (auth.e2e.ts leaves it).
 */

const SPARE_CODE = 8;

async function freshPage(browser: Browser, baseURL: string) {
	const context = await browser.newContext({
		baseURL,
		storageState: SIGNED_OUT,
		extraHTTPHeaders: PASSWORD_PROJECT_HEADERS
	});
	return { context, page: await context.newPage() };
}

async function submitPasswordChange(
	page: Page,
	{ current, password, again }: { current?: string; password: string; again?: string }
) {
	await page.goto('/settings/security/password');
	if (current !== undefined) await page.getByLabel(/^Current password/).fill(current);
	await page.getByLabel('New password', { exact: true }).fill(password);
	await page.getByLabel('Type the new password again').fill(again ?? password);
	await page.getByRole('button', { name: 'Save new password' }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('TSK-2F1582 changing the password', () => {
	test('needs the current password, is judged by the policy, and ends every other session', async ({
		browser,
		baseURL,
		page
	}) => {
		// Another device, signed in with the password.
		const other = await freshPage(browser, baseURL!);
		await signInWithPassword(other.page);
		await expect(other.page.getByTestId('safe-to-spend')).toBeVisible();

		// A wrong current password, a weak one, a mismatch and the setup code are all refused.
		await submitPasswordChange(page, { current: 'not my password', password: NEW_PASSWORD });
		await expect(page.getByRole('alert')).toContainText('current password is not right');
		await submitPasswordChange(page, { current: OWNER_PASSWORD, password: 'short' });
		await expect(page.getByRole('alert')).toContainText('at least 12 characters');
		await submitPasswordChange(page, {
			current: OWNER_PASSWORD,
			password: NEW_PASSWORD,
			again: `${NEW_PASSWORD}!`
		});
		await expect(page.getByRole('alert')).toContainText('not the same');
		await submitPasswordChange(page, {
			current: OWNER_PASSWORD,
			password: 'please use e2e-setup-code here'
		});
		await expect(page.getByRole('alert')).toContainText('setup code');
		// None of that changed anything: the other device is still signed in.
		await other.page.goto('/');
		await expect(other.page.getByTestId('safe-to-spend')).toBeVisible();

		await submitPasswordChange(page, { current: OWNER_PASSWORD, password: NEW_PASSWORD });
		await expect(page).toHaveURL(/\/settings\/security$/);

		// This session stays; the other one is gone.
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();
		await expectSignedOut(other.page);
		await other.context.close();

		// The new password signs in; the old one no longer does.
		const fresh = await freshPage(browser, baseURL!);
		await signInWithPassword(fresh.page, NEW_PASSWORD);
		await expect(fresh.page.getByTestId('safe-to-spend')).toBeVisible();
		const old = await freshPage(browser, baseURL!);
		await signInWithPassword(old.page, OWNER_PASSWORD);
		await expect(old.page.getByRole('alert')).toContainText('That password is not right.');
		await old.context.close();

		// Put it back, from the session that is still signed in.
		await submitPasswordChange(page, { current: NEW_PASSWORD, password: OWNER_PASSWORD });
		await expect(page).toHaveURL(/\/settings\/security$/);
		await expectSignedOut(fresh.page);
		await fresh.context.close();
		const again = await freshPage(browser, baseURL!);
		await signInWithPassword(again.page);
		await expect(again.page.getByTestId('safe-to-spend')).toBeVisible();
		await again.context.close();
	});
});

test.describe('TSK-E31665 a recovery-code sign-in leads to setting a new password', () => {
	test('without the old one, once it has confirmed itself new recovery codes work too', async ({
		browser,
		baseURL
	}) => {
		// A recovery-code sign-in is not a confirmation, but it is inside its own 10-minute window,
		// so it may skip the old password. A server that forgets the window is covered by the unit
		// tests; here we check what the page says to a session in the window.
		const { context, page } = await freshPage(browser, baseURL!);
		await page.goto('/signin');
		await page.getByText('Use a recovery code').click();
		await page.getByLabel('Recovery code').fill(readOwner().recoveryCodes[SPARE_CODE]);
		await page.getByRole('button', { name: 'Sign in with recovery code' }).click();

		// Straight to "set a new password", with the old one optional.
		await expect(page).toHaveURL(/\/settings\/security\/password/);
		await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
		await expect(page.getByText('you can choose a new password without the old one')).toBeVisible();
		await expect(page.getByLabel(/^Current password/)).not.toHaveAttribute('required', '');

		// Not a step-up: the security page still asks to confirm before anything sensitive.
		await page.goto('/settings/security');
		await expect(page.getByText('Confirmed.')).toHaveCount(0);
		await page.getByLabel('Password', { exact: true }).fill('not the password at all');
		await page.getByRole('button', { name: 'Confirm with your password' }).click();
		await expect(page.getByRole('alert')).toContainText('That password is not right.');
		await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
		await page.getByRole('button', { name: 'Confirm with your password' }).click();
		await expect(page.getByText('Confirmed.')).toBeVisible();

		// Now new recovery codes work, and the old set is replaced.
		await page.getByRole('button', { name: 'Make new recovery codes' }).click();
		await expect(page.getByText('Your new codes.')).toBeVisible();
		const codes = (await page.getByTestId('recovery-code').allTextContents()).map((c) => c.trim());
		expect(codes).toHaveLength(10);
		await context.close();

		// The forgotten-password path: a new code, a new password, no old one asked for.
		const lost = await freshPage(browser, baseURL!);
		await lost.page.goto('/signin');
		await lost.page.getByText('Use a recovery code').click();
		await lost.page.getByLabel('Recovery code').fill(codes[0]);
		await lost.page.getByRole('button', { name: 'Sign in with recovery code' }).click();
		await expect(lost.page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
		await lost.page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
		await lost.page.getByLabel('Type the new password again').fill(NEW_PASSWORD);
		await lost.page.getByRole('button', { name: 'Save new password' }).click();
		await expect(lost.page.getByTestId('safe-to-spend')).toBeVisible();

		// It worked, and it ended the other sessions: the storageState session is gone too.
		const check = await freshPage(browser, baseURL!);
		await signInWithPassword(check.page, NEW_PASSWORD);
		await expect(check.page.getByTestId('safe-to-spend')).toBeVisible();
		await check.context.close();

		// Put it back. This session just set the password, but did not type the old one, so it
		// types it now (the recovery window may also be over).
		await submitPasswordChange(lost.page, { current: NEW_PASSWORD, password: OWNER_PASSWORD });
		await expect(lost.page).toHaveURL(/\/settings\/security$/);
		await lost.context.close();
		const final = await freshPage(browser, baseURL!);
		await signInWithPassword(final.page);
		await expect(final.page.getByTestId('safe-to-spend')).toBeVisible();
		await final.context.close();
	});
});
