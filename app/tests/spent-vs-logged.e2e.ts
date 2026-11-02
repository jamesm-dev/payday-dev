import { expect, test, type Page } from '@playwright/test';
import { formatMinor, parseMinor } from '../src/lib/domain/money.ts';
import { dateText, moneyText } from '../src/lib/format.ts';
import {
	BALANCE,
	CURRENCY,
	expectedNumber,
	householdItems,
	todayNow,
	yesterday
} from './support/household.ts';

/*
 * Logged expenses at the payday check-in, run once on a phone (the `expenses-checkin` project). A
 * check-in changes the shared database, so it runs alone, after the expenses projects and before
 * the password and reset projects. It ends by removing what it logged and putting the balance back
 * (the Visa keeps the purchase, which nothing after it reads). Every number comes from the domain
 * engine, given the same inputs and today's date.
 */

const money = (n: number) => moneyText(n, CURRENCY);
const today = () => todayNow();
const items = () =>
	householdItems(today(), {
		loanEnded: true,
		gym: { amount: '35.00', endsOn: yesterday(today()) }
	});

const GROCERIES = '12.00';
const SHOES = '50.00'; // bought on the Visa: never touches the account
const FROM_ACCOUNT = 2000; // 20.00 left the account; 12.00 of it was logged, 8.00 was not
const LOGGED = parseMinor(GROCERIES) + parseMinor(SHOES);
const ACCOUNT_BALANCE = () => parseMinor(BALANCE) - FROM_ACCOUNT;
const SPENT = FROM_ACCOUNT + parseMinor(SHOES);

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function logFromHome(page: Page, amount: string, note: string) {
	await page.goto('/');
	await page.getByLabel('Add an expense', { exact: true }).fill(amount);
	await page.getByLabel(/^What was it for\?/).fill(note);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Expense added.' })).toBeVisible();
}

const numberWith = (expenses: string[], balance = BALANCE) =>
	money(expectedNumber(today(), { items: items(), balance, expenses }).amount);

test.describe
	.serial('TSK-F9D442 expenses at the check-in, and the hand-over to the next number', () => {
	test('TSK-F9D442 the logged expenses lower the number before the check-in', async ({ page }) => {
		await logFromHome(page, GROCERIES, 'Groceries');
		await logFromHome(page, SHOES, 'Shoes on the Visa');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(numberWith([GROCERIES, SHOES]));
		await expect(page.getByTestId('expenses-total')).toHaveText(`Total ${money(LOGGED)}`);
	});

	test('TSK-F9D442 the spending step shows what was logged, and with a card leaves the comparison to the last step', async ({
		page
	}) => {
		await page.goto('/checkin');
		await button(page, 'Start my check-in').click();
		await expect(page.getByTestId('progress')).toHaveText('Step 1 of 6');
		await button(page, 'Continue').click();
		await page.getByLabel('Balance in your account').fill(formatMinor(ACCOUNT_BALANCE()));
		await button(page, 'Continue').click();

		await expect(page.getByTestId('progress')).toHaveText('Step 3 of 6');
		await expect(page.getByTestId('spending')).toHaveText(`You spent ${money(FROM_ACCOUNT)}`);
		const logged = page.getByTestId('logged-so-far');
		await expect(logged).toContainText(`You logged ${money(LOGGED)} since your last balance`);
		await expect(logged).toContainText('after you confirm your cards');
		await expect(logged).not.toContainText('not logged');
	});

	test('TSK-F9D442 the last step compares logged with spent, and the card purchase is counted once', async ({
		page
	}) => {
		await page.goto('/checkin');
		await button(page, 'Continue').click(); // spending
		await expect(page.getByTestId('progress')).toHaveText('Step 4 of 6');
		await button(page, 'Continue').click(); // payments: none were due since this morning
		await expect(page.getByTestId('progress')).toHaveText('Step 5 of 6');

		// The Visa grew by exactly what was bought on it; the other loans are as expected.
		const visa = page.getByTestId('loan-line').filter({ hasText: 'Visa' }).getByRole('textbox');
		const expectedVisa = parseMinor(await visa.inputValue());
		await visa.fill(formatMinor(expectedVisa + parseMinor(SHOES)));
		await button(page, 'Continue').click();

		await expect(page.getByTestId('progress')).toHaveText('Step 6 of 6');
		await expect(page.getByTestId('spending-final')).toHaveText(`You spent ${money(SPENT)}`);
		await expect(page.getByTestId('card-purchases')).toContainText(money(parseMinor(SHOES)));
		const compare = page.getByTestId('logged-compare');
		await expect(compare).toContainText(`You logged ${money(LOGGED)}`);
		await expect(compare).toContainText(`you spent ${money(SPENT)}`);
		await expect(compare).toContainText(
			`${money(SPENT - LOGGED)} of what you spent was not logged`
		);
	});

	test('TSK-F9D442 saving hands over: no expense from before counts, and the number is the check-in own', async ({
		page
	}) => {
		await page.goto('/checkin');
		await button(page, 'Save my check-in').click();
		await expect(page).toHaveURL(/\/checkin\/done$/);
		const balance = formatMinor(ACCOUNT_BALANCE());
		await expect(page.getByTestId('safe-to-spend')).toHaveText(numberWith([], balance));
		await expect(page.getByTestId('done-logged')).toHaveText(
			`Logged ${money(LOGGED)} of ${money(SPENT)} spent.`
		);

		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(numberWith([], balance));
		await expect(page.getByTestId('expenses-since')).toHaveCount(0);

		// Only what is logged after the check-in counts.
		await logFromHome(page, '4.00', 'Bus');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(numberWith(['4.00'], balance));
	});

	test('TSK-BCF25E the past check-in says how much of what was spent had been logged', async ({
		page
	}) => {
		await page.goto('/checkin/history');
		await expect(page.getByTestId('history-row').first()).toContainText(
			`Logged ${money(LOGGED)} of ${money(SPENT)} spent`
		);
		await expect(page.getByTestId('history-row').first()).toContainText(dateText(today()));
	});

	test('TSK-F9D442 the household is put back: nothing logged, the balance as the journey left it', async ({
		page
	}) => {
		await page.goto('/expenses');
		for (;;) {
			const rows = page.locator('a.row');
			if ((await rows.count()) === 0) break;
			await rows.first().click();
			await page.getByText('Remove this expense', { exact: true }).click();
			await page.getByRole('button', { name: 'Yes, remove it' }).click();
			await expect(page).toHaveURL(/\/$/);
			await page.goto('/expenses');
		}
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		const form = page.locator('#update-balance');
		if (!(await form.evaluate((el: HTMLDetailsElement) => el.open))) {
			await form.locator('summary').click();
		}
		await form.getByLabel('Balance in your account').fill(BALANCE);
		await form.getByLabel('True on').fill(today());
		const saved = page.waitForResponse(
			(r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/'
		);
		await form.getByRole('button', { name: 'Save balance' }).click();
		await saved;
		await expect(page.getByTestId('safe-to-spend')).toHaveText(numberWith([]));
	});
});
