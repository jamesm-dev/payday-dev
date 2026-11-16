import { expect, test, type Browser, type Page } from './support/test.ts';
import { OWNER_EMAIL, OWNER_PASSWORD, projectHeaders, signInWithPassword } from './support/auth.ts';

/*
 * TSK-55c7a4, TSK-5ff868, TSK-be6817: the shared owner gave their email at the first registration
 * (every account has one, the owner's request on 2026-11-16), and the sign-in form requires it. This
 * runs in the owner-last project, after everything else, because it signs the shared owner out and
 * in again and changes nothing else.
 */

const EMAIL = OWNER_EMAIL;
const WRONG = 'That email or password is not right. Check both, then try again.';

/** Sign in on the form with an email and a password; the page either moves on or says why not. */
async function signInWith(page: Page, email: string, password = OWNER_PASSWORD) {
	await page.goto('/signin');
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect
		.poll(
			async () =>
				new URL(page.url()).pathname !== '/signin' || (await page.getByRole('alert').count()) > 0,
			{ timeout: 15_000 }
		)
		.toBe(true);
	await page.waitForLoadState('networkidle');
}

async function device(browser: Browser, baseURL: string) {
	const context = await browser.newContext({
		serviceWorkers: 'block',
		baseURL,
		storageState: { cookies: [], origins: [] },
		extraHTTPHeaders: projectHeaders(67)
	});
	return { context, page: await context.newPage() };
}

test.describe('TSK-55c7a4 the owner signs in with the email from the first registration', () => {
	test('a blank email is refused, and an email nobody has says the same as a wrong password', async ({
		page
	}) => {
		await signInWithPassword(page);
		await expect(page).not.toHaveURL(/\/signin/);
		await page.goto('/settings/security');
		await expect(page.getByTestId('owner-email')).toHaveText(EMAIL);

		await page.getByRole('main').getByRole('button', { name: 'Sign out', exact: true }).click();
		await expect(page).toHaveURL(/\/signin$/);

		// Blank: the browser asks for the email itself. Without that check, the site says so too.
		await page.waitForLoadState('networkidle');
		const email = page.getByLabel('Email', { exact: true });
		await expect(email).toHaveAttribute('required', '');
		await expect(page.getByText('leave it empty')).toHaveCount(0);
		await email.evaluate((el) => el.removeAttribute('required'));
		await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(page.getByRole('alert')).toContainText('Enter your email.');
		await expect(page).toHaveURL(/\/signin/);

		// An email nobody has, with the right password, says exactly what a wrong password says.
		await signInWith(page, 'nobody.at.all@example.test');
		await expect(page.getByRole('alert')).toContainText(WRONG);
	});

	test('the email and the password sign in, in any case, and go to the page asked for', async ({
		page
	}) => {
		await signInWith(page, 'FIRST.owner@example.TEST');
		await expect(page).not.toHaveURL(/\/signin/);
		await page.goto('/settings/security');
		await expect(page.getByTestId('owner-email')).toHaveText(EMAIL);
		await expect(page.getByText('You sign in with your password')).toBeVisible();
	});

	test('a wrong email or a bad one is refused in plain words, and keeps the old one', async ({
		page
	}) => {
		await signInWith(page, EMAIL);
		await page.goto('/settings/security');
		await page.getByLabel('New email', { exact: true }).fill('not-an-email');
		// The browser would stop an address with no @ itself; the server says it too.
		await page.getByLabel('New email', { exact: true }).evaluate((el) => {
			(el as HTMLInputElement).type = 'text';
		});
		await page.getByRole('button', { name: 'Change email' }).click();
		await expect(page.getByRole('alert')).toContainText('@');
		await expect(page.getByTestId('owner-email')).toHaveText(EMAIL);
	});

	test('"Sign out every other device" ends the other sessions and keeps this one', async ({
		page,
		browser,
		baseURL
	}) => {
		await signInWith(page, EMAIL);
		const other = await device(browser, baseURL!);
		await signInWith(other.page, EMAIL);
		await other.page.goto('/settings/security');
		await expect(other.page.getByTestId('owner-email')).toHaveText(EMAIL);

		await page.goto('/settings/security');
		await page.getByRole('button', { name: 'Sign out every other device' }).click();
		await expect(page.getByText('Every other device is signed out.')).toBeVisible();
		// This one is still signed in ...
		await page.goto('/settings/security');
		await expect(page.getByTestId('owner-email')).toHaveText(EMAIL);
		// ... the other is not.
		await other.page.goto('/settings/security');
		await expect(other.page).toHaveURL(/\/signin/);
		await other.context.close();
	});

	test('ends with the owner able to sign in with the email and the password', async ({
		browser,
		baseURL
	}) => {
		const fresh = await device(browser, baseURL!);
		await signInWith(fresh.page, EMAIL);
		await expect(fresh.page).not.toHaveURL(/\/signin/);
		await expect(fresh.page.getByTestId('safe-to-spend')).toBeVisible();
		await fresh.context.close();
	});
});
