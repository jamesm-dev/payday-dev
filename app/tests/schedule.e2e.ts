import { expect, test, type Page } from '@playwright/test';
import { addDays } from '../src/lib/domain/dates.ts';
import { expand } from '../src/lib/domain/schedule.ts';
import { dateText, moneyText } from '../src/lib/format.ts';
import { CURRENCY, ITEM_ID, householdItems, todayNow } from './support/household.ts';

/*
 * Read-only checks of the schedule screens at each size, after the journey has set the household
 * up. The edits themselves are in journey.e2e.ts.
 */

async function expectNoSidewaysScroll(page: Page) {
	const { scroll, client } = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth,
		client: document.documentElement.clientWidth
	}));
	expect(scroll).toBeLessThanOrEqual(client);
}

test.describe('TSK-55D1DC the schedule is readable at phone and laptop sizes', () => {
	test('lists pay, bills and loan payments with their next dates', async ({ page }) => {
		const today = todayNow();
		await page.goto('/schedule');
		await expect(page.getByRole('heading', { name: 'Pay and bills' })).toBeVisible();
		for (const name of ['Pay', 'Bills', 'Loan payments']) {
			await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
		}
		const rent = householdItems(today).find((i) => i.id === ITEM_ID.rent)!;
		const next = expand([rent], [], today, addDays(today, 800))[0].date;
		await expect(
			page.getByTestId('list-bill').getByRole('listitem').filter({ hasText: 'Rent' })
		).toContainText(`Next: ${dateText(next)}`);
		await expect(page.getByTestId('list-bill')).toContainText(moneyText(120000, CURRENCY));
		await expect(page.getByRole('link', { name: 'Add a bill' })).toBeVisible();
		await expectNoSidewaysScroll(page);
	});

	test('an item shows six upcoming payments, each with Skip and Change', async ({ page }) => {
		await page.goto(`/schedule/${ITEM_ID.rent}`);
		const rows = page.getByTestId('payments').getByRole('listitem');
		await expect(rows).toHaveCount(6);
		await expect(page.getByRole('button', { name: /^Skip/ })).toHaveCount(6);
		await expect(page.locator('summary', { hasText: 'Change' })).toHaveCount(6);
		await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
		await expectNoSidewaysScroll(page);
	});

	test('the add form works at this size and has the four repeat choices', async ({ page }) => {
		await page.goto('/schedule/new/bill');
		for (const label of ['Every 2 weeks', 'Every month', 'Every 3 months', 'Every year']) {
			await expect(page.getByRole('radio', { name: label })).toBeVisible();
		}
		await expect(page.getByLabel('Day of the month')).toBeVisible();
		await page.getByRole('radio', { name: 'Every year' }).check();
		await expect(page.getByLabel('Day of the month')).toBeHidden();
		await expect(page.getByLabel('Date of the next payment')).toBeVisible();
		await expectNoSidewaysScroll(page);
	});

	test('an address that is not an item, or not a kind, is a plain not-found', async ({
		request
	}) => {
		expect((await request.get('/schedule/99999')).status()).toBe(404);
		expect((await request.get('/schedule/new/gift')).status()).toBe(404);
		expect((await request.get('/schedule/abc')).status()).toBe(404);
	});
});
