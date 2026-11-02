import { expect, test, type Page } from '@playwright/test';
import { incomeDueSince, paymentsDueSince } from '../src/lib/domain/checkin.ts';
import { addDays, type CalDate } from '../src/lib/domain/dates.ts';
import {
	interestThisMonth,
	paymentPlanFor,
	projectLoan,
	type Loan
} from '../src/lib/domain/loans.ts';
import { formatMinor, minor, parseMinor } from '../src/lib/domain/money.ts';
import { safeToSpend } from '../src/lib/domain/safeToSpend.ts';
import { expand } from '../src/lib/domain/schedule.ts';
import { dateText, moneyText } from '../src/lib/format.ts';
import { BALANCE, CURRENCY, householdItems, todayNow, yesterday } from './support/household.ts';

/*
 * Loans, run once on a phone (the `loans` project) after the journey and the check-in and before the
 * read-only projects. It adds a loan of each kind, turns the setup's bills into loans, reads the
 * ledger, and runs two check-ins with the loans step. It ends with the balance back at the journey's
 * and nothing marked missed, so the household reads as the other projects expect. The schedule is
 * never edited: a loan only links to a payment already there. Every figure that depends on the
 * schedule comes from the domain engine, given the same inputs and today's date.
 */

const money = (n: number) => moneyText(n, CURRENCY);
const today = () => todayNow();
const DAYS_BACK = 16;

/** The household as the journey and the check-in leave it. */
const items = () =>
	householdItems(today(), {
		loanEnded: true,
		gym: { amount: '35.00', endsOn: yesterday(today()) }
	});

const ITEM = { card: '4', laptop: '8' } as const;

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** The Visa as the engine sees it, for the figures the ledger should show. */
function visa(balance: number): Loan {
	return {
		id: '1',
		type: 'credit-card',
		name: 'Visa',
		balance: minor(balance),
		balanceAsOf: today(),
		rateBp: 2299,
		scheduleItemId: ITEM.card,
		minPctBp: 200,
		minFloor: minor(2500)
	};
}

const visaProjection = (balance: number) =>
	projectLoan(visa(balance), paymentPlanFor(visa(balance), items(), [], today()), today());

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

const loanCard = (page: Page, name: string) =>
	page.getByTestId('loan').filter({ has: page.getByRole('link', { name, exact: true }) });

test.describe
	.serial('TSK-A641F9 a loan of each kind is added with the fields its kind needs', () => {
	test('TSK-4E012E the empty ledger invites the first loan and offers the four kinds', async ({
		page
	}) => {
		await page.goto('/loans');
		await expect(page.getByRole('heading', { name: 'What I owe', level: 1 })).toBeVisible();
		await expect(page.getByText('Add each loan, card and plan')).toBeVisible();
		await expect(page.getByTestId('total-owed')).toHaveCount(0);

		await page.getByRole('link', { name: 'Add a loan' }).click();
		await expect(page.getByRole('heading', { name: 'What kind of loan is it?' })).toBeVisible();
		const kinds = page.getByTestId('kinds').getByRole('link');
		await expect(kinds).toHaveCount(4);
		for (const name of [
			'Credit card',
			'Loan with fixed payments',
			'Buy now, pay later',
			'Money owed to a person'
		]) {
			await expect(kinds.filter({ hasText: name })).toHaveCount(1);
		}
	});

	test('TSK-A641F9 each kind asks only for what it needs', async ({ page }) => {
		await page.goto('/loans/new/credit-card');
		await expect(page.getByLabel('Percentage of the balance')).toBeVisible();
		await expect(page.getByLabel('Or this amount, if it is more')).toBeVisible();
		await expect(page.getByLabel('How much is owed on it now?')).toBeVisible();

		await page.goto('/loans/new/instalment');
		await expect(page.getByLabel('How much is left to pay?')).toBeVisible();
		await expect(page.getByLabel('Percentage of the balance')).toHaveCount(0);

		// A plan or a loan from a person usually charges nothing: the rate starts at 0, and can be cleared.
		await page.goto('/loans/new/bnpl');
		await expect(page.getByLabel('Yearly interest rate, in percent')).toHaveValue('0');
		await expect(page.getByLabel('Percentage of the balance')).toHaveCount(0);
		await page.goto('/loans/new/informal');
		await expect(page.getByLabel('Yearly interest rate, in percent')).toHaveValue('0');
		await expect(page.getByLabel('How much is left to pay back?')).toBeVisible();
		await expect(page.getByLabel('Who do you owe?')).toBeVisible();

		await page.goto('/loans/new/mortgage');
		await expect(page.getByRole('heading', { name: "We can't find that page" })).toBeVisible();
	});

	test('TSK-A641F9 a mistake is explained in words and keeps what was typed', async ({ page }) => {
		await page.goto('/loans/new/instalment');
		await page.getByLabel('Yearly interest rate, in percent').fill('lots');
		await button(page, 'Save this loan').click();
		await expect(page.getByText('Give it a name, like Visa or Car loan.')).toBeVisible();
		await expect(page.getByText('Enter how much is owed')).toBeVisible();
		await expect(page.getByText('Enter the yearly rate as a percentage')).toBeVisible();
		await expect(page.getByLabel('Yearly interest rate, in percent')).toHaveValue('lots');

		// A card with no payment and no minimum cannot be projected: it says what is needed.
		await page.goto('/loans/new/credit-card');
		await page.getByLabel('What is it called?').fill('Visa');
		await page.getByLabel('How much is owed on it now?').fill('1,800');
		await button(page, 'Save this loan').click();
		await expect(page.getByText('A card needs either a payment from your schedule')).toBeVisible();
	});

	test('TSK-F2D30C the credit card bill from setup becomes a loan from its schedule page, without being typed again', async ({
		page
	}) => {
		await page.goto(`/schedule/${ITEM.card}`);
		await expect(page.getByRole('heading', { name: 'Is this a loan?' })).toBeVisible();
		await page.getByRole('button', { name: 'This is a loan' }).click();
		await page
			.getByTestId('kinds')
			.getByRole('link', { name: /Credit card/ })
			.click();

		// The name and the payment are already filled in from the schedule.
		await expect(page.getByLabel('What is it called?')).toHaveValue('Credit card minimum');
		await expect(page.getByLabel('Which payment on your schedule pays this off?')).toHaveValue(
			ITEM.card
		);
		await page.getByLabel('What is it called?').fill('Visa');
		await page.getByLabel('Who is it with?').fill('Harbour Bank');
		await page.getByLabel('How much is owed on it now?').fill('1,800.00');
		await page.getByLabel('Yearly interest rate, in percent').fill('22.99');
		await page.getByLabel('Percentage of the balance').fill('2');
		await page.getByLabel('Or this amount, if it is more').fill('25');
		await button(page, 'Save this loan').click();

		await expect(page).toHaveURL(/\/loans$/);
		await expect(loanCard(page, 'Visa')).toBeVisible();
	});

	test('TSK-D5AAAA the schedule page now says its payment belongs to the loan, and the number is unchanged', async ({
		page
	}) => {
		await page.goto(`/schedule/${ITEM.card}`);
		await expect(page.getByTestId('loan-link')).toContainText('This is the payment for Visa');
		await expect(page.getByTestId('loan-link')).toContainText('counted once');
		await expect(page.getByRole('button', { name: 'This is a loan' })).toHaveCount(0);

		// The loan changed nothing about what is reserved: the number is the schedule's alone.
		const number = safeToSpend({
			items: items(),
			overrides: [],
			balance: parseMinor(BALANCE),
			balanceAsOf: today(),
			today: today()
		});
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(number.amount));
		const names = await page.getByTestId('reserved').getByRole('listitem').allInnerTexts();
		expect(names.filter((n) => n.includes('Credit card minimum')).length).toBe(
			number.reserved.filter((o) => o.name === 'Credit card minimum').length
		);
		await expect(page.getByTestId('reserved').getByRole('listitem')).toHaveCount(
			number.reserved.length
		);
	});

	test('TSK-7DFBFA, TSK-05B6CF, TSK-5CEFEA the ledger shows the total, the interest, the rate and the debt-free date', async ({
		page
	}) => {
		await page.goto('/loans');
		const projection = visaProjection(180000);
		if (projection.kind !== 'payoff') throw new Error('The Visa should pay off at 60.00 a month');
		const interest = interestThisMonth([visa(180000)]);
		expect(interest).toBe(3449); // 180000 x 2299 / 120000 = 3448.5, half up

		await expect(page.getByTestId('total-owed')).toHaveText(money(180000));
		await expect(page.getByTestId('interest-month')).toHaveText(money(interest));
		await expect(page.getByTestId('debt-free')).toContainText(
			`Debt free by ${dateText(projection.date)}`
		);
		await expect(page.getByTestId('assumed-rates')).toContainText('Visa: 22.99% a year');

		const card = loanCard(page, 'Visa');
		await expect(card.getByTestId('loan-balance')).toHaveText(money(180000));
		await expect(card.getByTestId('loan-rate')).toHaveText('22.99% a year');
		const next = expand(
			items().filter((i) => i.id === ITEM.card),
			[],
			today(),
			addDays(today(), 60)
		)[0];
		await expect(card.getByTestId('loan-next')).toHaveText(
			`Next payment ${money(next.amount)} on ${dateText(next.date)}`
		);
		await expect(card.getByTestId('loan-payoff')).toContainText(
			`Paid off by ${dateText(projection.date)}, with ${money(projection.interest)} of interest`
		);
	});

	test('TSK-5CEFEA a card whose payment does not cover its interest says never, by name, instead of a date', async ({
		page
	}) => {
		// 10,000.00 at 22.99% costs 191.58 a month in interest: the 60.00 payment cannot keep up.
		expect(visaProjection(1_000_000)).toEqual({ kind: 'never', reason: 'interest' });
		await page.goto('/loans');
		await loanCard(page, 'Visa').getByRole('link', { name: 'Visa', exact: true }).click();
		await page.getByLabel('What is owed now?').fill('10,000.00');
		await button(page, 'Save changes').click();

		await expect(page.getByTestId('debt-free')).toContainText('Never at this pace');
		await expect(page.getByTestId('debt-free')).toContainText(
			'Visa: the payment does not cover the interest'
		);
		await expect(page.getByTestId('debt-free')).toHaveAttribute('data-kind', 'blocked');
		await expect(loanCard(page, 'Visa').getByTestId('loan-payoff')).toHaveText(
			'Never at this pace: the payment does not cover the interest'
		);
		await expect(page.getByTestId('total-owed')).toHaveText(money(1_000_000));

		// Put it back, for the rest of the run.
		await loanCard(page, 'Visa').getByRole('link', { name: 'Visa', exact: true }).click();
		await page.getByLabel('What is owed now?').fill('1,800.00');
		await button(page, 'Save changes').click();
		await expect(page.getByTestId('total-owed')).toHaveText(money(180000));
		await expect(page.getByTestId('debt-free')).toHaveAttribute('data-kind', 'date');
	});

	test('TSK-A641F9 an instalment loan, with the rate left empty, shows it as unknown', async ({
		page
	}) => {
		await page.goto('/loans/new/instalment');
		await page.getByLabel('What is it called?').fill('Car loan');
		await page.getByLabel('Who is it with?').fill('Harbour Credit Union');
		await page.getByLabel('How much is left to pay?').fill('6,400.00');
		await button(page, 'Save this loan').click();

		const car = loanCard(page, 'Car loan');
		await expect(car.getByTestId('loan-rate')).toHaveText('Unknown');
		await expect(car.getByTestId('loan-next')).toHaveText('No payment set up yet');
		await expect(page.getByTestId('total-owed')).toHaveText(money(180000 + 640000));
		await expect(page.getByTestId('interest-unknown')).toContainText('Car loan');
		// With one loan that has no payments there is no date, and it says why.
		await expect(page.getByTestId('debt-free')).toContainText('No date yet');
		await expect(page.getByTestId('debt-free')).toContainText('Car loan: no payments are set up');
		await expect(page.getByTestId('debt-free')).toContainText(
			'Car loan: rate unknown, counted as no interest'
		);
		// The interest figure counts only what is known: the Visa's.
		await expect(page.getByTestId('interest-month')).toHaveText(money(3449));
	});

	test('TSK-F2D30C the laptop plan, a loan payment from setup, is picked from the schedule and becomes a buy-now-pay-later loan', async ({
		page
	}) => {
		await page.goto(`/schedule/${ITEM.laptop}`);
		await page.getByRole('button', { name: 'This is a loan' }).click();
		await page
			.getByTestId('kinds')
			.getByRole('link', { name: /Buy now, pay later/ })
			.click();
		await expect(page.getByLabel('What is it called?')).toHaveValue('Laptop instalment');
		await expect(page.getByLabel('Which payment on your schedule pays this off?')).toHaveValue(
			ITEM.laptop
		);
		await page.getByLabel('What is it called?').fill('Laptop plan');
		await page.getByLabel('How much is left to pay?').fill('0');
		await button(page, 'Save this loan').click();

		const laptop = loanCard(page, 'Laptop plan');
		await expect(laptop.getByTestId('loan-rate')).toHaveText('0.00% a year');
		await expect(laptop.getByTestId('loan-payoff')).toHaveText('Nothing left to pay');
	});

	test('TSK-A641F9 a loan from a person is added directly, at no interest', async ({ page }) => {
		await page.goto('/loans/new/informal');
		await page.getByLabel('What is it called?').fill('Loan from Dad');
		await page.getByLabel('Who do you owe?').fill('Dad');
		await page.getByLabel('How much is left to pay back?').fill('500');
		await button(page, 'Save this loan').click();

		const dad = loanCard(page, 'Loan from Dad');
		await expect(dad.getByTestId('loan-balance')).toHaveText(money(50000));
		await expect(dad.getByTestId('loan-rate')).toHaveText('0.00% a year');
		await expect(page.getByTestId('total-owed')).toHaveText(money(180000 + 640000 + 0 + 50000));
	});

	test('TSK-F2D30C a payment that already belongs to a loan cannot be given to a second one', async ({
		page
	}) => {
		await page.goto('/loans/new/instalment');
		// It is not even offered: only free payments are in the list.
		await expect(
			page
				.getByLabel('Which payment on your schedule pays this off?')
				.locator('option', { hasText: 'Credit card minimum' })
		).toHaveCount(0);

		// A forged form that names it is refused in words.
		const response = await page.request.post('/loans/new/instalment', {
			form: { name: 'Sneaky', balance: '10', rate: '5', item: ITEM.card },
			headers: { origin: new URL(page.url()).origin }
		});
		expect(await response.text()).toContain('already belongs to Visa');
	});
});

test.describe
	.serial('TSK-1E7743 the check-in confirms the loans, and a card purchase is spending', () => {
	const since = () => addDays(today(), -DAYS_BACK);
	const SPENT = 12345; // 123.45 from the account
	const CARD_BOUGHT = 10000; // 100.00 more on the Visa than expected
	const scheduledPay = () =>
		incomeDueSince(items(), [], since(), today()).reduce((n, o) => n + o.amount, 0);
	const due = () => paymentsDueSince(items(), [], since(), today());
	const expectedIfAllPaid = () =>
		parseMinor(BALANCE) + scheduledPay() - due().reduce((n, o) => n + o.amount, 0);
	const actual = () => expectedIfAllPaid() - SPENT;

	const row = (page: Page, name: string) => page.getByTestId('loan-line').filter({ hasText: name });

	test('TSK-1E7743 the loans step comes after the payments, as a sixth step, with expected balances filled in', async ({
		page
	}) => {
		await saveBalance(page, BALANCE, since());
		await page.goto('/checkin');
		await button(page, 'Start my check-in').click();
		await expect(page.getByTestId('progress')).toHaveText('Step 1 of 6');
		await page.getByLabel('How much arrived?').fill(formatMinor(scheduledPay()));
		await button(page, 'Continue').click();
		await page.getByLabel('Balance in your account').fill(formatMinor(actual()));
		await button(page, 'Continue').click();

		// The card caveat is gone: a card is in the ledger.
		await expect(page.getByTestId('card-note')).toHaveCount(0);
		await expect(page.getByTestId('card-counted')).toBeVisible();
		await button(page, 'Continue').click();

		const rows = page.getByTestId('payment');
		for (let i = 0; i < due().length; i++) {
			await rows.nth(i).getByRole('radio', { name: 'It went out' }).check();
		}
		await button(page, 'Continue').click();

		await expect(page.getByTestId('progress')).toHaveText('Step 5 of 6');
		await expect(page.getByRole('heading', { name: 'What do you owe now?' })).toBeVisible();
		await expect(page.getByTestId('loan-line')).toHaveCount(4);
		await expect(row(page, 'Visa').getByRole('textbox')).toHaveValue('1,800.00');
		await expect(row(page, 'Visa')).toContainText('Payday expects $1,800.00');
		await expect(row(page, 'Visa')).toContainText('counts as spending on the card');
		await expect(row(page, 'Car loan').getByRole('textbox')).toHaveValue('6,400.00');
		await expect(row(page, 'Loan from Dad').getByRole('textbox')).toHaveValue('500.00');
		await expect(row(page, 'Laptop plan').getByRole('textbox')).toHaveValue('0.00');
		await expect(row(page, 'Loan from Dad')).not.toContainText('counts as spending');
	});

	test('TSK-1E7743 a loan balance that is not a number is explained and the step stays', async ({
		page
	}) => {
		await page.goto('/checkin');
		await row(page, 'Car loan').getByRole('textbox').fill('plenty');
		await button(page, 'Continue').click();
		await expect(page.getByText('Use numbers only')).toBeVisible();
		await expect(page.getByTestId('progress')).toHaveText('Step 5 of 6');
		await expect(row(page, 'Car loan').getByRole('textbox')).toHaveValue('plenty');
	});

	test('TSK-5A6861 one balance is corrected, the rest confirmed with a tap; the card purchase counts as spending', async ({
		page
	}) => {
		await page.goto('/checkin');
		await row(page, 'Car loan').getByRole('textbox').fill('6,400.00');
		await row(page, 'Visa')
			.getByRole('textbox')
			.fill(formatMinor(180000 + CARD_BOUGHT));
		await button(page, 'Continue').click();

		await expect(page.getByTestId('progress')).toHaveText('Step 6 of 6');
		await expect(page.getByTestId('spending-final')).toHaveText(
			`You spent ${money(SPENT + CARD_BOUGHT)}`
		);
		await expect(page.getByTestId('card-purchases')).toContainText(
			`${money(CARD_BOUGHT)} bought on your credit card`
		);
	});

	test('TSK-1E7743 saving ends with the loans on their confirmed balances and the card purchase in what was spent', async ({
		page
	}) => {
		await page.goto('/checkin');
		await button(page, 'Save my check-in').click();
		await expect(page).toHaveURL(/\/checkin\/done$/);
		await expect(page.getByTestId('done-summary')).toContainText(
			`You spent ${money(SPENT + CARD_BOUGHT)} since your last check-in`
		);

		await page.goto('/loans');
		await expect(loanCard(page, 'Visa').getByTestId('loan-balance')).toHaveText(money(190000));
		await expect(loanCard(page, 'Car loan').getByTestId('loan-balance')).toHaveText(money(640000));
		await expect(page.getByTestId('total-owed')).toHaveText(money(190000 + 640000 + 50000));
	});

	test('TSK-2AAB96 the total owed is listed for the check-in, with no change yet', async ({
		page
	}) => {
		await page.goto('/loans');
		const rows = page.getByTestId('total-row');
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText(dateText(today()));
		await expect(rows.first()).toContainText(money(190000 + 640000 + 50000));
		await expect(page.getByTestId('total-change')).toHaveCount(0);
	});

	test('TSK-2AAB96 a second check-in lists its total above the first, with the change since', async ({
		page
	}) => {
		await page.goto('/checkin');
		await button(page, 'Start my check-in').click();
		await expect(page.getByText('No pay was due since')).toBeVisible();
		await button(page, 'Continue').click(); // pay: not yet
		await page.getByLabel('Balance in your account').fill(BALANCE);
		await button(page, 'Continue').click();
		await button(page, 'Continue').click(); // spending
		await expect(page.getByText('Nothing was due since')).toBeVisible();
		await button(page, 'Continue').click(); // payments: none

		// The Visa was paid down by 50.00 since; the rest is as it was.
		await expect(page.getByTestId('progress')).toHaveText('Step 5 of 6');
		await expect(row(page, 'Visa').getByRole('textbox')).toHaveValue('1,900.00');
		await row(page, 'Visa').getByRole('textbox').fill('1,850.00');
		await button(page, 'Continue').click();
		await button(page, 'Save my check-in').click();
		await expect(page).toHaveURL(/\/checkin\/done$/);

		await page.goto('/loans');
		const rows = page.getByTestId('total-row');
		await expect(rows).toHaveCount(2);
		await expect(rows.nth(0)).toContainText(money(185000 + 640000 + 50000));
		await expect(rows.nth(0).getByTestId('total-change')).toContainText(
			`Down ${money(5000)} since the check-in before`
		);
		await expect(rows.nth(1)).toContainText(money(190000 + 640000 + 50000));
	});

	test('TSK-5A6861 the household is as the other projects expect: the balance is back and nothing is owed on the schedule', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.getByTestId('missed-tag')).toHaveCount(0);
		await expect(page.getByTestId('stale-warning')).toHaveCount(0);
		await expect(page.getByTestId('based-on')).toContainText(`balance of ${money(230000)}`);
		await page.goto('/checkin/history');
		await expect(page.getByTestId('history-row')).toHaveCount(4);
	});

	test('TSK-4E012E home and the paychecks plan link to what I owe', async ({ page }) => {
		await page.goto('/');
		await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Loans' })
			.click();
		await expect(page).toHaveURL(/\/loans$/);
		await page.goto('/plan');
		await page
			.getByRole('main')
			.getByRole('link', { name: /What I owe/ })
			.click();
		await expect(page).toHaveURL(/\/loans$/);
	});

	test('TSK-A641F9 a loan paid off is closed and leaves the list, without being deleted', async ({
		page
	}) => {
		await page.goto('/loans');
		await loanCard(page, 'Laptop plan').getByRole('link', { name: 'Laptop plan' }).click();
		await page.locator('summary', { hasText: 'Paid it off?' }).click();
		await button(page, 'Yes, it is paid off').click();
		await expect(page).toHaveURL(/\/loans$/);
		await expect(page.getByTestId('loan')).toHaveCount(3);
		await expect(loanCard(page, 'Laptop plan')).toHaveCount(0);
		// Its payment is a free payment again.
		await page.goto(`/schedule/${ITEM.laptop}`);
		await expect(page.getByRole('button', { name: 'This is a loan' })).toBeVisible();
	});
});
