import { expect, test } from '@playwright/test';

test.describe('TSK-7EE732 the installed app opens with no network and says so', () => {
	test('with no network, reloading shows the offline page instead of an error', async ({
		page,
		context
	}) => {
		await page.goto('/');
		// Wait until the service worker has installed the shell and controls this page.
		await page.evaluate(async () => {
			await navigator.serviceWorker.ready;
			if (!navigator.serviceWorker.controller) {
				await new Promise((resolve) =>
					navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
				);
			}
		});

		await context.setOffline(true);
		await page.reload();

		await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
		// Pages are never served from the cache: the number must not appear while offline.
		await expect(page.getByTestId('safe-to-spend')).toHaveCount(0);
	});
});
