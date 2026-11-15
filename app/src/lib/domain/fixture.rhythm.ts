/**
 * Fictional households whose main pay is not every 14 days (TSK-F95975, TSK-0C2E2E). Nothing here
 * is real; every amount is whole cents. The paydays are written out by hand, never computed.
 *
 * TWICE: paid 90000 on the 15th and the last day of the month. 2026 paydays (24):
 *   Jan 15, Jan 31, Feb 15, Feb 28, Mar 15, Mar 31, Apr 15, Apr 30, May 15, May 31, Jun 15, Jun 30,
 *   Jul 15, Jul 31, Aug 15, Aug 31, Sep 15, Sep 30, Oct 15, Oct 31, Nov 15, Nov 30, Dec 15, Dec 31.
 *
 * MONTHLY: paid 200000 on the last day of the month (day 31). 2026 paydays (12):
 *   Jan 31, Feb 28, Mar 31, Apr 30, May 31, Jun 30, Jul 31, Aug 31, Sep 30, Oct 31, Nov 30, Dec 31.
 *
 * Both pay the same bills: rent 80000 on the 1st, a phone 4500 on the 15th (so it falls ON a
 * payday for TWICE), and a yearly insurance of 120000 due Dec 20 2026, started Jan 1 2026 so its
 * cycle is Jan 1 to Dec 19.
 *
 * SWITCH: paid every 14 days from 2026-01-09 (100000) until Fri 2026-03-06 (Jan 9 + 56 days = 4 * 14),
 * then on the 15th and the last day of the month (90000) from Mar 7. A gym of 3000 on the 10th. A
 * yearly bill of 100000 due Dec 20 2026.
 */
import { parseCalDate as d } from './dates.ts';
import { minor } from './money.ts';
import type { Item } from './schedule.ts';

const STARTS = d('2026-01-01');

const bills: Item[] = [
	{
		id: 'rent',
		kind: 'bill',
		name: 'Rent',
		amount: minor(80000),
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
		id: 'insurance',
		kind: 'bill',
		name: 'Car insurance',
		amount: minor(120000),
		rule: { kind: 'yearly', anchor: d('2026-12-20') },
		startsOn: STARTS
	}
];

export const twiceItems: Item[] = [
	{
		id: 'pay',
		kind: 'income',
		name: 'Pay',
		amount: minor(90000),
		rule: { kind: 'twiceMonthly', day: 15, day2: 31 },
		startsOn: STARTS,
		main: true
	},
	...bills
];

export const monthlyItems: Item[] = [
	{
		id: 'pay',
		kind: 'income',
		name: 'Pay',
		amount: minor(200000),
		rule: { kind: 'monthly', day: 31 },
		startsOn: STARTS,
		main: true
	},
	...bills
];

export const switchItems: Item[] = [
	{
		id: 'pay-old',
		kind: 'income',
		name: 'Pay',
		amount: minor(100000),
		rule: { kind: 'every14', anchor: d('2026-01-09') },
		startsOn: STARTS,
		endsOn: d('2026-03-06'),
		main: true
	},
	{
		id: 'pay-new',
		kind: 'income',
		name: 'Pay',
		amount: minor(90000),
		rule: { kind: 'twiceMonthly', day: 15, day2: 31 },
		startsOn: d('2026-03-07'),
		main: true
	},
	{
		id: 'gym',
		kind: 'bill',
		name: 'Gym',
		amount: minor(3000),
		rule: { kind: 'monthly', day: 10 },
		startsOn: STARTS
	},
	{
		id: 'yearly',
		kind: 'bill',
		name: 'Annual fee',
		amount: minor(100000),
		rule: { kind: 'yearly', anchor: d('2026-12-20') },
		startsOn: STARTS
	}
];

export const TWICE_2026 = [
	'2026-01-15',
	'2026-01-31',
	'2026-02-15',
	'2026-02-28',
	'2026-03-15',
	'2026-03-31',
	'2026-04-15',
	'2026-04-30',
	'2026-05-15',
	'2026-05-31',
	'2026-06-15',
	'2026-06-30',
	'2026-07-15',
	'2026-07-31',
	'2026-08-15',
	'2026-08-31',
	'2026-09-15',
	'2026-09-30',
	'2026-10-15',
	'2026-10-31',
	'2026-11-15',
	'2026-11-30',
	'2026-12-15',
	'2026-12-31'
].map(d);

export const MONTHLY_2026 = [
	'2026-01-31',
	'2026-02-28',
	'2026-03-31',
	'2026-04-30',
	'2026-05-31',
	'2026-06-30',
	'2026-07-31',
	'2026-08-31',
	'2026-09-30',
	'2026-10-31',
	'2026-11-30',
	'2026-12-31'
].map(d);
