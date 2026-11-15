import { expect, test } from '@playwright/test';

test.describe('TSK-7EE732 the installed app opens with no network and says so', () => {
	// The one test that needs the service worker; playwright.config.ts blocks it for the rest.
	test.use({ serviceWorkers: 'allow' });

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
		// The browser can take a moment to put the service worker offline too, and until then a
		// reload still reaches the server and shows the number. Reload until the offline page shows.
		// A page served from a cache would never show it, so this still fails if a page is cached.
		await expect(async () => {
			await page.reload();
			await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible({
				timeout: 2_000
			});
		}).toPass({ timeout: 20_000 });
		// Pages are never served from the cache: the number must not appear while offline.
		await expect(page.getByTestId('safe-to-spend')).toHaveCount(0);
	});
});
