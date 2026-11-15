import { expect, test, type Page } from './support/test.ts';
import { listLines, paycheckList } from '../src/lib/domain/paycheckList.ts';
import { addDays, parseCalDate } from '../src/lib/domain/dates.ts';
import { minor, type Minor } from '../src/lib/domain/money.ts';
import { planPaychecks } from '../src/lib/domain/plan.ts';
import { nextPayday } from '../src/lib/domain/periods.ts';
import { expand, type Item } from '../src/lib/domain/schedule.ts';
import { listEntries } from '../src/lib/server/money/paycheckListView.ts';
import { moneyText } from '../src/lib/format.ts';
import { BALANCE, CURRENCY, householdItems, todayNow, yesterday } from './support/household.ts';

/*
 * The one test that changes the household's marks: it runs in its own project, at iPhone size,
 * after every read-only project, and puts everything back at the end. Ids follow the order the
 * journey created the items: Phone is 3, Internet 5.
 */

const PHONE = '3';
const INTERNET = '5';
const PHONE_NAME = 'Phone';
const today = () => todayNow();
const items = (labels: Record<string, Pick<Item, 'group' | 'optional'>> = {}) =>
	householdItems(today(), {
		loanEnded: true,
		gym: { amount: '35.00', endsOn: yesterday(today()) }
	}).map((i) => ({ ...i, ...labels[i.id] }));

async function editLabels(page: Page, name: string, group: string, optional: boolean) {
	await page.goto('/schedule');
	await page.getByRole('link', { name, exact: true }).click();
	await page.getByLabel('Group', { exact: true }).fill(group);
	await page.getByRole('checkbox', { name: /^Optional: I can skip/ }).setChecked(optional);
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page).toHaveURL(/\/schedule$/);
}

async function textOf(page: Page, payday: string) {
	const card = page.locator(`[data-testid="paycheck"][data-payday="${payday}"]`);
	// The file behind the card's Text file link, fetched with the page's session. Clicking it is
	// export.e2e.ts's job: WebKit on Linux, where CI runs this project, never fires that download.
	await card.getByLabel(/^Download the list for/).click();
	const href = await card
		.getByTestId('downloads')
		.getByRole('link', { name: 'Text file', exact: true })
		.getAttribute('href');
	await page.keyboard.press('Escape');
	const response = await page.request.get(href!);
	expect(response.status()).toBe(200);
	return response.text();
}

test.describe('TSK-C13066 grouping a bill, and marking one optional and one paid, at phone size', () => {
	test('the marks show on the schedule, the plan and the downloaded list, then come off', async ({
		page
	}) => {
		await editLabels(page, 'Phone', 'Utilities', false);
		await editLabels(page, 'Internet', 'Utilities', true);
		const bills = page.getByTestId('list-bill');
		await expect(bills.getByRole('listitem').filter({ hasText: 'Phone' })).toContainText(
			'Utilities'
		);
		await expect(bills.getByRole('listitem').filter({ hasText: 'Internet' })).toContainText(
			'Optional'
		);

		// The edit form shows what was saved.
		await page.getByRole('link', { name: 'Internet', exact: true }).click();
		await expect(page.getByLabel('Group', { exact: true })).toHaveValue('Utilities');
		await expect(page.getByRole('checkbox', { name: /^Optional: I can skip/ })).toBeChecked();

		// Mark the first phone bill on the plan paid early.
		await page.goto('/plan');
		await page
			.getByRole('button', { name: /^Paid early: Phone,/ })
			.first()
			.click();
		await expect(page).toHaveURL(/\/plan#paycheck-\d{4}-\d{2}-\d{2}$/);
		const undo = page.getByRole('button', { name: /^Undo paid early: Phone,/ });
		await expect(undo).toHaveCount(1);
		const card = page.getByTestId('paycheck').filter({ has: undo });
		const payday = (await card.getAttribute('data-payday'))!;
		await expect(card.locator('li[data-paid="yes"]')).toContainText('Phone');

		const { scroll, client } = await page.evaluate(() => ({
			scroll: document.documentElement.scrollWidth,
			client: document.documentElement.clientWidth
		}));
		expect(scroll).toBeLessThanOrEqual(client);

		// The downloaded list carries every mark, exactly as the engine lays it out.
		const labelled = items({
			[PHONE]: { group: 'Utilities' },
			[INTERNET]: { group: 'Utilities', optional: true }
		});
		const p = planPaychecks(labelled, [], today(), 6).find((x) => x.payday === payday)!;
		const phone = p.covers.find((o) => o.itemId === PHONE)!;
		const expected = listLines(
			paycheckList(
				p.pays.map((o) => ({ name: o.name, amount: o.amount })),
				listEntries(p, labelled, new Set([`${PHONE}|${phone.originalDate}`]))
			)
		);
		expect(expected).toContain('/45\tPhone');
		expect(await textOf(page, payday)).toBe(expected.map((l) => `${l}\r\n`).join(''));

		// Everything comes off again, so nothing outlives the test.
		await undo.click();
		await expect(page.getByRole('button', { name: /^Undo paid early:/ })).toHaveCount(0);
		await editLabels(page, 'Phone', '', false);
		await editLabels(page, 'Internet', '', false);
		await page.goto('/plan');
		const plain = items();
		const q = planPaychecks(plain, [], today(), 6).find((x) => x.payday === payday)!;
		const unmarked = listLines(
			paycheckList(
				q.pays.map((o) => ({ name: o.name, amount: o.amount })),
				listEntries(q, plain, new Set())
			)
		);
		expect(await textOf(page, payday)).toBe(unmarked.map((l) => `${l}\r\n`).join(''));
	});
});

/** "$1,234.56" or "-$12.00" as minor units. */
function toMinor(text: string): Minor {
	const cents = Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100);
	return minor(/[-−]/.test(text) ? -cents : cents);
}

test.describe('TSK-500C4F paying a later bill early on the plan, at phone size', () => {
	test('the number drops by exactly its amount, its paycheck stops holding it, and it comes back off', async ({
		page
	}) => {
		const now = new Date();
		const household = items();
		// A monthly bill in the second paycheck: due after the next payday, so the number does not
		// reserve it yet and paying it early is a clean drop.
		const paychecks = planPaychecks(household, [], today(), 6);
		const target = paychecks[1];
		const line = target.covers.find((o) => ['2', '3', '4', '5'].includes(o.itemId))!;
		expect(line).toBeTruthy();
		const amount = line.amount;

		await page.goto('/');
		const number = page.getByTestId('safe-to-spend');
		const before = toMinor(await number.innerText());

		await page.goto('/plan');
		const card = page.locator(`[data-testid="paycheck"][data-payday="${target.payday}"]`);
		await card
			.getByRole('button', { name: new RegExp(`^Paid early: ${line.name}, `) })
			.first()
			.click();
		await expect(page).toHaveURL(new RegExp(`/plan#paycheck-${target.payday}$`));
		await expect(card.locator('li[data-paid="yes"]')).toContainText('Paid early on');

		// The paycheck no longer holds it back: its left-over (or its shortfall) is what the engine
		// gives with the bill paid early today.
		const mark = {
			itemId: line.itemId,
			originalDate: line.originalDate,
			paidOn: parseCalDate(today()),
			markedAt: now.toISOString()
		};
		const early = planPaychecks(household, [], today(), 6, [mark])[1];
		expect(early.paidEarlyTotal).toBe(amount);
		expect(early.coversTotal).toBe(target.coversTotal - amount);
		if (early.short) {
			await expect(card.getByTestId('short')).toContainText(moneyText(early.shortBy, CURRENCY));
		} else {
			await expect(card.getByTestId('left')).toContainText(moneyText(early.left, CURRENCY));
		}

		const { scroll, client } = await page.evaluate(() => ({
			scroll: document.documentElement.scrollWidth,
			client: document.documentElement.clientWidth
		}));
		expect(scroll).toBeLessThanOrEqual(client);

		// The home number is lower by exactly the bill.
		await page.goto('/');
		expect(toMinor(await number.innerText())).toBe(before - amount);

		// Take the mark off: the number and the paycheck are as they were.
		await page.goto('/plan');
		await card.getByRole('button', { name: /^Undo paid early:/ }).click();
		await expect(page.getByRole('button', { name: /^Undo paid early:/ })).toHaveCount(0);
		await page.goto('/');
		expect(toMinor(await number.innerText())).toBe(before);
	});
});

test.describe('TSK-342C1F paying a bill early from the home screen, at phone size', () => {
	test('a bill due before the next payday is marked there, the number stays, and it comes off', async ({
		page
	}) => {
		const household = items();
		const next = nextPayday(household, [], today())!;
		// The first bill dated after today and on or before the next payday: kept aside in the number.
		const found = expand(household, [], addDays(today(), 1), next).find((o) => o.kind !== 'income');

		await page.goto('/');
		const number = page.getByTestId('safe-to-spend');
		const start = toMinor(await number.innerText());

		// None falls there on some dates: move Phone's next payment to the first day inside the window
		// (tomorrow, always before the next payday) with the schedule's own Change, and undo it at the end.
		const name = found?.name ?? PHONE_NAME;
		const rows = page.getByTestId('payments').getByRole('listitem');
		let moved = '';
		if (!found) {
			await page.goto(`/schedule/${PHONE}`);
			moved = (await rows.first().getAttribute('data-original'))!;
			await rows.first().locator('summary', { hasText: 'Change' }).click();
			await rows.first().getByLabel('New date').fill(addDays(today(), 1));
			await rows.first().getByRole('button', { name: 'Save this change' }).click();
			await expect(rows.first()).toContainText('Changed');
			await page.goto('/');
		}
		const before = toMinor(await number.innerText());
		await expect(page.getByTestId('paid-early-help')).toContainText(
			'Your number stays the same: the money was kept aside for it.'
		);
		const kept = page.getByTestId('reserved');
		const row = kept.getByRole('listitem').filter({ hasText: name });
		await expect(row.first()).toBeVisible();
		await row
			.getByRole('button', { name: new RegExp(`^Paid early: ${name}, `) })
			.first()
			.click();

		// Back on the home screen with the flash; the number is as it was and the line shows paid early.
		await expect(page).toHaveURL(/\/#kept-aside$/);
		await expect(page.getByRole('status')).toContainText('Marked paid early.');
		expect(toMinor(await number.innerText())).toBe(before);
		const early = page.getByTestId('paid-early-lines');
		await expect(early).toContainText(name);
		await expect(early).toContainText('Paid early on');

		// Take the mark off: the household is as the other projects expect it.
		await early
			.getByRole('button', { name: new RegExp(`^Undo paid early: ${name}, `) })
			.first()
			.click();
		await expect(page.getByTestId('paid-early-lines')).toHaveCount(0);
		expect(toMinor(await number.innerText())).toBe(before);

		if (moved) {
			await page.goto(`/schedule/${PHONE}`);
			await rows.first().getByRole('button', { name: /Undo/ }).click();
			await expect(rows.first()).not.toContainText('Changed');
			await expect(rows.first()).toHaveAttribute('data-original', moved);
		}
		await page.goto('/');
		expect(toMinor(await number.innerText())).toBe(start);
	});
});

test.describe('saving the balance says so', () => {
	test('shows "Balance updated." in a status banner, gone after the next page', async ({
		page
	}) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle'); // the form is safe to use once the page has hydrated
		const form = page.locator('#update-balance');
		if (!(await form.evaluate((el: HTMLDetailsElement) => el.open))) {
			await form.locator('summary').click();
		}
		// The household's own balance, so nothing outlives the test.
		await form.getByLabel('Balance in your account').fill(BALANCE);
		await form.getByLabel('True on').fill(today());
		await form.getByRole('button', { name: 'Save balance' }).click();
		await expect(page.getByRole('status').filter({ hasText: 'Balance updated.' })).toBeVisible();

		await page.goto('/plan');
		await expect(page.getByText('Balance updated.')).toHaveCount(0);
	});
});

test.describe('saving a bill says so', () => {
	test('saving a bill unchanged shows "Changes saved." on the list', async ({ page }) => {
		await page.goto('/schedule');
		await page.getByRole('link', { name: 'Phone', exact: true }).click();
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page).toHaveURL(/\/schedule$/);
		await expect(page.getByRole('status').filter({ hasText: 'Changes saved.' })).toBeVisible();
	});
});

test.describe('saving a loan says so', () => {
	test('saving a loan unchanged shows "Changes saved." on the list', async ({ page }) => {
		await page.goto('/loans');
		await page.getByTestId('loan').first().getByRole('link').click();
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page).toHaveURL(/\/loans$/);
		await expect(page.getByRole('status').filter({ hasText: 'Changes saved.' })).toBeVisible();
	});
});
