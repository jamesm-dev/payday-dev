import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates.ts';
import { minor } from './money.ts';
import { longestPaydayGap, nextPayday, paydays, periodFor, previousPayday } from './periods.ts';
import type { Item } from './schedule.ts';
import { fixtureItems } from './fixture.ts';
import {
	MONTHLY_2026,
	monthlyItems,
	switchItems,
	TWICE_2026,
	twiceItems
} from './fixture.rhythm.ts';

const year = (items: Item[], y: number) => paydays(items, [], d(`${y}-01-01`), d(`${y}-12-31`));

describe('paydays follow the main pay', () => {
	it('TSK-F95975 twice a month on the 15th and the last day: 24 paydays, all of 2026', () => {
		expect(year(twiceItems, 2026)).toEqual(TWICE_2026);
		expect(TWICE_2026).toHaveLength(24);
	});

	it('TSK-F95975 monthly on the 31st: 12 paydays, short months on their last day', () => {
		expect(year(monthlyItems, 2026)).toEqual(MONTHLY_2026);
		expect(MONTHLY_2026).toHaveLength(12);
	});

	it('TSK-F95975 February: the 28th in 2027, the 29th in the leap year 2028', () => {
		// 2027 is not a leap year; 2028 is (divisible by 4, not a century).
		const feb2027 = (items: Item[]) => paydays(items, [], d('2027-02-01'), d('2027-02-28'));
		const feb2028 = (items: Item[]) => paydays(items, [], d('2028-02-01'), d('2028-02-29'));
		expect(feb2027(twiceItems)).toEqual([d('2027-02-15'), d('2027-02-28')]);
		expect(feb2028(twiceItems)).toEqual([d('2028-02-15'), d('2028-02-29')]);
		expect(feb2027(monthlyItems)).toEqual([d('2027-02-28')]);
		expect(feb2028(monthlyItems)).toEqual([d('2028-02-29')]);
	});

	it('TSK-F95975 the leap year has 24 and 12 paydays too', () => {
		expect(year(twiceItems, 2028)).toHaveLength(24);
		expect(year(monthlyItems, 2028)).toHaveLength(12);
	});

	it('TSK-F95975 next and previous payday step over the short months', () => {
		expect(nextPayday(twiceItems, [], d('2026-02-15'))).toBe(d('2026-02-28'));
		expect(nextPayday(twiceItems, [], d('2026-02-28'))).toBe(d('2026-03-15'));
		expect(previousPayday(twiceItems, [], d('2026-03-14'))).toBe(d('2026-02-28'));
		expect(previousPayday(twiceItems, [], d('2026-02-28'))).toBe(d('2026-02-28'));
		expect(nextPayday(monthlyItems, [], d('2026-01-31'))).toBe(d('2026-02-28'));
		expect(nextPayday(monthlyItems, [], d('2026-02-28'))).toBe(d('2026-03-31'));
		expect(previousPayday(monthlyItems, [], d('2026-03-30'))).toBe(d('2026-02-28'));
		// Dec 31 to Jan 31 is a full 31-day gap, inside the search window.
		expect(nextPayday(monthlyItems, [], d('2026-12-31'))).toBe(d('2027-01-31'));
		expect(nextPayday(monthlyItems, [], d('2028-01-31'))).toBe(d('2028-02-29'));
	});

	it('TSK-F95975 a bill on a payday belongs to the paycheck before it', () => {
		expect(periodFor(twiceItems, [], d('2026-02-15'))).toEqual({
			payday: d('2026-01-31'),
			ends: d('2026-02-15')
		});
		expect(periodFor(twiceItems, [], d('2026-02-28'))).toEqual({
			payday: d('2026-02-15'),
			ends: d('2026-02-28')
		});
		expect(periodFor(twiceItems, [], d('2026-03-01'))).toEqual({
			payday: d('2026-02-28'),
			ends: d('2026-03-15')
		});
		expect(periodFor(monthlyItems, [], d('2026-03-31'))).toEqual({
			payday: d('2026-02-28'),
			ends: d('2026-03-31')
		});
		expect(periodFor(monthlyItems, [], d('2026-04-01'))).toEqual({
			payday: d('2026-03-31'),
			ends: d('2026-04-30')
		});
		// Before the first payday of a monthly pay there is no paycheck to bracket it.
		expect(periodFor(monthlyItems, [], d('2026-01-15'))).toBeNull();
	});

	it('TSK-F95975 only the main pay sets paydays: other income does not', () => {
		const side: Item = {
			id: 'side',
			kind: 'income',
			name: 'Side job',
			amount: minor(5000),
			rule: { kind: 'every14', anchor: d('2026-01-02') },
			startsOn: d('2026-01-01')
		};
		expect(year([...twiceItems, side], 2026)).toEqual(TWICE_2026);
		expect(year([...monthlyItems, side], 2026)).toEqual(MONTHLY_2026);
	});

	it('TSK-F95975 no item marked main: the paydays are every 14-day income, as before', () => {
		const marked = fixtureItems.map((i) => (i.id === 'pay' ? { ...i, main: true as const } : i));
		expect(year(marked, 2026)).toEqual(year(fixtureItems, 2026));
		expect(year(fixtureItems, 2026)).toHaveLength(26);
		// Jan 9 + 14 * 25 = Jan 9 + 350 days = Dec 25 (Jan 9 is day 9; day 359 is Dec 25).
		expect(year(fixtureItems, 2026).at(-1)).toBe(d('2026-12-25'));
	});

	it('TSK-F95975 the longest gap: 14, 31 for monthly, the longer span for a pair', () => {
		expect(longestPaydayGap(fixtureItems)).toBe(14);
		expect(longestPaydayGap(monthlyItems)).toBe(31);
		// The 15th to the 31st is 16 days; the 31st to the next 15th is 15 (31 - 16), so the longest is 16.
		expect(longestPaydayGap(twiceItems)).toBe(16);
	});
});

describe('a rhythm switch keeps the paydays continuous', () => {
	// Every 14 days to Fri Mar 6, then the 15th and the last day from Mar 7.
	const SWITCH = [
		'2026-01-09',
		'2026-01-23',
		'2026-02-06',
		'2026-02-20',
		'2026-03-06',
		'2026-03-15',
		'2026-03-31',
		'2026-04-15',
		'2026-04-30'
	].map(d);

	it('TSK-0C2E2E the old rhythm ends on its payday and the new one follows, none twice', () => {
		expect(paydays(switchItems, [], d('2026-01-01'), d('2026-04-30'))).toEqual(SWITCH);
	});

	it('TSK-0C2E2E no gap paycheck: the paycheck across the switch is (Mar 6, Mar 15]', () => {
		expect(periodFor(switchItems, [], d('2026-03-10'))).toEqual({
			payday: d('2026-03-06'),
			ends: d('2026-03-15')
		});
		// A bill ON the last old payday belongs to the paycheck before it; one ON the first new
		// payday belongs to the 9-day paycheck.
		expect(periodFor(switchItems, [], d('2026-03-06'))).toEqual({
			payday: d('2026-02-20'),
			ends: d('2026-03-06')
		});
		expect(periodFor(switchItems, [], d('2026-03-15'))).toEqual({
			payday: d('2026-03-06'),
			ends: d('2026-03-15')
		});
		expect(nextPayday(switchItems, [], d('2026-03-06'))).toBe(d('2026-03-15'));
		expect(previousPayday(switchItems, [], d('2026-03-14'))).toBe(d('2026-03-06'));
	});
});
