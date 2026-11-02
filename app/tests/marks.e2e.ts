import { expect, test, type Page } from '@playwright/test';
import { listLines, paycheckList } from '../src/lib/domain/paycheckList.ts';
import { planPaychecks } from '../src/lib/domain/plan.ts';
import type { Item } from '../src/lib/domain/schedule.ts';
import { listEntries } from '../src/lib/server/money/paycheckListView.ts';
import { BALANCE, householdItems, todayNow, yesterday } from './support/household.ts';

/*
 * The one test that changes the household's marks: it runs in its own project, at iPhone size,
 * after every read-only project, and puts everything back at the end. Ids follow the order the
 * journey created the items: Phone is 3, Internet 5.
 */

const PHONE = '3';
const INTERNET = '5';
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

		// Mark the first phone bill on the plan paid.
		await page.goto('/plan');
		await page
			.getByRole('button', { name: /^Paid: Phone,/ })
			.first()
			.click();
		await expect(page).toHaveURL(/\/plan#paycheck-\d{4}-\d{2}-\d{2}$/);
		const undo = page.getByRole('button', { name: /^Undo paid: Phone,/ });
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
		await expect(page.getByRole('button', { name: /^Undo paid:/ })).toHaveCount(0);
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
