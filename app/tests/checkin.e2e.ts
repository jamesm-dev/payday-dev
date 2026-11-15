import { expect, test, type Locator, type Page } from '@playwright/test';
import { incomeDueSince, paymentsDueSince } from '../src/lib/domain/checkin.ts';
import { addDays, type CalDate } from '../src/lib/domain/dates.ts';
import { formatMinor, minor, parseMinor } from '../src/lib/domain/money.ts';
import { paydays } from '../src/lib/domain/periods.ts';
import { planPaychecks } from '../src/lib/domain/plan.ts';
import { safeToSpend } from '../src/lib/domain/safeToSpend.ts';
import { dateText, moneyText } from '../src/lib/format.ts';
import { BALANCE, CURRENCY, householdItems, todayNow, yesterday } from './support/household.ts';
import { parseCalendar } from './support/ics.ts';

/*
 * The payday check-in, run once on a phone (the `checkin` project) after the journey and before the
 * read-only projects. It changes the shared database, so it ends by putting the household back: the
 * missed payment is confirmed paid at a second check-in, and the balance is the journey's again.
 * Every number it expects comes from the domain engine, given the same inputs and today's date.
 */

const money = (n: number) => moneyText(n, CURRENCY);
const today = () => todayNow();
/** How long ago the balance was last true: far enough that a payday and bills lie between. */
const DAYS_BACK = 16;

/** The household as the journey leaves it. */
const items = () =>
	householdItems(today(), {
		loanEnded: true,
		gym: { amount: '35.00', endsOn: yesterday(today()) }
	});

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

const button = (page: Page | Locator, name: string) =>
	page.getByRole('button', { name, exact: true });

test.describe.serial('TSK-B64CC9 a payday check-in is completed at phone size', () => {
	const since = () => addDays(today(), -DAYS_BACK);
	const SPENT = 12345; // the 123.45 the owner "spent" on groceries and the like

	// What the check-in should work out, from the engine.
	const scheduledPay = () =>
		incomeDueSince(items(), [], since(), today()).reduce((n, o) => n + o.amount, 0);
	const due = () => paymentsDueSince(items(), [], since(), today());
	const expectedIfAllPaid = () =>
		parseMinor(BALANCE) + scheduledPay() - due().reduce((n, o) => n + o.amount, 0);
	const actual = () => expectedIfAllPaid() - SPENT;

	test('TSK-47ADF0 the home screen offers the check-in, and starts from a balance that is a few weeks old', async ({
		page
	}) => {
		await saveBalance(page, BALANCE, since());
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Update' })
		).toBeVisible();
		await expect(page.getByTestId('stale-warning')).toBeVisible();

		// On a real payday the home screen nudges; on any other day it does not.
		const isPayday = paydays(items(), [], today(), today()).length > 0;
		const prompt = page.getByTestId('checkin-prompt');
		if (isPayday) {
			await expect(prompt).toContainText("It's payday: do your payday update");
		} else {
			await expect(prompt).toHaveCount(0);
		}
	});

	test('TSK-47ADF0 starting asks first whether the pay landed, with the amount from the schedule', async ({
		page
	}) => {
		await page.goto('/checkin');
		await expect(page.getByRole('heading', { name: 'Payday update' })).toBeVisible();
		await expect(page.getByText('about five minutes')).toBeVisible();
		await button(page, 'Start my payday update').click();

		await expect(page.getByTestId('progress')).toHaveText('Step 1 of 5');
		await expect(page.getByRole('heading', { name: 'Did you get your pay?' })).toBeVisible();
		await expect(page.getByLabel('How much did you get?')).toHaveValue(formatMinor(scheduledPay()));
		await expect(page.getByRole('radio', { name: 'Yes, I got it' })).toBeChecked();

		// A forged or empty answer is explained, and the step stays.
		await page.getByLabel('How much did you get?').fill('lots');
		await button(page, 'Next').click();
		await expect(page.getByText('Use numbers only')).toBeVisible();
		await expect(page.getByTestId('progress')).toHaveText('Step 1 of 5');
		await page.getByLabel('How much did you get?').fill(formatMinor(scheduledPay()));
		await button(page, 'Next').click();
		await expect(page.getByTestId('progress')).toHaveText('Step 2 of 5');
	});

	test('TSK-47ADF0 a step survives a dropped connection: a new page resumes where it stopped, and home says so', async ({
		page,
		browser,
		baseURL
	}) => {
		await page.goto('/');
		await expect(page.getByTestId('checkin-prompt')).toContainText(
			'Your payday update is not finished'
		);

		const other = await browser.newContext({
			baseURL,
			storageState: await page.context().storageState(),
			extraHTTPHeaders: { 'x-forwarded-proto': 'http' }
		});
		const resumed = await other.newPage();
		await resumed.goto('/checkin');
		await expect(resumed.getByTestId('progress')).toHaveText('Step 2 of 5');
		await expect(
			resumed.getByRole('heading', { name: 'How much money is in your account?' })
		).toBeVisible();
		await other.close();
	});

	test('TSK-8A4CF1 the balance gives expected, actual and the spending, and the card caveat is plain', async ({
		page
	}) => {
		await page.goto('/checkin');
		await page.getByLabel('Balance in your account').fill(formatMinor(actual()));
		await button(page, 'Next').click();

		await expect(page.getByTestId('progress')).toHaveText('Step 3 of 5');
		await expect(page.getByTestId('spending')).toHaveText(`You spent ${money(SPENT)}`);
		await expect(page.getByTestId('expected')).toHaveText(money(expectedIfAllPaid()));
		await expect(page.getByTestId('actual')).toHaveText(money(actual()));
		await expect(page.getByTestId('card-note')).toContainText(
			'Credit card spending is counted only when you pay the card'
		);
		await button(page, 'Next').click();
		await expect(page.getByTestId('progress')).toHaveText('Step 4 of 5');
	});

	test('TSK-6553DA each payment is confirmed or marked missed, and none can be skipped', async ({
		page
	}) => {
		await page.goto('/checkin');
		const rows = page.getByTestId('payment');
		await expect(rows).toHaveCount(due().length);
		for (const [i, o] of due().entries()) {
			await expect(rows.nth(i)).toContainText(o.name);
			await expect(rows.nth(i)).toContainText(dateText(o.date));
			await expect(rows.nth(i)).toContainText(money(o.amount));
		}

		// Nothing chosen yet: asked to choose, and the step stays.
		await button(page, 'Next').click();
		await expect(page.getByText('Choose if this payment is paid.').first()).toBeVisible();
		await expect(page.getByTestId('progress')).toHaveText('Step 4 of 5');

		await rows.first().getByRole('radio', { name: 'No, not paid' }).check();
		for (let i = 1; i < due().length; i++) {
			await rows.nth(i).getByRole('radio', { name: 'Yes, paid' }).check();
		}
		await button(page, 'Next').click();
		await expect(page.getByTestId('progress')).toHaveText('Step 5 of 5');
	});

	test('TSK-6553DA the missed payment is not taken off what you should have, so the spending is settled on it', async ({
		page
	}) => {
		await page.goto('/checkin');
		const missed = due()[0];
		// Spending = (expected if all paid + the missed payment, which never left) - actual.
		await expect(page.getByTestId('spending-final')).toHaveText(
			`You spent ${money(SPENT + missed.amount)}`
		);
		const note = page.getByTestId('missed-note');
		await expect(note).toContainText(missed.name);
		await expect(note).toContainText(money(missed.amount));
		await expect(page.getByText(`${money(actual())} becomes your balance for today`)).toBeVisible();
	});

	test('TSK-7DCF09 saving ends on the new number, the next 14 days and the first paycheck', async ({
		page
	}) => {
		await page.goto('/checkin');
		await button(page, 'Save my payday update').click();
		await expect(page).toHaveURL(/\/checkin\/done$/);

		const missed = due()[0];
		const number = safeToSpend({
			items: items(),
			overrides: [],
			balance: minor(actual()),
			balanceAsOf: today(),
			today: today(),
			outstanding: [missed]
		});
		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(number.amount));
		await expect(
			page.getByText(`You can spend until ${dateText(number.nextPayday)}`)
		).toBeVisible();
		await expect(page.getByTestId('done-summary')).toContainText(
			`You spent ${money(SPENT + missed.amount)} since your last payday update`
		);
		await expect(page.getByTestId('done-summary')).toContainText(
			/It took \d+ (second|seconds|minute|minutes)/
		);
		await expect(page.getByTestId('owed')).toContainText(missed.name);

		// The next 14 days: every pay and payment the engine puts in (today, today + 14].
		const upcoming = page.getByTestId('next14').getByRole('listitem');
		const expectedUpcoming = [...incomeAndPayments(today(), addDays(today(), 14))];
		if (expectedUpcoming.length === 0) {
			await expect(page.getByTestId('next14-empty')).toBeVisible();
		} else {
			await expect(upcoming).toHaveCount(expectedUpcoming.length);
		}

		// The first paycheck, linked to the full plan.
		const first = planPaychecks(items(), [], today(), 1)[0];
		const card = page.getByTestId('paycheck');
		await expect(card).toHaveAttribute('data-payday', first.payday);
		await expect(card).toContainText(money(first.pay));
		await page.getByRole('link', { name: 'See the next six paychecks' }).click();
		await expect(page).toHaveURL(/\/plan$/);
	});

	test('TSK-6553DA the missed payment stays reserved on the home screen, marked, and the number holds it back', async ({
		page
	}) => {
		const missed = due()[0];
		const number = safeToSpend({
			items: items(),
			overrides: [],
			balance: minor(actual()),
			balanceAsOf: today(),
			today: today(),
			outstanding: [missed]
		});
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(number.amount));
		const reserved = page.getByTestId('reserved').getByRole('listitem');
		await expect(reserved).toHaveCount(number.reserved.length);
		const owed = reserved
			.filter({ hasText: missed.name })
			.filter({ has: page.getByTestId('missed-tag') });
		await expect(owed).toHaveCount(1);
		await expect(owed).toContainText(money(missed.amount));
		await expect(owed).toContainText('Missed, still owed');
		// The balance is fresh, and no longer asks for a check-in today.
		await expect(page.getByTestId('stale-warning')).toHaveCount(0);
		await expect(page.getByTestId('checkin-prompt')).toHaveCount(0);
	});

	test('TSK-52A3DB the check-in is listed with its date, numbers and duration', async ({
		page
	}) => {
		await page.goto('/checkin/history');
		const rows = page.getByTestId('history-row');
		await expect(rows).toHaveCount(1);
		const missed = due()[0];
		await expect(rows.first()).toContainText(dateText(today()));
		await expect(rows.first()).toContainText(`You spent ${money(SPENT + missed.amount)}`);
		await expect(rows.first()).toContainText(money(actual()));
		await expect(rows.first()).toContainText(money(scheduledPay()));
		await expect(rows.first()).toContainText(/It took \d+ (second|seconds|minute|minutes)/);
	});

	test('TSK-6553DA the missed payment reappears at the next check-in until it is confirmed paid', async ({
		page
	}) => {
		const missed = due()[0];
		await page.goto('/checkin');
		await button(page, 'Start my payday update').click();

		// Step 1: nothing was due since this morning's balance.
		await expect(page.getByText('No pay was expected since')).toBeVisible();
		await expect(page.getByRole('radio', { name: 'No, not yet' })).toBeChecked();
		await button(page, 'Next').click();

		// Step 2: the balance the journey started from.
		await page.getByLabel('Balance in your account').fill(BALANCE);
		await button(page, 'Next').click();

		// Step 3 and 4: the missed payment is the only one listed, and says so.
		await button(page, 'Next').click();
		const rows = page.getByTestId('payment');
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText(missed.name);
		await expect(rows.first()).toContainText('Not paid before');
		await rows.first().getByRole('radio', { name: 'Yes, paid' }).check();
		await button(page, 'Next').click();
		await button(page, 'Save my payday update').click();
		await expect(page).toHaveURL(/\/checkin\/done$/);
		await expect(page.getByTestId('owed')).toHaveCount(0);
	});

	test('TSK-52A3DB both check-ins are listed, newest first', async ({ page }) => {
		await page.goto('/checkin/history');
		await expect(page.getByTestId('history-row')).toHaveCount(2);
	});

	test('TSK-6553DA once confirmed, nothing is owed and the household is as the journey left it', async ({
		page
	}) => {
		const number = safeToSpend({
			items: items(),
			overrides: [],
			balance: parseMinor(BALANCE),
			balanceAsOf: today(),
			today: today()
		});
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(number.amount));
		await expect(page.getByTestId('missed-tag')).toHaveCount(0);
	});

	test('TSK-47ADF0 a check-in can be stopped, and nothing it half-saved is kept', async ({
		page
	}) => {
		await page.goto('/checkin');
		await button(page, 'Start my payday update').click();
		await expect(page.getByTestId('progress')).toHaveText('Step 1 of 5');
		await page.locator('summary', { hasText: 'Stop this payday update' }).click();
		await button(page, 'Yes, stop this payday update').click();
		await expect(page).toHaveURL(/\/$/);
		await page.goto('/checkin');
		await expect(button(page, 'Start my payday update')).toBeVisible();
		await page.goto('/checkin/history');
		await expect(page.getByTestId('history-row')).toHaveCount(2);
	});
});

function incomeAndPayments(from: CalDate, to: CalDate) {
	const list = [
		...incomeDueSince(items(), [], addDays(from, 0), to),
		...paymentsDueSince(items(), [], addDays(from, 0), to)
	];
	return list;
}

test.describe.serial('TSK-E03C29 the payday reminder is set up from the settings page', () => {
	test('TSK-E03C29 explains itself first: the calendar file is the reminder', async ({ page }) => {
		await page.goto('/settings/reminders');
		await expect(page.getByRole('heading', { name: 'Payday reminders', level: 1 })).toBeVisible();
		await expect(page.getByTestId('explain')).toContainText('On every payday, at 09:00');
		await expect(page.getByTestId('explain')).toContainText('about five minutes');
		await expect(
			page.getByRole('heading', { name: 'Add your paydays to your calendar' })
		).toBeVisible();
		await expect(page.getByTestId('ics-link')).toBeVisible();
	});

	test('TSK-6F8EC9 the push reminder is gone: no subscribe route, no button', async ({ page }) => {
		await page.goto('/settings/reminders');
		await expect(page.getByRole('button', { name: /Turn on reminders/ })).toHaveCount(0);
		const gone = await page.request.post('/settings/reminders/subscribe', { data: {} });
		expect(gone.status()).toBe(404);
	});

	test('TSK-DC74DF the reminder time can be changed, and the calendar file follows it', async ({
		page
	}) => {
		await page.goto('/settings/reminders');
		await page.waitForLoadState('networkidle'); // the field is safe to use once the page has hydrated
		await page.getByLabel('Remind me at').fill('17:45');
		await button(page, 'Save the time').click();
		await expect(page.getByTestId('explain')).toContainText('On every payday, at 17:45');

		const ics = await page.request.get('/calendar.ics');
		const events = parseCalendar(await ics.text()).events;
		expect(events.length).toBeGreaterThan(20);
		for (const e of events) expect(e.DTSTART.endsWith('T174500')).toBe(true);

		// Back to 09:00, as the read-only projects expect.
		await page.waitForLoadState('networkidle');
		await page.getByLabel('Remind me at').fill('09:00');
		await button(page, 'Save the time').click();
		await expect(page.getByTestId('explain')).toContainText('On every payday, at 09:00');
	});

	test('TSK-E03C29 an impossible time is explained and nothing changes', async ({ page }) => {
		await page.goto('/settings/reminders');
		const response = await page.request.post('/settings/reminders?/time', {
			form: { time: '25:99' },
			headers: { origin: new URL(page.url()).origin }
		});
		expect(await response.text()).toContain('Choose a time of day, like 09:00.');
		await page.reload();
		await expect(page.getByTestId('explain')).toContainText('On every payday, at 09:00');
	});
});
