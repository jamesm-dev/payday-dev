/**
 * A small household for the early-payment tests (TSK-15DF8B and friends). Nothing here is real;
 * every amount is whole cents, and the arithmetic is written out in the tests.
 *
 * Paid 100000 every 14 days on Fridays from 2026-01-09: ... Sep 4, Sep 18, Oct 2, Oct 16, Oct 30,
 * Nov 13, Nov 27, Dec 11, Dec 25. Bills: gym 3000 on the 20th, phone 5000 on the 25th, rent 40000
 * on the 1st, and a yearly car insurance of 60000 due Dec 20 started Sep 4, so its cycle holds eight
 * paydays (Sep 4 .. Dec 11) of 7500 each.
 */
import { parseCalDate as d } from './dates.ts';
import { minor } from './money.ts';
import type { Item, PaidMark } from './schedule.ts';

const STARTS = d('2026-09-04');

export const pay: Item = {
	id: 'pay',
	kind: 'income',
	name: 'Pay',
	amount: minor(100000),
	rule: { kind: 'every14', anchor: d('2026-01-09') },
	startsOn: STARTS
};
export const gym: Item = {
	id: 'gym',
	kind: 'bill',
	name: 'Gym',
	amount: minor(3000),
	rule: { kind: 'monthly', day: 20 },
	startsOn: STARTS
};
export const phone: Item = {
	id: 'phone',
	kind: 'bill',
	name: 'Phone',
	amount: minor(5000),
	rule: { kind: 'monthly', day: 25 },
	startsOn: STARTS
};
export const rent: Item = {
	id: 'rent',
	kind: 'bill',
	name: 'Rent',
	amount: minor(40000),
	rule: { kind: 'monthly', day: 1 },
	startsOn: STARTS
};
export const insurance: Item = {
	id: 'insurance',
	kind: 'bill',
	name: 'Car insurance',
	amount: minor(60000),
	rule: { kind: 'yearly', anchor: d('2026-12-20') },
	startsOn: STARTS
};

export const earlyItems: Item[] = [pay, gym, phone, rent, insurance];

/** A mark on an occurrence of `itemId` due `due`, made on `paidOn` at `time` (UTC, same day). */
export function mark(itemId: string, due: string, paidOn: string, time = '10:00:00Z'): PaidMark {
	return {
		itemId,
		originalDate: d(due),
		paidOn: d(paidOn),
		markedAt: `${paidOn}T${time}`
	};
}
