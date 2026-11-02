import { expect, test, type Page } from '@playwright/test';
import { addDays } from '../src/lib/domain/dates.ts';
import { dateText, moneyText } from '../src/lib/format.ts';
import {
	CURRENCY,
	expectedNumber,
	householdItems,
	todayNow,
	yesterday
} from './support/household.ts';

/*
 * Logging expenses changes the shared household, so this runs in its own serial projects (iPhone,
 * then Android, then laptop) after every read-only project. Each test removes what it added, and
 * an afterEach removes anything a failed test left behind, because later projects read the
 * household.
 */

const money = (n: number) => moneyText(n, CURRENCY);
const today = () => todayNow();
const items = () =>
	householdItems(today(), {
		loanEnded: true,
		gym: { amount: '35.00', endsOn: yesterday(today()) }
	});
const numberWith = (expenses: string[]) =>
	money(expectedNumber(today(), { items: items(), expenses }).amount);

async function expectNumber(page: Page, expenses: string[]) {
	await expect(page.getByTestId('safe-to-spend')).toHaveText(numberWith(expenses));
}

/** The quick-add form on Home, as a person fills it. */
async function logFromHome(page: Page, amount: string, note: string, day?: string) {
	await page.goto('/');
	await page.getByLabel('Add an expense', { exact: true }).fill(amount);
	if (note) await page.getByLabel(/^What was it for\?/).fill(note);
	if (day) {
		await page.getByText('Another day', { exact: true }).click();
		await page.getByLabel('The day you spent it').fill(day);
	}
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('status').filter({ hasText: 'Expense added.' })).toBeVisible();
}

async function removeOpenExpense(page: Page) {
	await page.getByText('Remove this expense', { exact: true }).click();
	await page.getByRole('button', { name: 'Yes, remove it' }).click();
	await expect(page).toHaveURL(/\/$/);
}

test.afterEach(async ({ page }) => {
	await page.goto('/expenses');
	for (;;) {
		const rows = page.locator('a.row');
		if ((await rows.count()) === 0) break;
		await rows.first().click();
		await removeOpenExpense(page);
		await page.goto('/expenses');
	}
});

test.describe('TSK-6DC197 TSK-E44178 TSK-E2A26C logging, changing and removing an expense', () => {
	test('logging from Home drops the number by exactly the amount', async ({ page }) => {
		await page.goto('/');
		await expectNumber(page, []);
		await logFromHome(page, '17.50', 'Coffee beans');
		await expectNumber(page, ['17.50']);
	});

	test('the since-your-balance list shows it with a total; it can be changed and removed', async ({
		page
	}) => {
		await logFromHome(page, '17.50', 'Coffee beans');
		const since = page.getByTestId('expenses-since');
		await expect(since).toContainText('Coffee beans');
		await expect(since).toContainText(dateText(today()));
		await expect(since).toContainText('$17.50');
		await expect(page.getByTestId('expenses-total')).toHaveText('Total $17.50');
		await expect(page.getByTestId('based-on')).toContainText('less $17.50 you logged since');

		await logFromHome(page, '2.50', 'Bus');
		await expect(page.getByTestId('expenses-total')).toHaveText('Total $20.00');
		await expectNumber(page, ['17.50', '2.50']);

		// Change one.
		await since.getByRole('link', { name: /Coffee beans/ }).click();
		await expect(page).toHaveURL(/\/expenses\/\d+$/);
		await page.getByLabel('Amount', { exact: true }).fill('30.00');
		await page.getByLabel(/^What was it for\?/).fill('Beans and a grinder');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('status').filter({ hasText: 'Expense changed.' })).toBeVisible();
		await expect(page.getByTestId('expenses-since')).toContainText('Beans and a grinder');
		await expectNumber(page, ['30.00', '2.50']);

		// Remove both; the number follows each time.
		await page
			.getByTestId('expenses-since')
			.getByRole('link', { name: /Beans and a grinder/ })
			.click();
		await removeOpenExpense(page);
		await expect(page.getByRole('status').filter({ hasText: 'Expense removed.' })).toBeVisible();
		await expectNumber(page, ['2.50']);
		await page.getByTestId('expenses-since').getByRole('link', { name: /Bus/ }).click();
		await removeOpenExpense(page);
		await expectNumber(page, []);
		await expect(page.getByTestId('expenses-since')).toHaveCount(0);
	});

	test('an expense for an empty note is called Expense, and the remove step asks first', async ({
		page
	}) => {
		await logFromHome(page, '4', '');
		await page
			.getByTestId('expenses-since')
			.getByRole('link', { name: /Expense/ })
			.click();
		await expect(page.getByRole('heading', { level: 1, name: 'Expense' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Yes, remove it' })).toBeHidden();
		await removeOpenExpense(page);
		await expectNumber(page, []);
	});
});

test.describe('TSK-B5233D the Expenses page groups by day', () => {
	test('lists each day newest first with its total, and links to each expense', async ({
		page
	}) => {
		const earlier = yesterday(today());
		await logFromHome(page, '12.00', 'Groceries', earlier);
		await logFromHome(page, '5.00', 'Tea');
		await logFromHome(page, '7.25', 'Lunch');
		// Yesterday's was spent before the balance's day, so it does not count against the number.
		await expectNumber(page, ['5.00', '7.25']);

		await page.getByRole('link', { name: 'See all expenses' }).click();
		await expect(page).toHaveURL(/\/expenses$/);
		const days = page.getByTestId('expense-day');
		await expect(days).toHaveCount(2);
		await expect(days.nth(0).getByRole('heading')).toHaveText(dateText(today()));
		await expect(days.nth(0).getByTestId('day-total')).toHaveText('$12.25');
		await expect(days.nth(0).getByRole('link')).toHaveCount(2);
		await expect(days.nth(0).getByRole('link').first()).toContainText('Lunch');
		await expect(days.nth(1).getByRole('heading')).toHaveText(dateText(earlier));
		await expect(days.nth(1).getByTestId('day-total')).toHaveText('$12.00');

		await days
			.nth(1)
			.getByRole('link', { name: /Groceries/ })
			.click();
		await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
		await expect(page.getByLabel('The day you spent it')).toHaveValue(earlier);
	});

	test('says so when nothing is logged', async ({ page }) => {
		await page.goto('/expenses');
		await expect(page.getByTestId('expenses-empty')).toBeVisible();
		await page.getByRole('link', { name: 'Back to Home' }).click();
		await expect(page).toHaveURL(/\/$/);
	});
});

test.describe('TSK-A9146A a mistake is explained in words and keeps what was typed', () => {
	test('no amount', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel(/^What was it for\?/).fill('Forgot the price');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		const amount = page.getByLabel('Add an expense', { exact: true });
		await expect(amount).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('#expense-amount-problem')).not.toBeEmpty();
		await expect(page.getByLabel(/^What was it for\?/)).toHaveValue('Forgot the price');
		await expect(page.getByLabel(/^What was it for\?/)).not.toHaveValue('undefined');
		await expectNumber(page, []);
	});

	test('not a number', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('Add an expense', { exact: true }).fill('lots');
		await page.getByLabel(/^What was it for\?/).fill('Dinner');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.locator('#expense-amount-problem')).not.toBeEmpty();
		await expect(page.getByLabel('Add an expense', { exact: true })).toHaveValue('lots');
		await expect(page.getByLabel(/^What was it for\?/)).toHaveValue('Dinner');
		await expectNumber(page, []);
	});

	test('a day in the future', async ({ page }) => {
		await page.goto('/');
		await page.getByLabel('Add an expense', { exact: true }).fill('9.00');
		await page.getByText('Another day', { exact: true }).click();
		await page.getByLabel('The day you spent it').fill(addDays(today(), 3));
		// Chromium stops a day past the field's max before it is sent; the server's words are for every
		// other browser and for anyone without script, so skip the browser's own check here.
		await page
			.locator('#add-expense')
			.evaluate((f) => (f as HTMLFormElement).setAttribute('novalidate', ''));
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByText('That day has not happened yet.')).toBeVisible();
		await expect(page.getByLabel('Add an expense', { exact: true })).toHaveValue('9.00');
		await expect(page.getByLabel('The day you spent it')).toHaveValue(addDays(today(), 3));
		await expectNumber(page, []);
	});

	test('the same mistakes are explained when changing one', async ({ page }) => {
		await logFromHome(page, '6.00', 'Parking');
		await page
			.getByTestId('expenses-since')
			.getByRole('link', { name: /Parking/ })
			.click();
		await page.getByLabel('Amount', { exact: true }).fill('');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.locator('#expense-amount-problem')).not.toBeEmpty();
		await expect(page.getByLabel(/^What was it for\?/)).toHaveValue('Parking');
		await page.getByLabel('Amount', { exact: true }).fill('abc');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('abc');
		await expect(page.locator('#expense-amount-problem')).not.toBeEmpty();
	});
});

test.describe('TSK-E2A26C the expense pages fit the screen', () => {
	test('nothing scrolls sideways on Home, the list or an expense', async ({ page }) => {
		await logFromHome(page, '3.00', 'A rather long description of what this particular thing was');
		const check = async () => {
			const { scroll, client } = await page.evaluate(() => ({
				scroll: document.documentElement.scrollWidth,
				client: document.documentElement.clientWidth
			}));
			expect(scroll).toBeLessThanOrEqual(client);
		};
		await check();
		await page.goto('/expenses');
		await check();
		await page.locator('a.row').first().click();
		await check();
	});
});
