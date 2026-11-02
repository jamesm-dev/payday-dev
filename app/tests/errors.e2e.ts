import { expect, test } from '@playwright/test';

test.describe('TSK-AE10FB errors show a plain page carrying the request id', () => {
	test('a missing page shows a plain error with the id from the response header', async ({
		page
	}) => {
		const response = await page.goto('/no-such-page');
		expect(response?.status()).toBe(404);

		const requestId = response?.headers()['x-request-id'];
		expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

		await expect(page.getByRole('heading', { name: "We can't find that page" })).toBeVisible();
		await expect(page.locator('.reference code')).toHaveText(requestId!);
	});
});
