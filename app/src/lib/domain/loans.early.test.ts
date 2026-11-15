/*
 * TSK-BFBB02: a loan payment paid early lowers the loan's expected balance and moves its projection.
 * The loan pays 5000 on the 20th of each month (item "loan", from Sep 4 2026) at 12% a year, so a
 * monthly period charges 1%: interest = round_half_up(balance x 1200 / 120000).
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates.ts';
import {
	accrualDates,
	earlyLoanPayments,
	expectedLoanBalance,
	paymentPlanFor,
	projectLoan,
	type Loan
} from './loans.ts';
import { minor } from './money.ts';
import type { Item } from './schedule.ts';
import { mark } from './fixture.early.ts';

const FROM = d('2026-11-14');
const loanItem: Item = {
	id: 'loan',
	kind: 'loan-payment',
	name: 'Loan payment',
	amount: minor(5000),
	rule: { kind: 'monthly', day: 20 },
	startsOn: d('2026-09-04')
};
const loan = (balance: number, rateBp: number | null = 1200): Loan => ({
	id: '1',
	type: 'instalment',
	name: 'Loan',
	balance: minor(balance),
	balanceAsOf: FROM,
	rateBp,
	scheduleItemId: 'loan',
	minPctBp: null,
	minFloor: null
});
const early = (marks: ReturnType<typeof mark>[], readAt?: string | null) =>
	earlyLoanPayments({
		itemId: 'loan',
		items: [loanItem],
		overrides: [],
		marks,
		asOf: FROM,
		readAt
	});

describe('TSK-BFBB02 which payments are early', () => {
	it('a payment paid before the balance day is held by it; one after is carried, dated by the day paid', () => {
		const held = early([mark('loan', '2026-11-20', '2026-11-13')]);
		expect(held.keys).toEqual(new Set(['loan|2026-11-20']));
		expect(held.payments).toEqual([]);

		const carried = early([mark('loan', '2026-11-20', '2026-11-16')]);
		expect(carried.payments).toEqual([
			{ date: d('2026-11-16'), amount: 5000, key: 'loan|2026-11-20' }
		]);
	});

	it('a payment paid on the due day, or another item, is not early', () => {
		expect(early([mark('loan', '2026-11-20', '2026-11-20')]).keys.size).toBe(0);
		expect(early([mark('gym', '2026-11-20', '2026-11-16')]).keys.size).toBe(0);
	});
});

describe('TSK-BFBB02 the expected balance at the next check-in', () => {
	// Balance 100000 true Nov 14; today Nov 27. Nov 20 closes a period (interest first).
	it('with no early payment: 100000 + 1000 interest - 5000 = 96000', () => {
		expect(
			expectedLoanBalance({
				balance: minor(100000),
				rateBp: 1200,
				cadence: 'month',
				accruals: [d('2026-11-20')],
				paid: [{ date: d('2026-11-20'), amount: minor(5000) }]
			})
		).toBe(96000);
	});

	it('the Nov 20 payment paid early on Nov 16: 100000 - 5000 = 95000, then 950 interest = 95950', () => {
		const e = early([mark('loan', '2026-11-20', '2026-11-16')]);
		const plan = paymentPlanFor(loan(100000), [loanItem], [], FROM, e.keys)!;
		const { cadence, dates } = accrualDates(plan, FROM, d('2026-11-27'));
		expect(dates).toEqual([d('2026-11-20')]);
		// The server drops early keys from the payments assumed paid on their due date and adds these.
		const expected = expectedLoanBalance({
			balance: minor(100000),
			rateBp: 1200,
			cadence,
			accruals: dates,
			paid: e.payments.map((p) => ({ date: p.date, amount: p.amount }))
		});
		expect(expected).toBe(95950);
	});

	it('an early payment the balance already holds is not taken off again: 100000 + 1000 = 101000', () => {
		const e = early([mark('loan', '2026-11-20', '2026-11-13')]);
		expect(
			expectedLoanBalance({
				balance: minor(100000),
				rateBp: 1200,
				cadence: 'month',
				accruals: [d('2026-11-20')],
				paid: e.payments.map((p) => ({ date: p.date, amount: p.amount }))
			})
		).toBe(101000);
	});
});

describe('TSK-BFBB02 the projection moves', () => {
	it('lowers the interest to the end: 15000 at 5000 a month', () => {
		// No early payment: Nov 20: 150 -> 10150; Dec 20: 101.5 -> 102 -> 5252; Jan 20: 52.52 -> 53 ->
		// 305 (after 5000); Feb 20: 3.05 -> 3 -> 308 paid. Payoff Feb 20, interest 150+102+53+3 = 308.
		const l = loan(15000);
		const base = projectLoan(l, paymentPlanFor(l, [loanItem], [], FROM), FROM);
		expect(base).toEqual({ kind: 'payoff', date: d('2027-02-20'), interest: 308, payments: 4 });

		// The Nov 20 payment paid early Nov 16: balance 10000. Nov 20: 100 -> 10100, nothing paid;
		// Dec 20: 101 -> 10201 - 5000 = 5201; Jan 20: 52.01 -> 52 -> 5253 - 5000 = 253; Feb 20: 2.53 -> 3
		// -> 256 paid. Interest 100+101+52+3 = 256.
		const e = early([mark('loan', '2026-11-20', '2026-11-16')]);
		const moved = projectLoan(l, paymentPlanFor(l, [loanItem], [], FROM, e.keys), FROM, e.payments);
		expect(moved).toEqual({ kind: 'payoff', date: d('2027-02-20'), interest: 256, payments: 4 });
	});

	it('a loan paid off by the early payment is debt free that day', () => {
		// 5000 at 0%, one payment of 5000 due Nov 20, paid Nov 16: owed nothing from Nov 16.
		const l = loan(5000, 0);
		const base = projectLoan(l, paymentPlanFor(l, [loanItem], [], FROM), FROM);
		expect(base).toMatchObject({ kind: 'payoff', date: d('2026-11-20') });
		const e = early([mark('loan', '2026-11-20', '2026-11-16')]);
		const moved = projectLoan(l, paymentPlanFor(l, [loanItem], [], FROM, e.keys), FROM, e.payments);
		expect(moved).toEqual({ kind: 'payoff', date: d('2026-11-16'), interest: 0, payments: 1 });
	});

	it('taking the mark off restores the projection', () => {
		const l = loan(15000);
		const e = early([]);
		expect(
			projectLoan(l, paymentPlanFor(l, [loanItem], [], FROM, e.keys), FROM, e.payments)
		).toEqual(projectLoan(l, paymentPlanFor(l, [loanItem], [], FROM), FROM));
	});
});
