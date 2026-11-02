import { expect, test } from '@playwright/test';

/*
 * The background glow follows the mouse on a laptop and stays still on a phone (src/lib/glow/glow.js,
 * src/routes/+layout.svelte). Read-only: it only moves the mouse.
 */

const glowX = () => document.documentElement.style.getPropertyValue('--glow-x');

test.describe('the background glow', () => {
	test('follows the mouse on a laptop, without breaking the content security policy', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'laptop', 'Only a laptop has a mouse to follow.');
		await page.addInitScript(() => {
			(window as unknown as { cspViolations: string[] }).cspViolations = [];
			document.addEventListener('securitypolicyviolation', (event) =>
				(window as unknown as { cspViolations: string[] }).cspViolations.push(
					`${event.violatedDirective} ${event.blockedURI}`
				)
			);
		});
		// A page that sends no other script: the glow still runs there.
		await page.goto('/plan');
		const viewport = page.viewportSize()!;
		await page.mouse.move(viewport.width * 0.9, viewport.height * 0.8);
		await expect
			.poll(async () => Number(await page.evaluate(glowX)), { timeout: 5000 })
			.toBeGreaterThan(0.6);
		// The two corner glows drift; nothing follows the pointer itself.
		expect(await page.evaluate(() => getComputedStyle(document.body, '::after').content)).toBe(
			'none'
		);
		// The script is a file of its own, never inlined (the CSP blocks inline and data: scripts).
		const src = await page.locator('head script[src*="glow"]').getAttribute('src');
		expect(src).not.toMatch(/^data:/);
		expect(
			await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)
		).toEqual([]);
	});

	test('stays still on a phone', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'laptop', 'Phones only.');
		await page.goto('/plan');
		await page.touchscreen.tap(200, 300).catch(() => {});
		expect(await page.evaluate(glowX)).toBe('');
	});
});
