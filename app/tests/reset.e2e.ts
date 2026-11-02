import { expect, test } from '@playwright/test';
import { SIGNED_OUT, signInWithPassword } from './support/auth.ts';

/*
 * Starting over DELETES the shared household every other project reads. So this is the very last
 * project (playwright.config.ts), after even the password project: nothing runs after it.
 *
 * It signs in fresh, because the password project ended the session the others start from, and a
 * password sign-in is itself the confirmation starting over needs.
 */

const HEADERS = { 'x-forwarded-proto': 'http', 'x-forwarded-for': '203.0.113.51' };

test('the owner deletes the budget and sets up again, still signed in', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({
		baseURL,
		storageState: SIGNED_OUT,
		extraHTTPHeaders: HEADERS
	});
	const page = await context.newPage();
	await signInWithPassword(page);
	await expect(page.getByTestId('safe-to-spend')).toBeVisible();

	const startOver = () => page.getByRole('region', { name: 'Start over' });
	const word = () => startOver().getByLabel('Type DELETE to confirm');
	const button = () => startOver().getByRole('button', { name: 'Delete my budget and start over' });

	// Anything but the word deletes nothing, and says so beside the field.
	await page.goto('/settings/security');
	await word().fill('delete it');
	await button().click();
	await expect(startOver().getByRole('alert')).toContainText('Nothing was deleted');
	await expect(word()).toHaveAttribute('aria-invalid', 'true');
	await page.goto('/');
	await expect(page.getByTestId('safe-to-spend')).toBeVisible();

	await page.goto('/settings/security');
	await word().fill('DELETE');
	await button().click();
	await expect(page).toHaveURL(/\/setup$/);
	await expect(page.getByText('Your budget was deleted.')).toBeVisible();
	await expect(page.getByRole('heading', { name: "Let's set up Payday" })).toBeVisible();

	// Still signed in: every page leads to setup, not to the sign-in form.
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup$/);
	await context.close();

	// And the same password still opens Payday, on another device too.
	const other = await browser.newContext({
		baseURL,
		storageState: SIGNED_OUT,
		extraHTTPHeaders: HEADERS
	});
	const again = await other.newPage();
	await signInWithPassword(again);
	await expect(again).toHaveURL(/\/setup$/);
	await other.close();
});
