import { expect, test } from '@playwright/test';

type Icon = { src: string; sizes: string; type: string; purpose: string };

test.describe('TSK-3924C2 the app is installable to the home screen', () => {
	test('links a manifest and an Apple touch icon from every page', async ({ page }) => {
		await page.goto('/');
		const origin = new URL(page.url()).origin;
		// The resolved href, not the attribute: Chromium rewrites the touch icon's to absolute.
		await expect(page.locator('link[rel="manifest"]')).toHaveJSProperty(
			'href',
			`${origin}/manifest.webmanifest`
		);
		await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveJSProperty(
			'href',
			`${origin}/apple-touch-icon.png`
		);
	});

	test('the manifest opens full-screen and has every icon an install needs', async ({
		request
	}) => {
		const manifest = await (await request.get('/manifest.webmanifest')).json();
		expect(manifest).toMatchObject({ name: 'Payday', start_url: '/', display: 'standalone' });

		const icons: Icon[] = manifest.icons;
		expect(icons.map((i) => `${i.sizes} ${i.purpose}`).sort()).toEqual([
			'192x192 any',
			'512x512 any',
			'512x512 maskable'
		]);

		for (const src of [...icons.map((i) => i.src), '/apple-touch-icon.png']) {
			const response = await request.get(src);
			expect(response.status(), src).toBe(200);
			expect(response.headers()['content-type'], src).toBe('image/png');
		}
	});
});
