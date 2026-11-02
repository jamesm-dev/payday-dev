import { expect, test } from '@playwright/test';

/*
 * The About page: what Payday is, that tateru built it, and three links out. Read-only.
 */

test.describe('the About page', () => {
	test('Settings opens it, and it links to tateru, the author and the coffee page', async ({
		page
	}) => {
		await page.goto('/settings');
		await page.getByRole('link', { name: /About Payday/ }).click();
		await expect(page).toHaveURL(/\/about$/);
		await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
		await expect(page.getByText('safe to spend until your next payday')).toBeVisible();
		await expect(page.getByText('tateru', { exact: true })).toBeVisible();

		for (const [testid, href] of [
			['tateru-link', 'https://github.com/jamesm-dev/tateru.dev'],
			['github-link', 'https://github.com/jamesm-dev'],
			['coffee-link', 'https://buymeacoffee.com/jamesm.dev']
		]) {
			const link = page.getByTestId(testid);
			await expect(link).toHaveAttribute('href', href);
			await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
		}
		// Plain text and links: the page sends no script of its own.
		expect(await page.locator('script[type="module"]').count()).toBe(0);
	});
});
