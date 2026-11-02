/**
 * One fictional household, shared by the tests, demos and later the seed script. Nothing here is
 * real. Every amount is a whole number of cents.
 *
 * Paydays fall every 14 days on Fridays from 2026-01-09; 2026 has two three-paycheck months,
 * May (1, 15, 29) and October (2, 16, 30). The buy-now-pay-later payments land ON paydays.
 */
import { parseCalDate as d, type CalDate } from './dates.ts';
import { minor, type Minor } from './money.ts';
import type { Item, Override } from './schedule.ts';

const STARTS = d('2026-01-01');

export const fixtureItems: Item[] = [
	{
		id: 'pay',
		kind: 'income',
		name: 'Pay',
		amount: minor(185000),
		rule: { kind: 'every14', anchor: d('2026-01-09') },
		startsOn: STARTS
	},
	{
		id: 'rent',
		kind: 'bill',
		name: 'Rent',
		amount: minor(120000),
		rule: { kind: 'monthly', day: 1 },
		startsOn: STARTS
	},
	{
		id: 'phone',
		kind: 'bill',
		name: 'Phone',
		amount: minor(4500),
		rule: { kind: 'monthly', day: 15 },
		startsOn: STARTS
	},
	{
		id: 'card',
		kind: 'bill',
		name: 'Credit card minimum',
		amount: minor(6000),
		rule: { kind: 'monthly', day: 28 },
		startsOn: STARTS
	},
	{
		id: 'internet',
		kind: 'bill',
		name: 'Internet',
		amount: minor(5500),
		rule: { kind: 'monthly', day: 31 },
		startsOn: STARTS
	},
	{
		id: 'water',
		kind: 'bill',
		name: 'Water',
		amount: minor(12000),
		rule: { kind: 'quarterly', anchor: d('2026-01-31') },
		startsOn: STARTS
	},
	{
		id: 'insurance',
		kind: 'bill',
		name: 'Car insurance',
		amount: minor(54000),
		rule: { kind: 'yearly', anchor: d('2026-09-30') },
		startsOn: STARTS
	},
	{
		id: 'bnpl',
		kind: 'loan-payment',
		name: 'Laptop instalment',
		amount: minor(3750),
		rule: { kind: 'every14', anchor: d('2026-02-06') },
		startsOn: d('2026-02-06'),
		endsOn: d('2026-03-20')
	}
];

export const fixtureOverrides: Override[] = [
	// The phone company waived March.
	{ itemId: 'phone', originalDate: d('2026-03-15'), action: 'skip' },
	// May's card minimum was paid early, and was larger.
	{
		itemId: 'card',
		originalDate: d('2026-05-28'),
		action: 'change',
		date: d('2026-05-26'),
		amount: minor(7250)
	}
];

export const fixtureBalance: { amount: Minor; asOf: CalDate } = {
	amount: minor(230000),
	asOf: d('2026-01-09')
};
