import { expect, test, type Locator, type Page } from '@playwright/test';
import { addDays, type CalDate } from '../src/lib/domain/dates.ts';
import { previousPayday } from '../src/lib/domain/periods.ts';
import { expand, type Override } from '../src/lib/domain/schedule.ts';
import { dateText, moneyText } from '../src/lib/format.ts';
import { AUTH_STATE, OWNER_PASSWORD, SIGNED_OUT, signInWithPassword } from './support/auth.ts';
import {
	BALANCE,
	BILLS,
	CURRENCY,
	ITEM_ID,
	JOURNEY_TIME_ZONE,
	LOANS,
	LOAN_LAST_PAYMENT,
	PAY,
	expectedNumber,
	householdItems,
	todayNow,
	yesterday,
	type BillInput
} from './support/household.ts';

/*
 * The one test file that changes the shared database: first-run setup for the fixture household,
 * then the home screen in each of its states, then edits on the schedule. It runs once, on a phone
 * (the `journey` project), before every other project, which then read what it left behind.
 * Every number the app should show is computed here by the domain engine from the same inputs.
 */

const money = (n: number) => moneyText(n, CURRENCY);
const today = () => todayNow();

/** Opens the update-balance form on the home screen and saves a balance. */
async function saveBalance(page: Page, amount: string, asOf: CalDate) {
	await page.goto('/');
	await page.waitForLoadState('networkidle'); // the form is safe to use once the page has hydrated
	const form = page.locator('#update-balance');
	if (!(await form.evaluate((el: HTMLDetailsElement) => el.open))) {
		await form.locator('summary').click();
	}
	await form.getByLabel('Balance in your account').fill(amount);
	await form.getByLabel('True on').fill(asOf);
	// The save must reach the server before the test moves on: "based-on" is already on the page,
	// so waiting for it proves nothing, and the next navigation would cancel the post.
	const saved = page.waitForResponse(
		(r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/'
	);
	await form.getByRole('button', { name: 'Save balance' }).click();
	await saved;
	await expect(page.getByTestId('based-on')).toBeVisible();
}

/** Fills the bill or loan form on a setup or schedule screen. */
async function fillItem(page: Page | Locator, input: BillInput) {
	const label = {
		every14: 'Every 2 weeks',
		monthly: 'Every month',
		quarterly: 'Every 3 months',
		yearly: 'Every year'
	}[input.repeat];
	await page.getByLabel('What is it called?').fill(input.name);
	await page.getByLabel('How much is each payment?').fill(input.amount);
	await page.getByRole('radio', { name: label }).check();
	if (input.day) await page.getByLabel('Day of the month').fill(input.day);
	if (input.date) await page.getByLabel('Date of the next payment').fill(input.date);
}

test.describe.serial('TSK-4BCCC7 first-run setup for the fixture household, at phone size', () => {
	test('TSK-67C7C3 opening the app on a new owner starts with a plain welcome', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/setup$/);
		await expect(page.getByRole('heading', { name: "Let's set up Payday" })).toBeVisible();
		await expect(page.getByText('about 15 minutes')).toBeVisible();
		await expect(page.getByText('last two bank statements')).toBeVisible();
		await expect(page.getByTestId('progress')).toHaveText('Step 1 of 7');
		await page.getByRole('button', { name: 'Start' }).click();
		await expect(page.getByRole('heading', { name: 'Your currency and time zone' })).toBeVisible();
	});

	test('TSK-4BCCC7 currency and time zone are prefilled from the browser, and only two-decimal currencies are offered', async ({
		page
	}) => {
		await page.goto('/setup');
		await page.waitForLoadState('networkidle'); // the guess is made once the page has hydrated
		await expect(page.getByLabel('Currency')).toHaveValue(CURRENCY);
		await expect(page.getByLabel('Time zone')).toHaveValue(JOURNEY_TIME_ZONE);
		const codes = await page
			.getByLabel('Currency')
			.locator('option')
			.evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
		expect(codes).toContain('USD');
		expect(codes).not.toContain('JPY');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Your pay' })).toBeVisible();
	});

	test('TSK-67C7C3 a mistake is explained in words and keeps what was typed', async ({ page }) => {
		await page.goto('/setup');
		await page.getByLabel('Pay each payday').fill('12.345');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByText('at most two digits after the dot')).toBeVisible();
		await expect(page.getByText('Choose your last or next payday.')).toBeVisible();
		await expect(page.getByLabel('Pay each payday')).toHaveValue('12.345');
		await expect(page.getByRole('heading', { name: 'Your pay' })).toBeVisible();
	});

	test('TSK-4BCCC7 pay: the amount and the payday that anchors every 14 days', async ({ page }) => {
		await page.goto('/setup');
		await expect(page.getByText('For example: 1,850.00')).toBeVisible();
		// Empty, not "undefined", once the page's script has run.
		await page.waitForLoadState('networkidle');
		await expect(page.getByLabel('Pay each payday')).toHaveValue('');
		await page.getByLabel('Pay each payday').fill(PAY.amount);
		await page.getByLabel('Your last or next payday').fill(PAY.date);
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(
			page.getByRole('heading', { name: 'What is in your account today?' })
		).toBeVisible();
	});

	test('TSK-4BCCC7 balance: asked with today as its date', async ({ page }) => {
		await page.goto('/setup');
		await expect(page.getByLabel('True on')).toHaveValue(today());
		await page.waitForLoadState('networkidle');
		await expect(page.getByLabel('Balance', { exact: true })).toHaveValue('');
		await page.getByLabel('Balance', { exact: true }).fill(BALANCE);
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'Your bills' })).toBeVisible();
	});

	test('TSK-708F11 setup resumes at the same step in a new context, on another device', async ({
		browser,
		baseURL
	}) => {
		const other = await browser.newContext({
			baseURL,
			storageState: AUTH_STATE,
			extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
		});
		const page = await other.newPage();
		await page.goto('/');
		await expect(page).toHaveURL(/\/setup$/);
		await expect(page.getByRole('heading', { name: 'Your bills' })).toBeVisible();
		await expect(page.getByTestId('progress')).toHaveText('Step 5 of 7');
		await other.close();
	});

	test('signing out half way through setup, then in again, carries on at the same step', async ({
		browser,
		baseURL
	}) => {
		// A session of its own: signing it out leaves alone the one the other projects start from.
		const context = await browser.newContext({
			baseURL,
			storageState: SIGNED_OUT,
			extraHTTPHeaders: { 'x-forwarded-proto': 'http', 'x-forwarded-for': '203.0.113.53' }
		});
		const page = await context.newPage();
		await signInWithPassword(page);
		await expect(page).toHaveURL(/\/setup$/);
		await expect(page.getByRole('heading', { name: 'Your bills' })).toBeVisible();

		// Until setup is finished, any other page carries on with it; Settings stays open.
		await page.goto('/plan');
		await expect(page).toHaveURL(/\/setup$/);
		await page.goto('/settings/security');
		await expect(page).toHaveURL(/\/settings\/security$/);

		await page.goto('/setup');
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/signin$/);

		// Back in, even by an old link to another page: setup, at the step it was on.
		await page.goto('/signin?next=%2Fplan');
		await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(page).toHaveURL(/\/setup$/);
		await expect(page.getByRole('heading', { name: 'Your bills' })).toBeVisible();
		await expect(page.getByTestId('progress')).toHaveText('Step 5 of 7');
		await context.close();
	});

	test('TSK-67C7C3 the bills step shows examples and says yearly bills are saved for a little each payday', async ({
		page
	}) => {
		await page.goto('/setup');
		await expect(page.getByText('rent, phone, internet, insurance, subscriptions')).toBeVisible();
		await expect(page.getByText('saved for a little each payday')).toBeVisible();
		await expect(page.getByText('can be added later')).toBeVisible();
	});

	test('TSK-4BCCC7 bills, one at a time: "Add another" saves and shows a blank form; "That\'s all" moves on', async ({
		page
	}) => {
		await page.goto('/setup');
		for (const [i, bill] of BILLS.entries()) {
			await fillItem(page, bill);
			const last = i === BILLS.length - 1;
			await page.getByRole('button', { name: last ? "That's all" : 'Add another' }).click();
			if (!last) {
				await expect(page.getByTestId('added')).toContainText(bill.name);
				await expect(page.getByLabel('What is it called?')).toHaveValue('');
			}
		}
		await expect(page.getByRole('heading', { name: 'Loan payments' })).toBeVisible();
	});

	test('TSK-4BCCC7 a bill with nothing filled in is explained, not saved', async ({ page }) => {
		await page.goto('/setup');
		await page.getByRole('button', { name: 'Add another' }).click();
		await expect(page.getByText('Give it a name')).toBeVisible();
		await expect(page.getByText('Enter an amount')).toBeVisible();
		await expect(page.getByText('Choose the date of the next one')).toHaveCount(0);
	});

	test('TSK-4BCCC7 loan payments, one at a time, then the number', async ({ page }) => {
		await page.goto('/setup');
		for (const loan of LOANS) await fillItem(page, loan);
		await page.getByRole('button', { name: "That's all" }).click();

		await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
		await expect(page.getByTestId('progress')).toHaveText('Step 7 of 7');
		const expected = expectedNumber(today());
		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(expected.amount));
		await expect(
			page.getByText(`Safe to spend until ${dateText(expected.nextPayday)}`)
		).toBeVisible();
	});

	test('TSK-4BCCC7 setup ends on the number, and then the home screen shows the same one', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/setup$/); // not finished until "Open Payday"
		await page.getByRole('button', { name: 'Open Payday' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByTestId('safe-to-spend')).toHaveText(
			money(expectedNumber(today()).amount)
		);
		await page.goto('/setup');
		await expect(page).toHaveURL(/\/$/); // setup is over: it does not ask again
	});
});

test.describe.serial('the home screen in each of its states', () => {
	test('TSK-997E16 the number, the next payday and what is reserved all come from the engine', async ({
		page
	}) => {
		const expected = expectedNumber(today());
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(expected.amount));
		await expect(
			page.getByText(`Safe to spend until ${dateText(expected.nextPayday)}`)
		).toBeVisible();

		const reserved = page.getByTestId('reserved').getByRole('listitem');
		await expect(reserved).toHaveCount(expected.reserved.length);
		expect(expected.reserved.length).toBeGreaterThan(0);
		for (const [i, o] of expected.reserved.entries()) {
			await expect(reserved.nth(i)).toContainText(o.name);
			await expect(reserved.nth(i)).toContainText(dateText(o.date));
			await expect(reserved.nth(i)).toContainText(money(o.amount));
		}

		const heldRows = page.getByTestId('set-asides').getByRole('listitem');
		await expect(heldRows).toHaveCount(expected.setAsides.length);
		for (const [i, s] of expected.setAsides.entries()) {
			await expect(heldRows.nth(i)).toContainText(s.name);
			await expect(heldRows.nth(i)).toContainText(`${money(s.held)} held`);
		}
	});

	test('TSK-1899C1 the number says which balance it is based on, with no warning when it is fresh', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.getByTestId('based-on')).toHaveText(
			`Based on your balance of ${money(230000)} from ${dateText(today())}.`
		);
		await expect(page.getByTestId('stale-warning')).toHaveCount(0);
	});

	test('TSK-1899C1 a balance older than the last payday is warned about, every time', async ({
		page
	}) => {
		const items = householdItems(today());
		const lastPay = previousPayday(items, [], today());
		expect(lastPay).not.toBeNull();
		const asOf = addDays(lastPay!, -3);
		await saveBalance(page, '2,000.00', asOf);

		const expected = expectedNumber(today(), { balance: '2,000.00', balanceAsOf: asOf });
		expect(expected.balanceIsStale).toBe(true);
		await expect(page.getByTestId('stale-warning')).toBeVisible();
		await expect(page.getByTestId('stale-warning')).toContainText('Your balance is out of date');
		await expect(page.getByTestId('stale-warning')).toContainText(dateText(asOf));
		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(expected.amount));
		// The way out is in the warning: it goes straight into the balance field.
		await page.waitForLoadState('networkidle');
		await page
			.getByTestId('stale-warning')
			.getByRole('link', { name: 'Update my balance' })
			.click();
		await expect(page.getByLabel('Balance in your account')).toBeFocused();

		// Every time: a reload shows it again, and so does a second device.
		await page.reload();
		await expect(page.getByTestId('stale-warning')).toBeVisible();
	});

	test('TSK-DBB197 a negative result says what is short, by how much, and which payments it cannot cover', async ({
		page
	}) => {
		await saveBalance(page, '-50.00', today());
		const expected = expectedNumber(today(), { balance: '-50.00' });
		expect(expected.shortfall).not.toBeNull();

		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(expected.amount));
		expect(expected.amount).toBeLessThan(0);
		const alert = page.getByTestId('shortfall');
		await expect(alert).toContainText(`You are ${money(expected.shortfall!.short)} short`);
		const rows = page.getByTestId('uncovered').getByRole('listitem');
		await expect(rows).toHaveCount(expected.shortfall!.uncovered.length);
		for (const [i, o] of expected.shortfall!.uncovered.entries()) {
			await expect(rows.nth(i)).toContainText(o.name);
			await expect(rows.nth(i)).toContainText(money(o.amount));
			// Each opens its own bill, where one payment can be skipped or moved.
			await expect(rows.nth(i).getByRole('link')).toHaveAttribute('href', `/schedule/${o.itemId}`);
		}
	});

	test('TSK-1899C1 a balance dated in the future is refused in plain words', async ({ page }) => {
		await page.goto('/');
		// The date picker's max stops a person; a hand-made request must be stopped by the server.
		const response = await page.request.post('/?/balance', {
			form: { amount: '100', asOf: addDays(today(), 3) },
			headers: { origin: new URL(page.url()).origin }
		});
		expect(await response.text()).toContain('has not happened yet');
	});

	test('TSK-997E16 putting the fresh balance back brings the normal number and no warning', async ({
		page
	}) => {
		await saveBalance(page, BALANCE, today());
		await expect(page.getByTestId('stale-warning')).toHaveCount(0);
		await expect(page.getByTestId('shortfall')).toHaveCount(0);
		await expect(page.getByTestId('safe-to-spend')).toHaveText(
			money(expectedNumber(today()).amount)
		);
	});
});

test.describe.serial('TSK-55D1DC pay, bills and loan payments are added, edited and ended', () => {
	test('lists pay, bills and loan payments, each with its next date and amount', async ({
		page
	}) => {
		await page.goto('/schedule');
		await expect(page.getByRole('heading', { name: 'Pay', exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Bills', exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Loan payments' })).toBeVisible();

		const items = householdItems(today());
		const rent = items.find((i) => i.name === 'Rent')!;
		const next = expand([rent], [], today(), addDays(today(), 800))[0].date;
		const row = page.getByTestId('list-bill').getByRole('listitem').filter({ hasText: 'Rent' });
		await expect(row).toContainText('Every month on the 1st');
		await expect(row).toContainText(`Next: ${dateText(next)}`);
		await expect(row).toContainText(money(120000));
		await expect(page.getByTestId('list-income')).toContainText(money(185000));
		await expect(page.getByTestId('list-income')).toContainText('Every 2 weeks');
		await expect(page.getByTestId('list-loan-payment')).toContainText('Laptop instalment');
	});

	test('a bill is added with plain-words validation first (and without JavaScript)', async ({
		browser,
		baseURL
	}) => {
		const context = await browser.newContext({
			baseURL,
			storageState: AUTH_STATE,
			javaScriptEnabled: false,
			extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
		});
		const page = await context.newPage();
		await page.goto('/schedule');
		await page.getByRole('link', { name: 'Add a bill' }).click();
		await expect(page.getByRole('heading', { name: 'Add a bill' })).toBeVisible();

		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Give it a name, like Rent or Phone.')).toBeVisible();
		await expect(page.getByText('Enter an amount, like 45 or 1,200.50.')).toBeVisible();

		await fillItem(page, { name: 'Gym', amount: '30', repeat: 'monthly', day: '32' });
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Enter a day of the month from 1 to 31.')).toBeVisible();
		await expect(page.getByLabel('What is it called?')).toHaveValue('Gym');

		await page.getByLabel('Day of the month').fill('20');
		await page.getByRole('button', { name: 'Save' }).click();
		const gym = page.getByTestId('list-bill').getByRole('listitem').filter({ hasText: 'Gym' });
		await expect(gym).toContainText(money(3000));
		await expect(gym).toContainText('Every month on the 20th');
		await context.close();
	});

	test('a bill is edited: its amount changes and the rest stays', async ({ page }) => {
		await page.goto('/schedule');
		await page.getByRole('link', { name: 'Gym' }).click();
		await expect(page.getByRole('heading', { name: 'Gym', level: 1 })).toBeVisible();
		await page.getByLabel('How much is each payment?').fill('35.00');
		await page.getByRole('button', { name: 'Save changes' }).click();
		const gym = page.getByTestId('list-bill').getByRole('listitem').filter({ hasText: 'Gym' });
		await expect(gym).toContainText(money(3500));
		await expect(gym).toContainText('Every month on the 20th');
	});

	test('a bill is ended, not deleted: it stays listed as ended, and cannot end before it began', async ({
		page
	}) => {
		await page.goto('/schedule');
		await page.getByRole('link', { name: 'Gym' }).click();
		await page.getByLabel('Last date it applies').fill('2020-01-01');
		await page.getByRole('button', { name: 'End it' }).click();
		await expect(page.getByText('That is before this started')).toBeVisible();

		await page.getByLabel('Last date it applies').fill(yesterday(today()));
		await page.getByRole('button', { name: 'End it' }).click();
		const gym = page.getByTestId('list-bill').getByRole('listitem').filter({ hasText: 'Gym' });
		await expect(gym).toContainText('Ended');
		await expect(gym).toContainText(dateText(yesterday(today())));

		// Bring it back and end it again: nothing was lost.
		await page.getByRole('link', { name: 'Gym' }).click();
		await page.getByRole('button', { name: 'Bring it back' }).click();
		await expect(page.getByText('Stop this')).toBeVisible();
		await page.getByLabel('Last date it applies').fill(yesterday(today()));
		await page.getByRole('button', { name: 'End it' }).click();
		await expect(gym).toContainText('Ended');
	});

	test('the laptop loan is ended on its last payment date, and the home number follows', async ({
		page
	}) => {
		await page.goto('/schedule');
		await page.getByRole('link', { name: 'Laptop instalment' }).click();
		await page.getByLabel('Last date it applies').fill(LOAN_LAST_PAYMENT);
		await page.getByRole('button', { name: 'End it' }).click();
		await expect(
			page.getByTestId('list-loan-payment').getByRole('listitem').filter({ hasText: 'Laptop' })
		).toContainText('Ended');

		const items = householdItems(today(), {
			loanEnded: true,
			gym: { amount: '35.00', endsOn: yesterday(today()) }
		});
		const expected = expectedNumber(today(), { items });
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(expected.amount));
	});
});

test.describe
	.serial('TSK-92B79F one payment is skipped or changed, and undone, without touching its rule', () => {
	/** The rent payment rows of the open page, in order. */
	const payments = (page: Page) => page.getByTestId('payments').getByRole('listitem');

	test('lists the next six payments, each with Skip and Change', async ({ page }) => {
		await page.goto(`/schedule/${ITEM_ID.rent}`);
		await expect(page.getByRole('heading', { name: 'Rent', level: 1 })).toBeVisible();
		await expect(payments(page)).toHaveCount(6);
		await expect(payments(page).first().getByRole('button', { name: /Skip/ })).toBeVisible();
		await expect(payments(page).first().locator('summary', { hasText: 'Change' })).toBeVisible();
	});

	test('skip removes one payment from the number, and undo puts it back', async ({ page }) => {
		const first = payments(page);
		await page.goto(`/schedule/${ITEM_ID.rent}`);
		const originalDate = (await first.first().getAttribute('data-original')) as CalDate;
		const base = {
			items: householdItems(today(), {
				loanEnded: true,
				gym: { amount: '35.00', endsOn: yesterday(today()) }
			})
		};
		const skip: Override = { itemId: ITEM_ID.rent, originalDate, action: 'skip' };

		await first.first().getByRole('button', { name: /Skip/ }).click();
		await expect(first.first()).toContainText('Skipped');
		await expect(first.first().getByRole('button', { name: /Undo/ })).toBeVisible();
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(
			money(expectedNumber(today(), { ...base, overrides: [skip] }).amount)
		);

		await page.goto(`/schedule/${ITEM_ID.rent}`);
		await first.first().getByRole('button', { name: /Undo/ }).click();
		await expect(first.first()).not.toContainText('Skipped');
		await expect(first.first().getByRole('button', { name: /Skip/ })).toBeVisible();
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(
			money(expectedNumber(today(), base).amount)
		);
	});

	test('change moves the date and the amount of one payment, and undo restores the rule', async ({
		page
	}) => {
		const rows = payments(page);
		await page.goto(`/schedule/${ITEM_ID.rent}`);
		const originalDate = (await rows.first().getAttribute('data-original')) as CalDate;
		const newDate = addDays(originalDate, -2);

		await rows.first().locator('summary', { hasText: 'Change' }).click();
		await rows.first().getByLabel('New date').fill(newDate);
		await rows.first().getByLabel('New amount').fill('1,300.00');
		await rows.first().getByRole('button', { name: 'Save this change' }).click();

		await expect(rows.first()).toContainText('Changed');
		await expect(rows.first()).toContainText(money(130000));
		await expect(rows.first()).toContainText(dateText(newDate));
		await expect(rows.first()).toContainText(`Was ${dateText(originalDate)}`);
		// The rule is untouched: the other five payments are as before.
		await expect(rows.nth(1)).toContainText(money(120000));

		await rows.first().getByRole('button', { name: /Undo/ }).click();
		await expect(rows.first()).not.toContainText('Changed');
		await expect(rows.first()).toContainText(money(120000));
	});

	test('a change that changes nothing, and a payment that is not on the schedule, are refused', async ({
		page
	}) => {
		const rows = payments(page);
		await page.goto(`/schedule/${ITEM_ID.rent}`);
		await rows.first().locator('summary', { hasText: 'Change' }).click();
		await rows.first().getByRole('button', { name: 'Save this change' }).click();
		await expect(page.getByRole('alert')).toContainText('Choose a different date or amount');

		const original = await rows.first().getAttribute('data-original');
		const bad = addDays(original as CalDate, 1);
		const response = await page.request.post(`/schedule/${ITEM_ID.rent}?/skip`, {
			form: { originalDate: bad },
			headers: { origin: new URL(page.url()).origin }
		});
		expect(await response.text()).toContain('not on the schedule');
	});
});
