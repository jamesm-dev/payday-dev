/*
 * TSK-2A2B3A A loan paid twice a month closes a half-month period: interest per payment is
 * round_half_up(balance x rate_bp / (10000 x 24)). Same references as loans.test.ts: a hand
 * calculation and the closed-form amortisation (floats in the reference only).
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates.ts';
import {
	debtFreeDate,
	paymentPlanFor,
	periodInterest,
	projectLoan,
	simulateLoan,
	type Loan,
	type PaymentPlan
} from './loans.ts';
import { minor } from './money.ts';
import type { Item } from './schedule.ts';

const FROM = d('2026-10-31');

const loan = (over: Partial<Loan> = {}): Loan => ({
	id: '1',
	type: 'instalment',
	name: 'Loan',
	balance: minor(200000),
	balanceAsOf: FROM,
	rateBp: 1800,
	scheduleItemId: '1',
	minPctBp: null,
	minFloor: null,
	...over
});

const item = (over: Partial<Item> = {}): Item => ({
	id: '1',
	kind: 'loan-payment',
	name: 'Payment',
	amount: minor(10000),
	rule: { kind: 'twiceMonthly', day: 15, day2: 30 },
	startsOn: d('2026-01-01'),
	...over
});

const planOf = (it: Item): PaymentPlan =>
	paymentPlanFor({ scheduleItemId: it.id }, [it], [], FROM)!;

describe('TSK-2A2B3A a half-month period charges rate / 24', () => {
	it('is 15.00 on 2,000.00 at 18%, and rounds half up', () => {
		// 200000 x 1800 / 240000 = 1500 exactly.
		expect(periodInterest(minor(200000), 1800, 'half-month')).toBe(1500);
		// 191500 x 1800 / 240000 = 1436.25 -> 1436.
		expect(periodInterest(minor(191500), 1800, 'half-month')).toBe(1436);
		// 100 x 1200 / 240000 = 0.5 -> half up 1; 99 x 1200 / 240000 = 0.495 -> 0.
		expect(periodInterest(minor(100), 1200, 'half-month')).toBe(1);
		expect(periodInterest(minor(99), 1200, 'half-month')).toBe(0);
	});

	it('leaves the fortnight and month interest as they were', () => {
		expect(periodInterest(minor(200000), 1800, 'fortnight')).toBe(1381);
		expect(periodInterest(minor(100000), 1200, 'month')).toBe(1000);
		expect(periodInterest(minor(180000), 2299, 'month')).toBe(3449);
	});

	it('names the half-month cadence for a twice-a-month payment', () => {
		expect(planOf(item()).cadence).toBe('half-month');
		expect(planOf(item({ rule: { kind: 'monthly', day: 15 } })).cadence).toBe('month');
		expect(planOf(item({ rule: { kind: 'every14', anchor: d('2026-11-06') } })).cadence).toBe(
			'fortnight'
		);
	});
});

describe('TSK-2A2B3A the projection follows the twice-a-month rhythm', () => {
	it('charges 15.00 then 14.36, with 100.00 paid on the 15th and the 30th', () => {
		// 2,000.00 at 18%, payments 2026-11-15 and 2026-11-30.
		// 1st: 200000 + 1500 - 10000 = 191500. 2nd: 191500 + 1436 - 10000 = 182936.
		const sim = simulateLoan(loan(), planOf(item()), FROM, 1800);
		expect(sim.steps[0]).toEqual({
			date: '2026-11-15',
			interest: 1500,
			payment: 10000,
			balance: 191500
		});
		expect(sim.steps[1]).toEqual({
			date: '2026-11-30',
			interest: 1436,
			payment: 10000,
			balance: 182936
		});
	});

	it('stays within one minor unit per period of the closed form', () => {
		const sim = simulateLoan(loan(), planOf(item()), FROM, 1800);
		expect(sim.outcome).toBe('payoff');
		const r = 1800 / 10000 / 24;
		const B = 200000;
		const P = 10000;
		// n = -ln(1 - rB/P) / ln(1 + r)
		const n = -Math.log(1 - (r * B) / P) / Math.log(1 + r);
		expect(sim.steps.length).toBe(Math.ceil(n));
		for (const [i, step] of sim.steps.entries()) {
			const k = i + 1;
			if (k === sim.steps.length) break;
			const ref = B * (1 + r) ** k - (P * ((1 + r) ** k - 1)) / r;
			expect(Math.abs(step.balance - ref), `balance after payment ${k}`).toBeLessThanOrEqual(k);
		}
	});

	it('gives the debt-free date from the rhythm: 150.00 at 0% in 37.50 on the 1st and the 15th', () => {
		// Payments 2026-11-01, 11-15, 12-01, 12-15: the 4th clears it.
		const it = item({ amount: minor(3750), rule: { kind: 'twiceMonthly', day: 1, day2: 15 } });
		const projection = projectLoan(
			loan({ type: 'bnpl', balance: minor(15000), rateBp: 0 }),
			planOf(it),
			FROM
		);
		expect(projection).toEqual({ kind: 'payoff', date: '2026-12-15', interest: 0, payments: 4 });
		expect(debtFreeDate([{ loanId: '1', name: 'Plan', projection }])).toMatchObject({
			date: '2026-12-15'
		});
	});
});
