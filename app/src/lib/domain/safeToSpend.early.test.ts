/*
 * TSK-15DF8B, TSK-7642D5: an early payment in the number. Household in fixture.early.ts.
 * Today Nov 16, balance 200000 read Nov 14 (09:00 UTC); next payday Nov 27.
 *   Reserved after Nov 14 up to Nov 27: gym Nov 20 3000, phone Nov 25 5000 = 8000. Rent (Dec 1) and
 *   the insurance (Dec 20) are beyond the next payday.
 *   Held: paydays on or before Nov 16 in the insurance cycle: Sep 4, Sep 18, Oct 2, Oct 16, Oct 30,
 *   Nov 13 = 6 * 7500 = 45000.
 *   Base number: 200000 - 45000 - 8000 = 147000.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates.ts';
import { minor } from './money.ts';
import { safeToSpend, type SafeToSpendInput } from './safeToSpend.ts';
import type { Occurrence } from './schedule.ts';
import { earlyItems, mark, pay, rent } from './fixture.early.ts';

const READ = '2026-11-14T09:00:00Z';
const run = (over: Partial<SafeToSpendInput> = {}) =>
	safeToSpend({
		items: earlyItems,
		overrides: [],
		balance: minor(200000),
		balanceAsOf: d('2026-11-14'),
		balanceReadAt: READ,
		today: d('2026-11-16'),
		...over
	});

describe('TSK-15DF8B the number with no marks', () => {
	it('is the base number, and an empty list changes nothing', () => {
		expect(run().amount).toBe(147000);
		expect(run({ paidMarks: [] }).amount).toBe(147000);
		expect(run().paidEarly).toEqual([]);
		expect(run().paidEarlyOff).toBe(0);
	});
});

describe('TSK-15DF8B an early payment made after the balance comes off at once', () => {
	it('a bill reserved before the next payday moves from reserved to off: same number', () => {
		// Gym (Nov 20) paid Nov 16: no longer reserved (5000 left) but 3000 off.
		// 200000 - 45000 - 3000 (off) - 5000 = 147000.
		const r = run({ paidMarks: [mark('gym', '2026-11-20', '2026-11-16')] });
		expect(r.reserved.map((o) => o.amount)).toEqual([5000]);
		expect(r.paidEarlyOff).toBe(3000);
		expect(r.amount).toBe(147000);
	});

	it('a bill beyond the next payday lowers the number by its amount', () => {
		// Rent (Dec 1) paid Nov 16: 147000 - 40000 = 107000.
		const r = run({ paidMarks: [mark('rent', '2026-12-01', '2026-11-16')] });
		expect(r.reserved.map((o) => o.amount)).toEqual([3000, 5000]);
		expect(r.paidEarlyOff).toBe(40000);
		expect(r.amount).toBe(107000);
		expect(r.paidEarly.map((e) => e.paidOn)).toEqual([d('2026-11-16')]);
	});

	it('two early payments add up', () => {
		// Rent 40000 + phone 5000 off; reserved is gym only: 200000 - 45000 - 45000 - 3000 = 107000.
		const r = run({
			paidMarks: [
				mark('rent', '2026-12-01', '2026-11-15'),
				mark('phone', '2026-11-25', '2026-11-16')
			]
		});
		expect(r.paidEarlyOff).toBe(45000);
		expect(r.amount).toBe(107000);
	});
});

describe('TSK-15DF8B an early payment the balance already holds is not taken off twice', () => {
	it('made before the balance day: reserved no more, not subtracted', () => {
		// Gym paid Nov 13, balance true Nov 14 already shows it: 200000 - 45000 - 5000 = 150000.
		const r = run({ paidMarks: [mark('gym', '2026-11-20', '2026-11-13')] });
		expect(r.reserved.map((o) => o.amount)).toEqual([5000]);
		expect(r.paidEarlyOff).toBe(0);
		expect(r.amount).toBe(150000);
	});

	it('rent paid before the balance day leaves the number alone', () => {
		expect(run({ paidMarks: [mark('rent', '2026-12-01', '2026-11-13')] }).amount).toBe(147000);
	});

	it('is counted once whatever balance comes next', () => {
		// Rent paid Nov 16 (10:00). A new balance 150000 read Nov 18 (08:00) for Nov 18: holds it.
		// Reserved Nov 19..27 = gym + phone 8000; held 6 * 7500 = 45000 (Nov 13 is the latest payday).
		// 150000 - 45000 - 8000 = 97000: rent is not subtracted again.
		const r = run({
			paidMarks: [mark('rent', '2026-12-01', '2026-11-16')],
			balance: minor(150000),
			balanceAsOf: d('2026-11-18'),
			balanceReadAt: '2026-11-18T08:00:00Z',
			today: d('2026-11-18')
		});
		expect(r.paidEarlyOff).toBe(0);
		expect(r.amount).toBe(97000);
	});
});

describe('TSK-15DF8B the same day as the balance follows ADR-0012', () => {
	// Balance true Nov 16, read 08:00 UTC; today Nov 16. Reserved Nov 17..27: gym, phone = 8000.
	// No marks: 200000 - 45000 - 8000 = 147000.
	const same = { balanceAsOf: d('2026-11-16'), balanceReadAt: '2026-11-16T08:00:00Z' };

	it('made after the balance was read: off the number', () => {
		// Rent paid 09:00: 147000 - 40000 = 107000.
		const r = run({ ...same, paidMarks: [mark('rent', '2026-12-01', '2026-11-16', '09:00:00Z')] });
		expect(r.amount).toBe(107000);
	});

	it('made before the balance was read: the balance holds it', () => {
		const r = run({ ...same, paidMarks: [mark('rent', '2026-12-01', '2026-11-16', '07:00:00Z')] });
		expect(r.amount).toBe(147000);
	});

	it('a balance with no read time is taken to be read before the mark: errs low', () => {
		const r = run({
			balanceAsOf: d('2026-11-16'),
			balanceReadAt: null,
			paidMarks: [mark('rent', '2026-12-01', '2026-11-16', '07:00:00Z')]
		});
		expect(r.amount).toBe(107000);
	});
});

describe('TSK-15DF8B a mark made on or after the due date stays a label', () => {
	it('made on the due day or after: still reserved, the number as with no mark', () => {
		// Today Nov 21, balance Nov 14: gym (Nov 20) and phone reserved = 8000; 147000 either way.
		const none = run({ today: d('2026-11-21') });
		for (const paidOn of ['2026-11-20', '2026-11-21']) {
			const r = run({ today: d('2026-11-21'), paidMarks: [mark('gym', '2026-11-20', paidOn)] });
			expect(r.reserved.map((o) => o.amount)).toEqual([3000, 5000]);
			expect(r.paidEarly).toEqual([]);
			expect(r.amount).toBe(none.amount);
			expect(r.amount).toBe(147000);
		}
	});
});

describe('TSK-7642D5 taking the mark off, and "did not go out", reserve it again', () => {
	it('no mark is the reservation back', () => {
		const marked = run({ paidMarks: [mark('rent', '2026-12-01', '2026-11-16')] });
		const off = run({ paidMarks: [] });
		expect(marked.amount).toBe(107000);
		expect(off.amount).toBe(147000);
	});

	it('an outstanding "did not go out" outranks the early mark', () => {
		// Gym marked early and answered missed: reserved again; nothing off. 147000.
		const missed: Occurrence = {
			itemId: 'gym',
			kind: 'bill',
			name: 'Gym',
			date: d('2026-11-20'),
			amount: minor(3000),
			originalDate: d('2026-11-20')
		};
		const r = run({
			paidMarks: [mark('gym', '2026-11-20', '2026-11-16')],
			outstanding: [missed]
		});
		expect(r.reserved.map((o) => o.amount)).toEqual([3000, 5000]);
		expect(r.paidEarly).toEqual([]);
		expect(r.paidEarlyOff).toBe(0);
		expect(r.amount).toBe(147000);
	});
});

describe('TSK-15DF8B a yearly bill paid early stops its set-aside', () => {
	it('after the balance: the held 45000 comes back, the 60000 goes off', () => {
		// 200000 - 8000 (reserved) - 60000 (off) = 132000; setAsides empty.
		const r = run({ paidMarks: [mark('insurance', '2026-12-20', '2026-11-16')] });
		expect(r.setAsides).toEqual([]);
		expect(r.paidEarlyOff).toBe(60000);
		expect(r.amount).toBe(132000);
	});

	it('before the balance: the balance holds it, nothing is set aside', () => {
		// 200000 - 8000 = 192000.
		const r = run({ paidMarks: [mark('insurance', '2026-12-20', '2026-11-13')] });
		expect(r.setAsides).toEqual([]);
		expect(r.amount).toBe(192000);
	});
});

describe('TSK-15DF8B a shortfall caused by early payments is named', () => {
	it('is "early" when only an early payment, still counted, uses the money up', () => {
		// Pay and rent only. Balance 10000 (Nov 14), rent Dec 1 paid early Nov 16: available
		// 10000 - 40000 = -30000; nothing reserved before Nov 27; short by 30000.
		const r = run({
			items: [pay, rent],
			balance: minor(10000),
			paidMarks: [mark('rent', '2026-12-01', '2026-11-16')]
		});
		expect(r.amount).toBe(-30000);
		expect(r.shortfall?.short).toBe(30000);
		expect(r.shortfall?.uncovered).toEqual([]);
		expect(r.shortfall?.cause).toBe('early');
	});
});
