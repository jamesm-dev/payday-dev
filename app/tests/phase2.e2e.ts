import { expect, test, type Page } from '@playwright/test';
import { addDays } from '../src/lib/domain/dates.ts';
import { paydays } from '../src/lib/domain/periods.ts';
import { planPaychecks } from '../src/lib/domain/plan.ts';
import { dateText, moneyText } from '../src/lib/format.ts';
import { CURRENCY, householdItems, todayNow, yesterday } from './support/household.ts';
import { parseCalendar } from './support/ics.ts';

/*
 * Read-only checks of the plan, the reminders page and the calendar file, on every project. The
 * `checkin` project has already run (and put the household back), so the expected paychecks are the
 * engine's, from the same inputs. A test here changes nothing that outlives it.
 */

const money = (n: number) => moneyText(n, CURRENCY);
const today = () => todayNow();
const items = () =>
	householdItems(today(), {
		loanEnded: true,
		gym: { amount: '35.00', endsOn: yesterday(today()) }
	});

/** Nothing may scroll sideways: a phone screen has no room for it. */
async function expectNoSidewaysScroll(page: Page) {
	const { scroll, client } = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth,
		client: document.documentElement.clientWidth
	}));
	expect(scroll).toBeLessThanOrEqual(client);
}

test.describe('TSK-145499 the plan shows the next six paychecks', () => {
	test('each paycheck lists what it must cover and what is left, as the engine works it out', async ({
		page
	}) => {
		const expected = planPaychecks(items(), [], today(), 6);
		await page.goto('/plan');
		await expect(page.getByRole('heading', { name: 'Your next six paychecks' })).toBeVisible();

		const cards = page.getByTestId('paycheck');
		await expect(cards).toHaveCount(6);
		for (const [i, p] of expected.entries()) {
			const card = cards.nth(i);
			await expect(card).toHaveAttribute('data-payday', p.payday);
			await expect(card.getByRole('heading', { level: 2 })).toHaveText(dateText(p.payday));
			await expect(card).toContainText(money(p.pay));
			await expect(card).toContainText(`up to and including ${dateText(p.ends)}`);

			const covers = card.getByTestId('covers').getByRole('listitem');
			if (p.covers.length === 0) {
				await expect(covers).toHaveCount(0);
			} else {
				await expect(covers).toHaveCount(p.covers.length);
				for (const [j, o] of p.covers.entries()) {
					await expect(covers.nth(j)).toContainText(o.name);
					await expect(covers.nth(j)).toContainText(dateText(o.date));
					await expect(covers.nth(j)).toContainText(money(o.amount));
				}
			}
			if (!p.short) await expect(card.getByTestId('left')).toContainText(money(p.left));
		}
		await expectNoSidewaysScroll(page);
	});

	test('TSK-CA2DF6 a paycheck that cannot cover its bills is flagged with the shortfall, and only then', async ({
		page
	}) => {
		const expected = planPaychecks(items(), [], today(), 6);
		await page.goto('/plan');
		const cards = page.getByTestId('paycheck');
		for (const [i, p] of expected.entries()) {
			const flag = cards.nth(i).getByTestId('short');
			if (p.short) {
				await expect(flag).toContainText(`${money(p.shortBy)} short`);
			} else {
				await expect(flag).toHaveCount(0);
			}
		}
		const shortCount = expected.filter((p) => p.short).length;
		await expect(page.getByTestId('short')).toHaveCount(shortCount);
	});

	test('TSK-3F0502 months with a third paycheck are labelled', async ({ page }) => {
		const expected = planPaychecks(items(), [], today(), 6);
		await page.goto('/plan');
		const cards = page.getByTestId('paycheck');
		for (const [i, p] of expected.entries()) {
			const note = cards.nth(i).getByTestId('month-note');
			if (p.thirdPaycheckMonth) {
				await expect(note).toContainText(
					p.nthInMonth === 3 ? 'The extra paycheck' : 'A month with three paychecks'
				);
			} else {
				await expect(note).toHaveCount(0);
			}
		}
	});

	test('the main navigation links to the plan and the check-in, and settings to the reminders', async ({
		page
	}) => {
		const main = page.getByRole('navigation', { name: 'Main' });
		await page.goto('/');
		await main.getByRole('link', { name: 'Plan' }).click();
		await expect(page).toHaveURL(/\/plan$/);
		await expect(main.getByRole('link', { name: 'Check-in' })).toBeVisible();
		await page.goto('/');
		await page
			.getByRole('main')
			.locator('.footer-links')
			.getByRole('link', { name: 'Settings' })
			.click();
		await expect(page).toHaveURL(/\/settings$/);
		await expect(page.getByRole('link', { name: 'Reminders' })).toBeVisible();
	});
});

test.describe('TSK-21F5E9 the reminders page explains itself in plain words', () => {
	test('shows the explanation, the time, the iPhone note and the calendar fallback', async ({
		page
	}) => {
		await page.goto('/settings/reminders');
		await expect(page.getByRole('heading', { name: 'Payday reminders', level: 1 })).toBeVisible();
		await expect(page.getByTestId('explain')).toContainText('On every payday, at 09:00');
		await expect(page.getByLabel('Remind me at')).toHaveValue('09:00');
		await expect(page.getByText('only work from the app on your Home Screen')).toBeVisible();
		await expect(page.getByRole('button', { name: /Turn on reminders/ })).toBeVisible();
		await expect(page.getByTestId('ics-link')).toHaveAttribute('href', '/calendar.ics');
		await expect(page.getByTestId('reminder-status')).toBeVisible();
		await expectNoSidewaysScroll(page);
	});
});

test.describe('TSK-E03C29 the calendar file lists every payday for a year', () => {
	test('downloads as a calendar file and parses', async ({ request }) => {
		const response = await request.get('/calendar.ics');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toBe('text/calendar; charset=utf-8');
		expect(response.headers()['content-disposition']).toBe('attachment; filename="payday.ics"');
		expect(response.headers()['cache-control']).toContain('no-store');

		const calendar = parseCalendar(await response.text());
		const days = paydays(items(), [], today(), addDays(today(), 365));
		expect(calendar.events).toHaveLength(days.length);
		expect(calendar.events.map((e) => e.DTSTART)).toEqual(
			days.map((d) => `${d.replaceAll('-', '')}T090000`)
		);
		expect(calendar.alarms).toBe(days.length);
		expect(new Set(calendar.events.map((e) => e.UID)).size).toBe(days.length);
		// Every payday for a year: the last is within a payday cycle of a year from now.
		const last = days.at(-1)!;
		expect(last > addDays(today(), 365 - 14)).toBe(true);
	});

	test('the link on the reminders page downloads payday.ics', async ({ page }) => {
		await page.goto('/settings/reminders');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByTestId('ics-link').click()
		]);
		expect(download.suggestedFilename()).toBe('payday.ics');
	});
});
