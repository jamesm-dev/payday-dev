import { expect, test, type Page } from '@playwright/test';
import { ITEM_ID } from './support/household.ts';

/*
 * Read-only checks of the home, plan and schedule screens: page headers, tappable rows, section
 * Add buttons, the field-and-button alignment, and the phone-only Settings gear. Nothing here
 * submits a form; the saved-message check that changes data is in marks.e2e.ts.
 */

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

async function box(locator: ReturnType<Page['locator']>) {
	const b = await locator.boundingBox();
	expect(b).not.toBeNull();
	return b!;
}

test.describe('page headers', () => {
	test('the plan and the bills list have a title and a description, and no back link', async ({
		page
	}) => {
		await page.goto('/plan');
		await expect(
			page.getByRole('heading', { name: 'Your next six paychecks', level: 1 })
		).toBeVisible();
		await expect(page.locator('.page-header .description')).toContainText('Each paycheck pays');
		await page.goto('/schedule');
		await expect(page.getByRole('heading', { name: 'Pay and bills', level: 1 })).toBeVisible();
		await expect(page.locator('.page-header .description')).toContainText(
			'Everything Payday knows'
		);
		await expect(page.locator('.page-header .back-link')).toHaveCount(0);
	});

	test('an item and the add form lead back to Pay and bills', async ({ page }) => {
		await page.goto(`/schedule/${ITEM_ID.rent}`);
		await expect(page.getByRole('heading', { name: 'Rent', level: 1 })).toBeVisible();
		const back = page.getByRole('link', { name: 'Back to Pay and bills' });
		await expect(back).toHaveAttribute('href', /\/schedule$/);
		await expect(page.locator('.page-header .description')).toContainText('Every month');
		await expect(page.getByText(/^Back to pay and bills$/)).toHaveCount(0);

		await page.goto('/schedule/new/bill');
		await expect(page.getByRole('heading', { name: 'Add a bill', level: 1 })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Back to Pay and bills' })).toHaveAttribute(
			'href',
			/\/schedule$/
		);
	});
});

test.describe('the bills list', () => {
	test('each row is one link, at least 56px tall, with a chevron', async ({ page }) => {
		await page.goto('/schedule');
		const items = page.getByTestId('list-bill').getByRole('listitem');
		expect(await items.count()).toBeGreaterThan(0);
		for (const item of await items.all()) {
			await expect(item.getByRole('link')).toHaveCount(1);
			const link = item.locator('a.row');
			expect((await box(link)).height).toBeGreaterThanOrEqual(56);
			const chevron = await link.evaluate((a) => getComputedStyle(a, '::after').content);
			expect(chevron).not.toBe('none');
		}
		// Opening a row goes to the item.
		const rent = page.getByRole('link', { name: 'Rent', exact: true });
		await expect(rent).toHaveAttribute('href', new RegExp(`/schedule/${ITEM_ID.rent}$`));
	});

	test('each section has an Add button, level with its heading', async ({ page }) => {
		await page.goto('/schedule');
		for (const [heading, add] of [
			['Pay', 'Add pay'],
			['Bills', 'Add a bill'],
			['Loan payments', 'Add a loan payment']
		] as const) {
			const link = page.getByRole('link', { name: add, exact: true });
			await expect(link).toBeVisible();
			await expect(link).toHaveClass(/secondary/);
			expect((await box(link)).height).toBeGreaterThanOrEqual(44);
			const title = await box(page.getByRole('heading', { name: heading, exact: true }));
			const button = await box(link);
			const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
			expect(Math.abs(centre(title) - centre(button))).toBeLessThanOrEqual(2);
		}
	});
});

test.describe('a field and its button', () => {
	test('the balance panel on Home: aligned on a laptop, stacked on a phone', async ({ page }) => {
		await page.goto('/');
		await page
			.locator('details#update-balance')
			.evaluate((d: HTMLDetailsElement) => (d.open = true));
		const input = await box(page.locator('#balance-amount'));
		const date = await box(page.locator('#balance-asOf'));
		const save = await box(page.getByRole('button', { name: 'Save balance' }));
		if (isPhone(page)) {
			expect(save.y).toBeGreaterThanOrEqual(date.y + date.height - 1);
			expect(date.y).toBeGreaterThanOrEqual(input.y + input.height - 1);
		} else {
			expect(Math.abs(save.y + save.height - (input.y + input.height))).toBeLessThanOrEqual(1);
			expect(Math.abs(save.y + save.height - (date.y + date.height))).toBeLessThanOrEqual(1);
		}
	});

	test('"Change one payment" and "Stop this" on an item', async ({ page }) => {
		await page.goto(`/schedule/${ITEM_ID.rent}`);
		const first = page.getByTestId('payments').getByRole('listitem').first();
		await first.locator('summary').click();
		const date = await box(first.locator('input[name="date"]'));
		const amount = await box(first.locator('input[name="amount"]'));
		const save = await box(first.getByRole('button', { name: 'Save this change' }));
		const end = page.getByRole('button', { name: 'End it' });
		await end.scrollIntoViewIfNeeded();
		const endDate = await box(page.locator('#end-endsOn'));
		const endButton = await box(end);
		await expect(end).toHaveClass(/danger/);
		if (isPhone(page)) {
			expect(save.y).toBeGreaterThanOrEqual(amount.y + amount.height - 1);
			expect(amount.y).toBeGreaterThanOrEqual(date.y + date.height - 1);
			expect(endButton.y).toBeGreaterThanOrEqual(endDate.y + endDate.height - 1);
		} else {
			expect(Math.abs(save.y + save.height - (date.y + date.height))).toBeLessThanOrEqual(1);
			expect(Math.abs(save.y + save.height - (amount.y + amount.height))).toBeLessThanOrEqual(1);
			expect(
				Math.abs(endButton.y + endButton.height - (endDate.y + endDate.height))
			).toBeLessThanOrEqual(1);
		}
	});

	test('a paycheck bill and its Paid button share a line, or stack without overlap', async ({
		page
	}) => {
		await page.goto('/plan');
		const row = page.getByTestId('covers').first().getByRole('listitem').first();
		const money = await box(row.locator('.money'));
		const name = await box(row.locator('.main'));
		const button = await box(row.getByRole('button'));
		if (isPhone(page)) {
			expect(button.y).toBeGreaterThanOrEqual(money.y + money.height - 1);
			expect(button.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
		} else {
			const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
			expect(Math.abs(centre(button) - centre(money))).toBeLessThanOrEqual(2);
			expect(button.x).toBeGreaterThanOrEqual(money.x + money.width);
		}
	});
});

test.describe('Settings on Home', () => {
	test('a gear at the top right on a phone, hidden on a laptop', async ({ page }) => {
		await page.goto('/');
		const gear = page.getByRole('main').getByRole('link', { name: 'Settings', exact: true });
		const topbar = page.locator('.topbar').getByRole('link', { name: 'Settings' });
		if (isPhone(page)) {
			await expect(topbar).toBeVisible();
			await expect(topbar).toHaveAttribute('href', /\/settings$/);
			const b = await box(topbar);
			expect(b.width).toBeGreaterThanOrEqual(44);
			expect(b.height).toBeGreaterThanOrEqual(44);
			const width = page.viewportSize()!.width;
			expect(b.x + b.width).toBeGreaterThan(width - 40);
		} else {
			await expect(topbar).toBeHidden();
			await expect(gear).toHaveCount(1);
		}
	});
});
