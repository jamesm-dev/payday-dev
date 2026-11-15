import { expect, test } from './support/test.ts';
import { SIGNED_OUT } from './support/auth.ts';

/*
 * TSK-0a6680: the two projects for tests with more than one person (people-phone, people-laptop)
 * need a test of their own to exist, and this is the plainest true thing for them: a visitor with no
 * account yet is shown the sign-in form. It reads nothing of the shared owner's budget and signs in
 * as no one. Real two-person tests are added to these projects beside it, each creating its own accounts.
 */
test.describe('TSK-0a6680 a visitor at the door', () => {
	test.use({ storageState: SIGNED_OUT });

	test('sees the sign-in form, and is not let into anyone’s budget', async ({ page }) => {
		await page.goto('/schedule');
		await expect(page).toHaveURL(/\/signin/);
		await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
	});
});
