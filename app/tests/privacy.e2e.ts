import { expect, test } from './support/test.ts';
import { SIGNED_OUT } from './support/auth.ts';

/*
 * TSK-99efff: the privacy notice and the terms of use. Public and read-only, so they run with the
 * other read-only projects.
 */

test.describe('TSK-99efff the privacy notice and the terms are public', () => {
	test.use({ storageState: SIGNED_OUT });

	test('TSK-99efff each is a 200 for a signed-out visit', async ({ request }) => {
		for (const path of ['/privacy', '/terms']) {
			const response = await request.get(path, {
				headers: { accept: 'text/html' },
				maxRedirects: 0
			});
			expect(response.status(), path).toBe(200);
		}
	});

	test('TSK-99efff the privacy notice has its sections, a title and a canonical address', async ({
		page
	}) => {
		await page.goto('/privacy');
		await expect(page).toHaveTitle(/Privacy notice/);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			'href',
			'https://payday-birc.netlify.app/privacy'
		);
		await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
		for (const name of [
			'What Payday keeps',
			'Why, and for how long',
			'Where it is kept',
			'Email',
			'No selling, no ads, no tracking',
			'Your rights',
			'Who to contact'
		]) {
			await expect(page.getByRole('heading', { name }), name).toBeVisible();
		}
		const text = await page.locator('main').innerText();
		for (const word of [
			'Netlify',
			'Supabase',
			'us-east-2',
			'Data Privacy Act of 2012',
			'Last updated'
		]) {
			expect(text).toContain(word);
		}
		await expect(page.locator('nav')).toHaveCount(0);
	});

	test('TSK-99efff the terms have their sections, a title and a canonical address', async ({
		page
	}) => {
		await page.goto('/terms');
		await expect(page).toHaveTitle(/Terms of use/);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			'href',
			'https://payday-birc.netlify.app/terms'
		);
		for (const name of [
			'What Payday is',
			'Your recovery codes',
			'Be fair',
			'Changes and the end of the service',
			'Who to contact'
		]) {
			await expect(page.getByRole('heading', { name }), name).toBeVisible();
		}
		await expect(page.locator('nav')).toHaveCount(0);
	});

	test('TSK-99efff both are in the sitemap', async ({ request }) => {
		const body = await (await request.get('/sitemap.xml')).text();
		expect(body).toContain('<loc>https://payday-birc.netlify.app/privacy</loc>');
		expect(body).toContain('<loc>https://payday-birc.netlify.app/terms</loc>');
	});

	test('TSK-99efff the product page and the sign-in page link to both', async ({ page }) => {
		for (const path of ['/', '/signin']) {
			await page.goto(path);
			await expect(page.getByRole('link', { name: 'Privacy notice' }), path).toHaveAttribute(
				'href',
				/\/privacy$/
			);
			await expect(page.getByRole('link', { name: 'Terms of use' }), path).toHaveAttribute(
				'href',
				/\/terms$/
			);
		}
	});

	test('TSK-99efff neither scrolls sideways at 320 px', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		for (const path of ['/privacy', '/terms']) {
			await page.goto(path);
			const wide = await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			);
			expect(wide, path).toBe(false);
		}
	});
});

test.describe('TSK-99efff Settings links to both pages', () => {
	test('TSK-99efff the links are in Settings', async ({ page }) => {
		await page.goto('/settings');
		// Exact: the "Your account" row's description mentions the privacy notice too.
		await expect(page.getByRole('link', { name: 'Privacy notice', exact: true })).toHaveAttribute(
			'href',
			/\/privacy$/
		);
		await expect(page.getByRole('link', { name: 'Terms of use', exact: true })).toHaveAttribute(
			'href',
			/\/terms$/
		);
	});
});
