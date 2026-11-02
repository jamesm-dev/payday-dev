import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates';
import { fixtureItems, fixtureOverrides } from './fixture';
import { minor } from './money';
import { nextPayday, paydays, periodFor, previousPayday } from './periods';
import type { Item, Override } from './schedule';

const items = fixtureItems;
const none: Override[] = [];

describe('TSK-5642E7 paydays', () => {
	it('lists the paydays in a range, inclusive of both ends', () => {
		expect(paydays(items, none, d('2026-05-01'), d('2026-06-12'))).toEqual([
			'2026-05-01',
			'2026-05-15',
			'2026-05-29',
			'2026-06-12'
		]);
		expect(paydays(items, none, d('2026-05-02'), d('2026-06-11'))).toEqual([
			'2026-05-15',
			'2026-05-29'
		]);
	});

	it('has three paychecks in May and October 2026 and two in every other month', () => {
		const counts = Array.from({ length: 12 }, (_, i) => {
			const m = String(i + 1).padStart(2, '0');
			const last = new Date(Date.UTC(2026, i + 1, 0)).getUTCDate();
			return paydays(items, none, d(`2026-${m}-01`), d(`2026-${m}-${last}`)).length;
		});
		expect(counts).toEqual([2, 2, 2, 2, 3, 2, 2, 2, 2, 3, 2, 2]);
	});

	it('ignores income that is not every-14-days, and bills that are', () => {
		const side: Item = {
			id: 'side',
			kind: 'income',
			name: 'Side gig',
			amount: minor(5000),
			rule: { kind: 'monthly', day: 10 },
			startsOn: d('2026-01-01')
		};
		expect(paydays([...items, side], none, d('2026-05-01'), d('2026-05-31'))).toEqual([
			'2026-05-01',
			'2026-05-15',
			'2026-05-29'
		]);
		// The buy-now-pay-later payments also repeat every 14 days, but they are not income.
		expect(paydays(items, none, d('2026-02-07'), d('2026-02-19'))).toEqual([]);
	});

	it('follows a changed payday', () => {
		const early: Override[] = [
			{ itemId: 'pay', originalDate: d('2026-05-15'), action: 'change', date: d('2026-05-14') }
		];
		expect(nextPayday(items, early, d('2026-05-01'))).toBe('2026-05-14');
		expect(paydays(items, early, d('2026-05-01'), d('2026-05-31'))).toEqual([
			'2026-05-01',
			'2026-05-14',
			'2026-05-29'
		]);
	});
});

describe('TSK-5642E7 next and previous payday', () => {
	it('nextPayday is strictly after the date', () => {
		expect(nextPayday(items, none, d('2026-05-15'))).toBe('2026-05-29');
		expect(nextPayday(items, none, d('2026-05-14'))).toBe('2026-05-15');
		expect(nextPayday(items, none, d('2026-05-16'))).toBe('2026-05-29');
	});

	it('previousPayday is on or before the date', () => {
		expect(previousPayday(items, none, d('2026-05-15'))).toBe('2026-05-15');
		expect(previousPayday(items, none, d('2026-05-14'))).toBe('2026-05-01');
		expect(previousPayday(items, none, d('2026-05-28'))).toBe('2026-05-15');
	});

	it('crosses a year end', () => {
		expect(nextPayday(items, none, d('2026-12-25'))).toBe('2027-01-08');
		expect(previousPayday(items, none, d('2027-01-07'))).toBe('2026-12-25');
	});

	it('returns null when there is none', () => {
		expect(nextPayday([], none, d('2026-05-15'))).toBeNull();
		expect(previousPayday([], none, d('2026-05-15'))).toBeNull();
		expect(previousPayday(items, none, d('2026-01-05'))).toBeNull();
	});
});

describe('TSK-5642E7 periodFor: period i is (payday_i, payday_i+1]', () => {
	it('puts a date between paydays in the paycheck before it', () => {
		expect(periodFor(items, none, d('2026-05-20'))).toEqual({
			payday: '2026-05-15',
			ends: '2026-05-29'
		});
	});

	it('puts a bill due ON a payday in the PREVIOUS paycheck', () => {
		expect(periodFor(items, none, d('2026-05-15'))).toEqual({
			payday: '2026-05-01',
			ends: '2026-05-15'
		});
		// The laptop instalments land on paydays 2026-02-06 and 2026-02-20.
		expect(periodFor(items, none, d('2026-02-20'))).toEqual({
			payday: '2026-02-06',
			ends: '2026-02-20'
		});
		expect(periodFor(items, none, d('2026-02-06'))).toEqual({
			payday: '2026-01-23',
			ends: '2026-02-06'
		});
	});

	it('puts the day after a payday in the new paycheck', () => {
		expect(periodFor(items, none, d('2026-05-16'))).toEqual({
			payday: '2026-05-15',
			ends: '2026-05-29'
		});
		expect(periodFor(items, none, d('2026-05-14'))).toEqual({
			payday: '2026-05-01',
			ends: '2026-05-15'
		});
	});

	it('is null before the first payday', () => {
		expect(periodFor(items, none, d('2026-01-09'))).toBeNull();
		expect(periodFor(items, none, d('2026-01-10'))).toEqual({
			payday: '2026-01-09',
			ends: '2026-01-23'
		});
	});

	it('uses overrides to find the paydays', () => {
		expect(periodFor(items, fixtureOverrides, d('2026-05-20'))).toEqual({
			payday: '2026-05-15',
			ends: '2026-05-29'
		});
	});
});
