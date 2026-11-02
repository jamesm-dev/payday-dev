/*
 * Hand calculations for the check-in on the fixture household. The last check-in was on payday
 * Fri 2026-10-02 with 1,500.00 (150000) in the account. Today is payday Fri 2026-10-16.
 *   Pay scheduled in (Oct 2, Oct 16]: Oct 16, 185000.
 *   Payments in (Oct 2, Oct 16]: phone Oct 15, 4500. (Rent fell on Oct 1, before the balance.)
 */
import { describe, expect, it } from 'vitest';
import {
	expectedBalance,
	incomeDueSince,
	paymentsDueSince,
	spentSince,
	type Base
} from './checkin.ts';
import { parseCalDate as d } from './dates.ts';
import { fixtureItems, fixtureOverrides } from './fixture.ts';
import { minor } from './money.ts';
import { safeToSpend } from './safeToSpend.ts';
import type { Occurrence } from './schedule.ts';

const base: Base = { amount: minor(150000), asOf: d('2026-10-02') };
const phone = (): Occurrence => ({
	itemId: 'phone',
	kind: 'bill',
	name: 'Phone',
	date: d('2026-10-15'),
	amount: minor(4500),
	originalDate: d('2026-10-15')
});

describe('TSK-8A4CF1 what the check-in expects to find', () => {
	it('lists the pay and the payments scheduled since the last check-in', () => {
		const since = base.asOf;
		const today = d('2026-10-16');
		expect(
			incomeDueSince(fixtureItems, fixtureOverrides, since, today).map((o) => [o.date, o.amount])
		).toEqual([['2026-10-16', 185000]]);
		expect(
			paymentsDueSince(fixtureItems, fixtureOverrides, since, today).map((o) => [
				o.date,
				o.itemId,
				o.amount
			])
		).toEqual([['2026-10-15', 'phone', 4500]]);
	});

	it('expected = 150000 + 185000 - 4500 = 330500', () => {
		expect(expectedBalance({ base, payLanded: minor(185000), paid: [phone()] })).toBe(330500);
	});

	it('spent = expected - actual: 330500 - 300000 = 30500', () => {
		expect(spentSince(minor(330500), minor(300000))).toBe(30500);
	});

	it('spending can be negative: 330500 - 340000 = -9500, and it is not clamped', () => {
		expect(spentSince(minor(330500), minor(340000))).toBe(-9500);
	});

	it('pay that did not land is not counted: expected = 150000 - 4500 = 145500', () => {
		expect(expectedBalance({ base, payLanded: minor(0), paid: [phone()] })).toBe(145500);
	});

	it('pay that landed at another amount counts as it landed: 150000 + 190000 - 4500 = 335500', () => {
		expect(expectedBalance({ base, payLanded: minor(190000), paid: [phone()] })).toBe(335500);
	});
});

describe('TSK-6553DA a payment marked missed is not taken off the expected balance, and stays reserved', () => {
	it('with the phone bill missed, expected = 150000 + 185000 = 335000 and spent = 35000', () => {
		const expected = expectedBalance({ base, payLanded: minor(185000), paid: [] });
		expect(expected).toBe(335000);
		expect(spentSince(expected, minor(300000))).toBe(35000);
	});

	const input = {
		items: fixtureItems,
		overrides: fixtureOverrides,
		balance: minor(300000),
		balanceAsOf: d('2026-10-16'),
		today: d('2026-10-16')
	};

	/*
	 * After the check-in: balance 300000 as of Oct 16 = today; next payday Oct 30.
	 *   Reserved in (Oct 16, Oct 30]: card Oct 28, 6000. Held: water 10286, insurance 4154.
	 *   300000 - 10286 - 4154 - 6000 = 279560.
	 *   With the phone bill (Oct 15, 4500) outstanding it is reserved too: 279560 - 4500 = 275060,
	 *   although Oct 15 is before the balance's date.
	 */
	it('without it the number is 279560; with it outstanding the number is 275060', () => {
		expect(safeToSpend(input).amount).toBe(279560);
		const withMissed = safeToSpend({ ...input, outstanding: [phone()] });
		expect(withMissed.amount).toBe(275060);
		expect(withMissed.reserved.map((o) => [o.date, o.itemId, o.amount])).toEqual([
			['2026-10-15', 'phone', 4500],
			['2026-10-28', 'card', 6000]
		]);
	});

	it('is counted once when the schedule window holds the same occurrence too', () => {
		// Balance as of Oct 2: the phone bill (Oct 15) is in the window AND in the outstanding list.
		const early = { ...input, balance: minor(150000), balanceAsOf: d('2026-10-02') };
		const once = safeToSpend(early);
		const twice = safeToSpend({ ...early, outstanding: [phone()] });
		expect(twice.amount).toBe(once.amount);
		expect(twice.reserved).toHaveLength(once.reserved.length);
	});

	it('stays reserved on a later day, whatever its date', () => {
		const later = safeToSpend({ ...input, today: d('2026-10-20'), outstanding: [phone()] });
		expect(later.reserved.some((o) => o.itemId === 'phone')).toBe(true);
		expect(safeToSpend({ ...input, today: d('2026-10-20') }).amount - later.amount).toBe(4500);
	});

	it('an empty or omitted list changes nothing', () => {
		expect(safeToSpend({ ...input, outstanding: [] }).amount).toBe(safeToSpend(input).amount);
	});
});
