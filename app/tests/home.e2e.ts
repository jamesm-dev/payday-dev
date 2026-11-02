import { expect, test, type Page } from '@playwright/test';
import { dateText, moneyText } from '../src/lib/format.ts';
import {
	CURRENCY,
	expectedNumber,
	householdItems,
	todayNow,
	yesterday
} from './support/household.ts';

/*
 * Read-only checks of the home screen, on every project. The `journey` project has already set the
 * fixture household up, so the number to expect is the engine's, from the same inputs. A test here
 * changes nothing that outlives it.
 */

const money = (n: number) => moneyText(n, CURRENCY);

/** What the household looks like once the journey has finished with it. */
function finished() {
	const today = todayNow();
	const items = householdItems(today, {
		loanEnded: true,
		gym: { amount: '35.00', endsOn: yesterday(today) }
	});
	return { today, expected: expectedNumber(today, { items }) };
}

/** Nothing may scroll sideways: a phone screen has no room for it. */
async function expectNoSidewaysScroll(page: Page) {
	const { scroll, client } = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth,
		client: document.documentElement.clientWidth
	}));
	expect(scroll).toBeLessThanOrEqual(client);
}

test.describe('TSK-997E16 TSK-213DCD the home screen shows the number from the engine', () => {
	test('shows the safe-to-spend number, the next payday and what is reserved', async ({ page }) => {
		const { today, expected } = finished();
		await page.goto('/');
		await expect(page.getByTestId('safe-to-spend')).toHaveText(money(expected.amount));
		await expect(
			page.getByText(`Safe to spend until ${dateText(expected.nextPayday)}`)
		).toBeVisible();
		const reserved = page.getByTestId('reserved').getByRole('listitem');
		await expect(reserved).toHaveCount(expected.reserved.length);
		for (const [i, o] of expected.reserved.entries()) {
			await expect(reserved.nth(i)).toContainText(o.name);
			await expect(reserved.nth(i)).toContainText(dateText(o.date));
			await expect(reserved.nth(i)).toContainText(money(o.amount));
		}
		await expect(page.getByTestId('based-on')).toContainText(`from ${dateText(today)}`);
		await expectNoSidewaysScroll(page);
	});

	test('puts the number in the server-rendered HTML, before any script runs', async ({
		request
	}) => {
		const { expected } = finished();
		const response = await request.get('/');
		expect(response.status()).toBe(200);
		const html = await response.text();
		expect(html).toContain(money(expected.amount));
		expect(html).toContain('Already spoken for');
	});

	test('links to the schedule and offers a small form to update the balance', async ({ page }) => {
		await page.goto('/');
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Bills' })
		).toBeVisible();
		await page.getByText('Update my balance').click();
		await expect(page.getByLabel('Balance in your account')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save balance' })).toBeVisible();
	});

	test('reports the database healthy on /health', async ({ request }) => {
		const response = await request.get('/health');
		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ database: 'ok', backup: { configured: false } });
	});
});
