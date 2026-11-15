import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from './support/test.ts';
import { nextPayday } from '../src/lib/domain/periods.ts';
import { planPaychecks } from '../src/lib/domain/plan.ts';
import type { Item } from '../src/lib/domain/schedule.ts';
import { dateText, moneyText, ruleText } from '../src/lib/format.ts';
import { checkNewItem } from '../src/lib/server/money/validate.ts';
import { SIGNED_OUT, signInWithPassword } from './support/auth.ts';
import { CURRENCY, JOURNEY_TIME_ZONE, expectedNumber, todayNow } from './support/household.ts';

/*
 * Owners who are not paid every two weeks, run once on a phone (the `rhythm` project) after every
 * other project. Each owner sets up, does a payday update, and sees the next payday the engine
 * computes from the same inputs; nothing in their pages talks of 14 days or two weeks; the home
 * screen's JavaScript stays inside the 60 KB budget. Starting over between the two owners also
 * proves a monthly owner can follow a twice-a-month one. It signs in with the password: the
 * sessions the other projects started from are gone by now. The run ends on a finished budget.
 */

const HOME_JS_GZIP_BUDGET = 60 * 1024;
const money = (n: number) => moneyText(n, CURRENCY);
const today = () => todayNow();

const PAY = '1,500.00';
const BALANCE = '2,000.00';
const BILLS = [
	{ name: 'Rent', amount: '1,000.00', day: '1' },
	{ name: 'Phone', amount: '40.00', day: '20' }
];

type Rhythm = { label: RegExp; form: Record<string, string>; fill: (page: Page) => Promise<void> };

const TWICE: Rhythm = {
	label: /Twice a month/,
	form: { repeat: 'twiceMonthly', day: '15', day2: '31' },
	fill: async (page) => {
		await page.getByLabel('First day of the month you are paid').fill('15');
		await page.getByLabel('Second day of the month you are paid').fill('31');
	}
};

const MONTHLY: Rhythm = {
	label: /Once a month/,
	form: { repeat: 'monthly', day: '25' },
	fill: async (page) => {
		await page.locator('#setup-day').fill('25');
	}
};

/** The household as the app stores it: one main pay, then the bills. Same checks the server makes. */
function items(rhythm: Rhythm): Item[] {
	const forms: [Parameters<typeof checkNewItem>[0], Record<string, unknown>, boolean][] = [
		['income', { name: 'Pay', amount: PAY, ...rhythm.form }, true],
		...BILLS.map(
			(b) =>
				['bill', { name: b.name, amount: b.amount, repeat: 'monthly', day: b.day }, false] as [
					Parameters<typeof checkNewItem>[0],
					Record<string, unknown>,
					boolean
				]
		)
	];
	return forms.map(([kind, form, main], i) => {
		const checked = checkNewItem(kind, form, today());
		if (!checked.ok)
			throw new Error(`Test household is invalid: ${JSON.stringify(checked.problems)}`);
		return { ...checked.value, id: String(i + 1), ...(main ? { main: true as const } : {}) };
	});
}

/** Words that would say the owner is paid every two weeks. */
const FORTNIGHT = /14 days|two weeks|2 weeks|fortnight/i;

/** What a page says, less the few lines that are about something else on purpose. */
async function pageText(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
	const text = await page.locator('body').innerText();
	return text
		.replace('Every two weeks, twice a month, or once a month.', '') // Settings' link to this choice
		.replace(/more than two weeks old/g, '') // the backup reminder, about backups
		.replace(/more than two weeks\./g, '');
}

async function expectNoFortnightWords(page: Page) {
	for (const path of [
		'/',
		'/plan',
		'/checkin',
		'/checkin/done',
		'/settings',
		'/settings/reminders'
	]) {
		expect(await pageText(page, path), `${path} must not talk of two weeks`).not.toMatch(FORTNIGHT);
	}
}

/** A setup page says nothing of two weeks, except the "Every two weeks" and "Every 2 weeks" choice labels (the pay's and a bill's). */
async function expectSetupPageClean(page: Page, step: string) {
	const text = (await page.locator('body').innerText()).replace(/Every (two|2) weeks/g, '');
	expect(text, `setup (${step}) must not talk of two weeks`).not.toMatch(FORTNIGHT);
}

/** Runs guided setup from its welcome screen to the finished home screen. */
async function setUp(page: Page, rhythm: Rhythm) {
	await page.goto('/setup');
	await expect(page.getByRole('heading', { name: "Let's set up Payday" })).toBeVisible();
	await expectSetupPageClean(page, 'welcome');
	await page.getByRole('button', { name: 'Start' }).click();

	await expect(page.getByRole('heading', { name: 'Your currency and time zone' })).toBeVisible();
	await page.waitForLoadState('networkidle'); // the guess is made once the page has hydrated
	await expect(page.getByLabel('Time zone')).toHaveValue(JOURNEY_TIME_ZONE);
	await expectSetupPageClean(page, 'region');
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Your pay' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Pay each payday').fill(PAY);
	await page.getByRole('radio', { name: rhythm.label }).check();
	await rhythm.fill(page);
	await expectSetupPageClean(page, 'pay');
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'What is in your account today?' })).toBeVisible();
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Balance', { exact: true }).fill(BALANCE);
	await expectSetupPageClean(page, 'balance');
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Your bills' })).toBeVisible();
	await expectSetupPageClean(page, 'bills');
	for (const [i, bill] of BILLS.entries()) {
		await page.getByLabel('What is it called?').fill(bill.name);
		await page.getByLabel('How much is each payment?').fill(bill.amount);
		await page.getByRole('radio', { name: 'Every month' }).check();
		await page.getByLabel('Day of the month').fill(bill.day);
		const last = i === BILLS.length - 1;
		await page.getByRole('button', { name: last ? "That's all" : 'Add another' }).click();
		if (!last) await expect(page.getByTestId('added')).toContainText(bill.name);
	}

	await expect(page.getByRole('heading', { name: 'Loan payments' })).toBeVisible();
	await expectSetupPageClean(page, 'loans');
	await page.getByRole('button', { name: "That's all" }).click();

	const expected = expectedNumber(today(), { items: items(rhythm), balance: BALANCE });
	await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
	await expectSetupPageClean(page, 'all set');
	await expect(page.getByTestId('safe-to-spend')).toHaveText(money(expected.amount));
	await expect(
		page.getByText(`Safe to spend until ${dateText(expected.nextPayday)}`)
	).toBeVisible();
	await page.getByRole('button', { name: 'Open Payday' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByTestId('safe-to-spend')).toHaveText(money(expected.amount));
}

/** A payday update with nothing due since the balance: the same balance, nothing spent. */
async function doPaydayUpdate(page: Page, rhythm: Rhythm) {
	const button = (name: string) => page.getByRole('button', { name, exact: true });
	await page.goto('/checkin');
	await button('Start my payday update').click();
	const progress = page.getByTestId('progress');
	for (let step = 0; step < 6; step++) {
		if (await button('Save my payday update').count()) break;
		const before = (await progress.textContent()) ?? '';
		const balance = page.getByLabel('Balance in your account');
		if (await balance.count()) await balance.fill(BALANCE);
		await button('Next').click();
		await expect(progress).not.toHaveText(before);
	}
	await button('Save my payday update').click();
	await expect(page).toHaveURL(/\/checkin\/done$/);

	const expected = expectedNumber(today(), { items: items(rhythm), balance: BALANCE });
	await expect(page.getByTestId('safe-to-spend')).toHaveText(money(expected.amount));
	await expect(
		page.getByText(`You can spend until ${dateText(expected.nextPayday)}`)
	).toBeVisible();
}

/** The plan's first paychecks are the paydays the engine finds for this pay. */
async function expectPlan(page: Page, rhythm: Rhythm) {
	const all = items(rhythm);
	const [first, second] = planPaychecks(all, [], today(), 2);
	expect(second.payday > first.payday).toBe(true);
	await page.goto('/plan');
	const cards = page.getByTestId('paycheck');
	await expect(cards.nth(0)).toHaveAttribute('data-payday', first.payday);
	await expect(cards.nth(1)).toHaveAttribute('data-payday', second.payday);
	// The payday after today is the one the home screen counts to.
	expect(nextPayday(all, [], today())).not.toBeNull();
}

/** Settings says how the owner is paid, in the rhythm's own words. */
async function expectSettings(page: Page, rhythm: Rhythm) {
	await page.goto('/settings/pay');
	const rule = items(rhythm)[0].rule;
	await expect(page.getByTestId('current-rhythm')).toContainText(ruleText(rule));
}

/** Loads the home screen in a clean browser (no cache) and totals its scripts, gzipped. */
async function homeScriptKb(page: Page): Promise<number> {
	const info = test.info();
	const use = info.project.use;
	const context = await page
		.context()
		.browser()!
		.newContext({
			serviceWorkers: 'block',
			baseURL: use.baseURL,
			storageState: await page.context().storageState(),
			viewport: use.viewport,
			userAgent: use.userAgent,
			deviceScaleFactor: use.deviceScaleFactor,
			isMobile: use.isMobile,
			hasTouch: use.hasTouch,
			locale: use.locale,
			timezoneId: use.timezoneId,
			extraHTTPHeaders: use.extraHTTPHeaders
		});
	const fresh = await context.newPage();
	const scripts = new Map<string, number>();
	fresh.on('response', async (response) => {
		if (response.request().resourceType() !== 'script') return;
		const body = await response.body().catch(() => null);
		if (body) scripts.set(response.url(), gzipSync(body, { level: 9 }).length);
	});
	await fresh.goto('/', { waitUntil: 'networkidle' });
	await expect(fresh.getByTestId('safe-to-spend')).toBeVisible();
	await context.close();
	const total = [...scripts.values()].reduce((sum, bytes) => sum + bytes, 0);
	const kb = total / 1024;
	info.annotations.push({
		type: 'home-js-gzip-bytes',
		description: `${total} bytes across ${scripts.size} scripts`
	});
	console.log(`home screen JS (${info.title}): ${kb.toFixed(1)} KB gzipped, ${scripts.size} files`);
	expect(total).toBeGreaterThan(0);
	expect(total).toBeLessThanOrEqual(HOME_JS_GZIP_BUDGET);
	return kb;
}

test.describe.serial('TSK-AE3A14 TSK-766633 owners paid twice a month and once a month', () => {
	test.use({ storageState: SIGNED_OUT });
	test.setTimeout(180_000);

	test('TSK-AE3A14 TSK-766633 a twice-a-month owner sets up, does a payday update and sees the next payday', async ({
		page
	}) => {
		await signInWithPassword(page);
		await expect(page).toHaveURL(/\/setup$/); // the reset before this left the owner at setup
		await setUp(page, TWICE);
		await doPaydayUpdate(page, TWICE);
		await expectPlan(page, TWICE);
		await expectSettings(page, TWICE);
		await expectNoFortnightWords(page);
		await homeScriptKb(page);
	});

	test('TSK-AE3A14 TSK-766633 starting over, a monthly owner gets the same', async ({ page }) => {
		await signInWithPassword(page);
		await expect(page.getByTestId('safe-to-spend')).toBeVisible();

		const startOver = page.getByRole('region', { name: 'Start over' });
		await page.goto('/settings/security');
		await startOver.getByLabel('Type DELETE to confirm').fill('DELETE');
		await startOver.getByRole('button', { name: 'Delete my budget and start over' }).click();
		await expect(page).toHaveURL(/\/setup$/);
		await expect(page.getByText('Your budget was deleted.')).toBeVisible();

		await setUp(page, MONTHLY);
		await doPaydayUpdate(page, MONTHLY);
		await expectPlan(page, MONTHLY);
		await expectSettings(page, MONTHLY);
		await expectNoFortnightWords(page);
		await homeScriptKb(page);
	});
});
