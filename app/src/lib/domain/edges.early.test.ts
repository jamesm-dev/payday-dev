/*
 * Edge cases of early payments (review fixes). Household in fixture.early.ts; the number's base is
 * the one in safeToSpend.early.test.ts: today Nov 16, balance 200000 read Nov 14 at 09:00 UTC,
 * reserved gym 3000 + phone 5000, held 45000, so 147000.
 */
import { describe, expect, it } from 'vitest';
import { expectedBalance, paymentsSince } from './checkin.ts';
import { parseCalDate as d } from './dates.ts';
import { earlyLoanPayments, expectedLoanBalance, loanPaidList } from './loans.ts';
import { minor } from './money.ts';
import { longestPaydayGap } from './periods.ts';
import { planPaychecks } from './plan.ts';
import { safeToSpend, type SafeToSpendInput } from './safeToSpend.ts';
import type { Item, Override } from './schedule.ts';
import { earlyItems, insurance, mark, pay, rent } from './fixture.early.ts';
import { switchItems } from './fixture.rhythm.ts';

const run = (over: Partial<SafeToSpendInput> = {}) =>
	safeToSpend({
		items: earlyItems,
		overrides: [],
		balance: minor(200000),
		balanceAsOf: d('2026-11-14'),
		balanceReadAt: '2026-11-14T09:00:00Z',
		today: d('2026-11-16'),
		...over
	});

const rentMovedTo = (date: string): Override[] => [
	{ itemId: 'rent', originalDate: d('2026-12-01'), action: 'change', date: d(date) }
];

describe('TSK-15DF8B an occurrence moved by a change override', () => {
	it('moved later (Dec 1 to Dec 3) and paid Nov 16: early by its moved date, 147000 - 40000 = 107000', () => {
		const r = run({
			overrides: rentMovedTo('2026-12-03'),
			paidMarks: [mark('rent', '2026-12-01', '2026-11-16')]
		});
		expect(r.paidEarly.map((e) => e.occurrence.date)).toEqual([d('2026-12-03')]);
		expect(r.paidEarlyOff).toBe(40000);
		expect(r.amount).toBe(107000);
	});

	it('moved earlier than the mark (to Nov 15): not early, reserved in date order, still 107000', () => {
		// Nov 15 is after the balance (Nov 14) and before the payday: reserved 40000 + 3000 + 5000 = 48000.
		// 200000 - 45000 - 48000 = 107000. The mark (Nov 16) is on or after Nov 15: a label.
		const r = run({
			overrides: rentMovedTo('2026-11-15'),
			paidMarks: [mark('rent', '2026-12-01', '2026-11-16')]
		});
		expect(r.paidEarly).toEqual([]);
		expect(r.reserved.map((o) => o.amount)).toEqual([40000, 3000, 5000]);
		expect(r.amount).toBe(107000);
	});

	it('in the plan: paycheck 2 covers rent on Dec 3 without holding it back', () => {
		// Nov 27..Dec 11: coversTotal 0, paidEarlyTotal 40000, left 100000 - 0 - 7500 = 92500.
		const p = planPaychecks(earlyItems, rentMovedTo('2026-12-03'), d('2026-11-13'), 3, [
			mark('rent', '2026-12-01', '2026-11-16')
		]);
		expect(p[1].covers[0]).toMatchObject({ date: d('2026-12-03'), paidEarly: true });
		expect(p[1].coversTotal).toBe(0);
		expect(p[1].paidEarlyTotal).toBe(40000);
		expect(p[1].left).toBe(92500);
	});
});

describe('TSK-7642D5 marks that disagree, and a skip', () => {
	it('two marks on one occurrence: the later wins, and made on the due day it is a label', () => {
		// Gym due Nov 20 marked Nov 16, then again Nov 20. Today Nov 21: reserved 3000 + 5000, 147000.
		const r = run({
			today: d('2026-11-21'),
			paidMarks: [mark('gym', '2026-11-20', '2026-11-16'), mark('gym', '2026-11-20', '2026-11-20')]
		});
		expect(r.paidEarly).toEqual([]);
		expect(r.reserved.map((o) => o.amount)).toEqual([3000, 5000]);
		expect(r.amount).toBe(147000);
	});

	it('a skipped occurrence ignores its mark: 147000 (the server refuses such a skip)', () => {
		// server/money/store.ts `setOverride` refuses a skip while an early mark stands, so the two
		// never meet; if they do, the mark is ignored and the occurrence is simply gone.
		const r = run({
			overrides: [{ itemId: 'rent', originalDate: d('2026-12-01'), action: 'skip' }],
			paidMarks: [mark('rent', '2026-12-01', '2026-11-16')]
		});
		expect(r.paidEarly).toEqual([]);
		expect(r.amount).toBe(147000);
	});
});

describe('TSK-15DF8B the shortfall names what is actually there', () => {
	it('one cent logged does not hide a 40000 early payment', () => {
		// [pay, rent], balance 10000, 1 logged, rent early: available 10000 - 1 - 40000 = -30001.
		const r = run({
			items: [pay, rent],
			balance: minor(10000),
			expenses: minor(1),
			paidMarks: [mark('rent', '2026-12-01', '2026-11-16')]
		});
		expect(r.amount).toBe(-30001);
		expect(r.shortfall?.cause).toBe('early');
	});

	it('logged spending larger than the early payment is "logged"', () => {
		// Balance 60000, 50000 logged, rent early 40000: available -30000; without them 60000.
		const r = run({
			items: [pay, rent],
			balance: minor(60000),
			expenses: minor(50000),
			paidMarks: [mark('rent', '2026-12-01', '2026-11-16')]
		});
		expect(r.shortfall?.cause).toBe('logged');
	});

	it('an early payment on top of the yearly hold is "earlyHeld", not just "early"', () => {
		// [pay, rent, insurance], balance 10000: held 45000, rent early 40000: available -75000, and
		// without the early payment it is still -35000: the hold is part of it.
		const r = run({
			items: [pay, rent, insurance],
			balance: minor(10000),
			paidMarks: [mark('rent', '2026-12-01', '2026-11-16')]
		});
		expect(r.amount).toBe(-75000);
		expect(r.shortfall?.cause).toBe('earlyHeld');
	});
});

describe('TSK-F95975 the longest gap, and the extra paycheck', () => {
	it('the 1st and the 15th: 14 days within the month, 17 from the 15th to the next 1st', () => {
		const pair: Item = {
			...pay,
			main: true,
			rule: { kind: 'twiceMonthly', day: 1, day2: 15 }
		};
		expect(longestPaydayGap([pair])).toBe(17);
	});

	it('a month with three paydays from a rhythm switch is not an extra paycheck', () => {
		// SWITCH: every 14 days to Mar 6, then the 15th and the last day: March holds Mar 6, 15, 31.
		const p = planPaychecks(switchItems, [], d('2026-03-06'), 2);
		expect(p.map((c) => c.payday)).toEqual([d('2026-03-06'), d('2026-03-15')]);
		expect(p.map((c) => c.paydaysInMonth)).toEqual([3, 3]);
		expect(p.every((c) => !c.thirdPaycheckMonth)).toBe(true);
	});

	it('every 14 days it still is: October 2026 has Oct 2, 16, 30', () => {
		const p = planPaychecks([pay], [], d('2026-10-02'), 2);
		expect(p.map((c) => [c.paydaysInMonth, c.thirdPaycheckMonth])).toEqual([
			[3, true],
			[3, true]
		]);
	});
});

describe('TSK-C00C8A an early payment made after this update read its balance', () => {
	// Update since Nov 13 (balance 150000), today Nov 27, pay 100000 landed, gym 3000 + phone 5000
	// asked: 242000. Rent (due Dec 1) paid on Nov 27 at 10:00 UTC would take it to 202000.
	const rentToday = [mark('rent', '2026-12-01', '2026-11-27', '10:00:00Z')];
	const expectedWith = (todayReadAt?: string | null) => {
		const r = paymentsSince({
			items: earlyItems,
			overrides: [],
			since: d('2026-11-13'),
			today: d('2026-11-27'),
			marks: rentToday,
			todayReadAt
		});
		return {
			r,
			balance: expectedBalance({
				base: { amount: minor(150000), asOf: d('2026-11-13') },
				payLanded: minor(100000),
				paid: [...r.asked, ...r.subtracted]
			})
		};
	};

	it('read before the payment: left for the next update, 242000', () => {
		const { r, balance } = expectedWith('2026-11-27T09:00:00Z');
		expect(r.paidEarly).toEqual([]);
		expect(balance).toBe(242000);
	});

	it('read after the payment, or no read time: subtracted, 202000', () => {
		expect(expectedWith('2026-11-27T11:00:00Z').balance).toBe(202000);
		expect(expectedWith().balance).toBe(202000);
	});

	it('the next update takes it off through its own last read time', () => {
		const next = paymentsSince({
			items: earlyItems,
			overrides: [],
			since: d('2026-11-27'),
			today: d('2026-12-11'),
			marks: rentToday,
			sinceReadAt: '2026-11-27T09:00:00Z'
		});
		expect(next.subtracted.map((o) => o.itemId)).toEqual(['rent']);
	});

	it('what is subtracted is never among the payments asked about', () => {
		const r = paymentsSince({
			items: earlyItems,
			overrides: [],
			since: d('2026-11-13'),
			today: d('2026-11-27'),
			marks: [
				mark('gym', '2026-11-20', '2026-11-17'),
				mark('rent', '2026-12-01', '2026-11-18'),
				mark('phone', '2026-11-25', '2026-11-12')
			]
		});
		expect(r.asked).toEqual([]);
		expect(r.subtracted.map((o) => o.itemId)).toEqual(['gym', 'rent']);
	});
});

describe('TSK-BFBB02 a mark made the same day as the loan balance: a debt errs high', () => {
	// A 5000 payment on the 20th at 12% a year (1% a month). The Nov 20 payment is marked early Nov 16
	// at 10:00; the balance 100000 is typed for Nov 16.
	const loanItem: Item = {
		id: 'loan',
		kind: 'loan-payment',
		name: 'Loan payment',
		amount: minor(5000),
		rule: { kind: 'monthly', day: 20 },
		startsOn: d('2026-09-04')
	};
	const same = (readAt?: string | null) =>
		earlyLoanPayments({
			itemId: 'loan',
			items: [loanItem],
			overrides: [],
			marks: [mark('loan', '2026-11-20', '2026-11-16', '10:00:00Z')],
			asOf: d('2026-11-16'),
			readAt
		});
	const expectedAt = (e: ReturnType<typeof same>) =>
		expectedLoanBalance({
			balance: minor(100000),
			rateBp: 1200,
			cadence: 'month',
			accruals: [d('2026-11-20')],
			paid: loanPaidList({ assumed: [], early: e, today: d('2026-11-27') })
		});

	it('no read time: taken as already in the balance, 100000 + 1000 interest = 101000', () => {
		const e = same(null);
		expect(e.payments).toEqual([]);
		expect(e.keys).toEqual(new Set(['loan|2026-11-20']));
		expect(expectedAt(e)).toBe(101000);
		expect(same(undefined).payments).toEqual([]);
	});

	it('read at 09:00, before the mark: taken off, 95000 + 950 = 95950', () => {
		expect(expectedAt(same('2026-11-16T09:00:00Z'))).toBe(95950);
	});

	it('read at 11:00, after the mark: the balance holds it, 101000', () => {
		expect(expectedAt(same('2026-11-16T11:00:00Z'))).toBe(101000);
	});

	it('the paid list drops early ones from the assumed payments and adds carried ones on their day', () => {
		const list = loanPaidList({
			assumed: [
				{ key: 'loan|2026-11-20', date: d('2026-11-20'), amount: minor(5000) },
				{ key: 'other|2026-11-21', date: d('2026-11-21'), amount: minor(700) }
			],
			early: {
				keys: new Set(['loan|2026-11-20', 'loan|2026-12-20']),
				payments: [
					{ date: d('2026-11-16'), amount: minor(5000) },
					{ date: d('2026-12-05'), amount: minor(5000) }
				]
			},
			today: d('2026-11-27')
		});
		// The Dec 5 one is after today and waits.
		expect(list).toEqual([
			{ date: d('2026-11-21'), amount: 700 },
			{ date: d('2026-11-16'), amount: 5000 }
		]);
	});
});
