import { expect, test, type Page } from './support/test.ts';
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
		await expect(page.getByLabel('Day of the month', { exact: true })).toBeVisible();
		await page.getByRole('radio', { name: 'Every year' }).check();
		await expect(page.getByLabel('Day of the month', { exact: true })).toBeHidden();
		await expect(page.getByLabel('Date of the next payment')).toBeVisible();
		await expectNoSidewaysScroll(page);
	});

	test('TSK-981E6B a bill can repeat twice a month, and two late days are refused', async ({
		page
	}) => {
		await page.goto('/schedule/new/bill');
		await page.getByRole('radio', { name: 'Twice a month' }).check();
		await expect(page.getByLabel('Day of the month', { exact: true })).toBeVisible();
		await expect(page.getByLabel('Second day each month')).toBeVisible();
		await expect(page.getByLabel('Date of the next payment')).toBeHidden();
		await page.getByLabel('What is it called?').fill('Gym fees');
		await page.getByLabel('How much is each payment?').fill('20');
		await page.getByLabel('Day of the month', { exact: true }).fill('28');
		await page.getByLabel('Second day each month').fill('31');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Choose a first day before the 28th.')).toBeVisible();
		await expect(page.getByRole('radio', { name: 'Twice a month' })).toBeChecked();
		await expectNoSidewaysScroll(page);
	});

	test('TSK-C8DA31 the main pay shows its rhythm in words and a link to Settings, no choices', async ({
		page
	}) => {
		await page.goto(`/schedule/${ITEM_ID.pay}`);
		const rhythm = page.getByTestId('main-rhythm');
		await expect(rhythm).toContainText('Every 2 weeks.');
		await expect(
			rhythm.getByRole('link', { name: 'Change how often you are paid' })
		).toHaveAttribute('href', '/settings/pay');
		await expect(page.getByRole('radio')).toHaveCount(0);
		await expect(page.getByLabel('What do you call it?')).toBeVisible();
		await expect(page.getByLabel('How much do you get each time, after tax?')).toBeVisible();
		await expectNoSidewaysScroll(page);
	});

	test('TSK-C8DA31 Settings shows how often you are paid; the same rhythm again is refused', async ({
		page
	}) => {
		await page.goto('/settings');
		await page.getByRole('link', { name: /How often you are paid/ }).click();
		await expect(page.getByRole('heading', { name: 'How often you are paid' })).toBeVisible();
		await expect(page.getByTestId('current-rhythm')).toContainText('Every 2 weeks');
		await expect(page.getByLabel('Your last or next payday')).not.toHaveValue('');
		await page.getByRole('button', { name: 'Save how often I am paid' }).click();
		await expect(
			page.getByText('This is already how often you are paid. Nothing was changed.')
		).toBeVisible();
		await expect(page.getByTestId('current-rhythm')).toContainText('Every 2 weeks');
		await expect(page.getByTestId('saved')).toHaveCount(0);
		await expectNoSidewaysScroll(page);
	});

	test('TSK-C8DA31 Settings refuses two days at the end of the month in plain words', async ({
		page
	}) => {
		await page.goto('/settings/pay');
		await page.getByRole('radio', { name: /Twice a month/ }).check();
		await page.getByLabel('First day of the month you are paid').fill('28');
		await page.getByLabel('Second day of the month you are paid').fill('31');
		await page.getByRole('button', { name: 'Save how often I am paid' }).click();
		await expect(page.getByText('Choose a first day before the 28th.')).toBeVisible();
		await expect(page.getByTestId('current-rhythm')).toContainText('Every 2 weeks');
	});

	test('an address that is not an item, or not a kind, is a plain not-found', async ({
		request
	}) => {
		expect((await request.get('/schedule/99999')).status()).toBe(404);
		expect((await request.get('/schedule/new/gift')).status()).toBe(404);
		expect((await request.get('/schedule/abc')).status()).toBe(404);
	});
});
