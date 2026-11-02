import { expect, test, type Page } from '@playwright/test';

/*
 * The date field: a calendar for a mouse, the phone's own picker on a phone. Read-only: a date is
 * picked and read back, and no form is ever submitted.
 */

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** Records every CSP violation the page reports. */
async function watchCsp(page: Page) {
	await page.evaluate(() => {
		const w = window as unknown as { __csp: string[] };
		w.__csp = [];
		document.addEventListener('securitypolicyviolation', (e) =>
			w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)
		);
	});
}
const violations = (page: Page) =>
	page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

async function sideways(page: Page) {
	return page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
}

async function exercise(page: Page, field: ReturnType<Page['getByLabel']>) {
	await watchCsp(page);
	const input = field;
	const open = input.locator('xpath=following-sibling::button[@aria-label="Choose a date"]');
	await expect(open).toBeVisible();
	await expect(open).toHaveAttribute('aria-haspopup', 'dialog');
	await expect(open).toHaveAttribute('aria-expanded', 'false');

	await open.click();
	const dialog = page.getByRole('dialog', { name: 'Choose a date' });
	await expect(dialog).toBeVisible();
	await expect(open).toHaveAttribute('aria-expanded', 'true');
	await expect(dialog.getByRole('button', { name: 'Previous month' })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Next month' })).toBeVisible();
	expect(await sideways(page)).toBeLessThanOrEqual(0);

	// A day cell is at least 40px, and the panel stays inside the window.
	const day = dialog.locator('button[part~="day"]:not([disabled])').first();
	const box = (await day.boundingBox())!;
	expect(box.width).toBeGreaterThanOrEqual(40);
	const panel = (await dialog.boundingBox())!;
	const view = page.viewportSize()!;
	expect(panel.x).toBeGreaterThanOrEqual(0);
	expect(panel.x + panel.width).toBeLessThanOrEqual(view.width);

	// Escape closes it and gives focus back to the button.
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(open).toBeFocused();

	// Picking a day fills the input, closes the calendar and focuses the input.
	await input.evaluate((el) => {
		(window as unknown as { __events: string[] }).__events = [];
		for (const type of ['input', 'change'])
			el.addEventListener(type, () =>
				(window as unknown as { __events: string[] }).__events.push(type)
			);
	});
	await open.click();
	await expect(dialog).toBeVisible();
	const target = dialog
		.locator('button[part~="day"]:not([disabled]):not([part~="outside"])')
		.first();
	const dayNumber = Number(((await target.getAttribute('aria-label')) ?? '').match(/(\d+)$/)![1]);
	await target.click();
	await expect(dialog).toBeHidden();
	const day2 = String(dayNumber).padStart(2, '0');
	await expect(input).toHaveValue(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
	expect((await input.inputValue()).endsWith(`-${day2}`)).toBe(true);
	await expect(input).toBeFocused();
	await input.blur();
	await expect(page.locator(`#${await input.getAttribute('id')}-text`)).toHaveText(
		/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} \d{4}$/
	);
	await input.focus();
	expect(await page.evaluate(() => (window as unknown as { __events: string[] }).__events)).toEqual(
		['input', 'change']
	);

	// Clicking outside closes it too.
	await open.click();
	await expect(dialog).toBeVisible();

	// The chosen day is an orange disc with dark text, like the brand mark.
	const selected = dialog.locator('button[part~="selected"]');
	await expect(selected).toHaveCSS('background-color', 'rgb(255, 107, 39)');
	await expect(selected).toHaveCSS('color', 'rgb(20, 20, 21)');
	await page.mouse.click(2, 2);
	await expect(dialog).toBeHidden();

	expect(await violations(page)).toEqual([]);
	expect(await sideways(page)).toBeLessThanOrEqual(0);
}

test.describe('the date field', () => {
	test('a new yearly bill: the calendar opens, picks a day and closes', async ({ page }) => {
		test.skip(isPhone(page), 'a phone keeps its own date picker');
		await page.goto('/schedule/new/bill');
		await page.getByRole('radio', { name: 'Every year' }).check();
		await exercise(page, page.getByLabel('Date of the next payment'));
	});

	test('the update-balance panel on Home: the calendar opens and picks a day', async ({ page }) => {
		test.skip(isPhone(page), 'a phone keeps its own date picker');
		await page.goto('/');
		await page.locator('#update-balance > summary').click();
		await exercise(page, page.getByLabel('True on'));
	});

	test('a phone keeps the native date input, with no calendar button', async ({ page }) => {
		test.skip(!isPhone(page), 'the calendar button is for a mouse');
		await page.goto('/schedule/new/bill');
		await page.getByRole('radio', { name: 'Every year' }).check();
		const input = page.getByLabel('Date of the next payment');
		await expect(input).toBeVisible();
		await expect(input).toHaveAttribute('type', 'date');
		// Give hydration a moment, then confirm the button never appears.
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('button', { name: 'Choose a date' })).toHaveCount(0);
		const box = (await input.boundingBox())!;
		expect(box.height).toBeGreaterThanOrEqual(44);
		expect(await sideways(page)).toBeLessThanOrEqual(0);
	});
});
