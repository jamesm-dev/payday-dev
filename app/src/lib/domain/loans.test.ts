/*
 * Loan maths against references. Two kinds of reference, neither of them the code under test:
 *
 *   - a hand calculation (written out in the comment above the test), and
 *   - the closed-form amortisation. With r the rate per period, B the balance and P the payment:
 *         payments needed    n   = -ln(1 - rB/P) / ln(1 + r)
 *         balance after k    B_k = B (1+r)^k - P ((1+r)^k - 1) / r
 *     The closed form is real-valued; the engine rounds interest to a whole minor unit once per
 *     period, so each period may differ from it by at most half a unit, and the difference can grow
 *     by that much each period. "Within one minor unit per period" is therefore |engine - closed
 *     form| <= k after k periods, which is checked after EVERY period, not only at the end.
 *     Floats appear here, in the reference only; the engine uses none.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from './dates.ts';
import { fixtureItems } from './fixture.ts';
import {
	accrualDates,
	cardMinimum,
	cardPurchases,
	debtFreeDate,
	divRoundHalfUp,
	expectedLoanBalance,
	interestThisMonth,
	monthsAfter,
	paymentPlanFor,
	periodInterest,
	projectLoan,
	simulateLoan,
	type Cadence,
	type Loan,
	type NamedProjection,
	type PaymentPlan
} from './loans.ts';
import { minor } from './money.ts';
import type { Item, Override } from './schedule.ts';

const FROM = d('2026-10-31');

function loan(over: Partial<Loan> = {}): Loan {
	return {
		id: '1',
		type: 'instalment',
		name: 'Loan',
		balance: minor(100000),
		balanceAsOf: FROM,
		rateBp: 1200,
		scheduleItemId: '1',
		minPctBp: null,
		minFloor: null,
		...over
	};
}

function item(over: Partial<Item> = {}): Item {
	return {
		id: '1',
		kind: 'loan-payment',
		name: 'Payment',
		amount: minor(10000),
		rule: { kind: 'monthly', day: 1 },
		startsOn: d('2026-01-01'),
		...over
	};
}

const planOf = (it: Item, overrides: Override[] = [], from = FROM) =>
	paymentPlanFor({ scheduleItemId: it.id }, [it], overrides, from);

/** The rate per period, as a real number: the reference's own, not the engine's. */
const refRate = (rateBp: number, cadence: Cadence) =>
	cadence === 'fortnight'
		? (rateBp / 10000) * (14 / 365)
		: (rateBp / 10000) * (({ month: 1, quarter: 3, year: 12 } as const)[cadence] / 12);

const refPeriods = (balance: number, payment: number, r: number) =>
	r === 0 ? balance / payment : -Math.log(1 - (r * balance) / payment) / Math.log(1 + r);

const refBalance = (balance: number, payment: number, r: number, k: number) =>
	r === 0 ? balance - payment * k : balance * (1 + r) ** k - (payment * ((1 + r) ** k - 1)) / r;

/** Proves a payoff against the closed form: every period within k units, and the count of payments. */
function expectAgainstClosedForm(
	balance: number,
	payment: number,
	rateBp: number,
	cadence: Cadence,
	plan: PaymentPlan
) {
	const sim = simulateLoan(
		{ type: 'instalment', balance: minor(balance), minPctBp: null, minFloor: null },
		plan,
		FROM,
		rateBp
	);
	expect(sim.outcome).toBe('payoff');
	const r = refRate(rateBp, cadence);
	const n = refPeriods(balance, payment, r);
	expect(sim.steps.length).toBe(Math.ceil(n));
	for (const [i, step] of sim.steps.entries()) {
		const k = i + 1;
		if (k === sim.steps.length) break; // the last period pays off, it has no closed-form balance
		expect(
			Math.abs(step.balance - refBalance(balance, payment, r, k)),
			`balance after payment ${k}`
		).toBeLessThanOrEqual(k);
	}
	// Interest = everything paid less the principal; the closed form pays P each period but the last.
	const last = sim.steps.length;
	const refLastPayment = refBalance(balance, payment, r, last - 1) * (1 + r);
	const refInterest = payment * (last - 1) + refLastPayment - balance;
	const interest = sim.steps.reduce((n2, s) => n2 + s.interest, 0);
	expect(Math.abs(interest - refInterest)).toBeLessThanOrEqual(last);
	return { sim, n, interest };
}

describe('TSK-7DFBFA integer interest, rounded half up once per period', () => {
	it('rounds half up and never through a float quotient', () => {
		expect(divRoundHalfUp(4, 10)).toBe(0);
		expect(divRoundHalfUp(5, 10)).toBe(1);
		expect(divRoundHalfUp(14, 10)).toBe(1);
		expect(divRoundHalfUp(15, 10)).toBe(2);
		expect(divRoundHalfUp(25, 10)).toBe(3);
		expect(divRoundHalfUp(0, 7)).toBe(0);
		expect(() => divRoundHalfUp(-1, 7)).toThrow(RangeError);
		expect(() => divRoundHalfUp(2 ** 53, 7)).toThrow(RangeError);
	});

	it('a month at 12% on 1,000.00 is 10.00; at 22.99% on 1,800.00 it is 34.49', () => {
		// 100000 x 1200 / 120000 = 1000.  180000 x 2299 / 120000 = 3448.5 -> half up 3449.
		expect(periodInterest(minor(100000), 1200, 'month')).toBe(1000);
		expect(periodInterest(minor(180000), 2299, 'month')).toBe(3449);
	});

	it('every 14 days charges rate x 14/365; a quarter 3/12 of the year; a year all of it', () => {
		// 200000 x 1800 x 14 / 3650000 = 1380.82 -> 1381.
		expect(periodInterest(minor(200000), 1800, 'fortnight')).toBe(1381);
		expect(periodInterest(minor(100000), 800, 'quarter')).toBe(2000);
		expect(periodInterest(minor(100000), 1000, 'year')).toBe(10000);
	});

	it('is nothing at a known 0%, and refuses a negative balance or rate', () => {
		expect(periodInterest(minor(123456), 0, 'month')).toBe(0);
		expect(() => periodInterest(minor(-1), 1200, 'month')).toThrow(RangeError);
		expect(() => periodInterest(minor(1), -1, 'month')).toThrow(RangeError);
	});

	it('months end on the last day of a shorter month', () => {
		expect(monthsAfter(d('2026-01-31'), 1)).toBe('2026-02-28');
		expect(monthsAfter(d('2026-11-30'), 3)).toBe('2027-02-28');
		expect(monthsAfter(d('2026-12-15'), 1)).toBe('2027-01-15');
	});
});

describe('TSK-7DFBFA an instalment loan, paid monthly, matches the amortisation formula', () => {
	// Hand calculation: 1,000.00 at 12%, 100.00 a month on the 1st, balance as of 2026-10-31.
	//   month  interest  balance after
	//     1     10.00     910.00
	//     2      9.10     819.10
	//     3      8.19     727.29
	//     4      7.27     634.56
	//     5      6.35     540.91
	//     6      5.41     446.32
	//     7      4.46     350.78
	//     8      3.51     254.29
	//     9      2.54     156.83
	//    10      1.57      58.40
	//    11      0.58       0.00   (the last payment is 58.98)
	//   n = -ln(1 - 0.01 x 1000/100) / ln(1.01) = 10.59, so 11 payments. Interest = 58.98.
	it('pays off on the 11th payment, Sep 1 2027, for 58.98 of interest', () => {
		const projection = projectLoan(loan(), planOf(item()), FROM);
		expect(projection).toEqual({
			kind: 'payoff',
			date: '2027-09-01',
			interest: 5898,
			payments: 11
		});
	});

	it('follows the hand-calculated balance for every month', () => {
		const sim = simulateLoan(loan(), planOf(item()), FROM, 1200);
		expect(sim.steps.map((s) => s.balance)).toEqual([
			91000, 81910, 72729, 63456, 54091, 44632, 35078, 25429, 15683, 5840, 0
		]);
		expect(sim.steps.map((s) => s.interest)).toEqual([
			1000, 910, 819, 727, 635, 541, 446, 351, 254, 157, 58
		]);
		expect(sim.steps.at(-1)?.payment).toBe(5898);
	});

	it('stays within one minor unit per period of the closed form, after every period', () => {
		const { n } = expectAgainstClosedForm(100000, 10000, 1200, 'month', planOf(item())!);
		expect(n).toBeCloseTo(10.5886, 3);
	});

	it('holds for a long loan: 15,000.00 at 6.5% with 300.00 a month', () => {
		const plan = planOf(item({ amount: minor(30000) }))!;
		const { sim } = expectAgainstClosedForm(1_500_000, 30000, 650, 'month', plan);
		expect(sim.steps.length).toBeGreaterThan(50);
	});
});

describe('TSK-7DFBFA a loan paid every 14 days accrues rate x 14/365 per payment', () => {
	// 2,000.00 at 18%, 100.00 every 14 days from 2026-11-06. Per payment: 200000 x 1800 x 14 /
	// 3,650,000 = 13.81 on the first period, so the balance after payment 1 is 2000.00 + 13.81 -
	// 100.00 = 1913.81.
	const fortnightly = item({
		amount: minor(10000),
		rule: { kind: 'every14', anchor: d('2026-11-06') }
	});

	it('charges 13.81 on the first period', () => {
		const sim = simulateLoan(loan({ balance: minor(200000) }), planOf(fortnightly), FROM, 1800);
		expect(sim.steps[0]).toEqual({
			date: '2026-11-06',
			interest: 1381,
			payment: 10000,
			balance: 191381
		});
	});

	it('stays within one minor unit per period of the closed form', () => {
		const plan = planOf(fortnightly)!;
		expect(plan.cadence).toBe('fortnight');
		const { n } = expectAgainstClosedForm(200000, 10000, 1800, 'fortnight', plan);
		expect(n).toBeGreaterThan(20);
	});
});

describe('TSK-7DFBFA a buy-now-pay-later plan at 0% is the balance divided by the payment', () => {
	// 150.00 in 37.50 payments every 14 days from 2026-11-06: 4 payments, the 4th on 2026-12-18.
	// n = 15000 / 3750 = 4. No interest.
	it('pays off on the 4th payment with no interest', () => {
		const plan = planOf(
			item({ amount: minor(3750), rule: { kind: 'every14', anchor: d('2026-11-06') } })
		)!;
		const projection = projectLoan(
			loan({ type: 'bnpl', balance: minor(15000), rateBp: 0 }),
			plan,
			FROM
		);
		expect(projection).toEqual({ kind: 'payoff', date: '2026-12-18', interest: 0, payments: 4 });
		expectAgainstClosedForm(15000, 3750, 0, 'fortnight', plan);
	});

	it('a final payment smaller than the rest still pays off on its own date', () => {
		const plan = planOf(item({ amount: minor(4000), rule: { kind: 'monthly', day: 15 } }))!;
		const projection = projectLoan(
			loan({ type: 'bnpl', balance: minor(10000), rateBp: 0 }),
			plan,
			FROM
		);
		// 40.00 on Nov 15, Dec 15, then the last 20.00 on Jan 15.
		expect(projection).toEqual({ kind: 'payoff', date: '2027-01-15', interest: 0, payments: 3 });
	});
});

describe('TSK-7DFBFA an informal loan can be paid quarterly or yearly', () => {
	// 3,000.00 at 8% a year, 500.00 every 3 months: r = 0.08 x 3/12 = 0.02 a period. First period
	// interest = 300000 x 800 x 3 / 120000 = 60.00.
	it('quarterly: within one minor unit per period of the closed form', () => {
		const plan = planOf(
			item({ amount: minor(50000), rule: { kind: 'quarterly', anchor: d('2027-01-15') } })
		)!;
		expect(plan.cadence).toBe('quarter');
		const { sim } = expectAgainstClosedForm(300000, 50000, 800, 'quarter', plan);
		expect(sim.steps[0].interest).toBe(6000);
	});

	it('yearly: a year is all of the rate', () => {
		const plan = planOf(
			item({ amount: minor(40000), rule: { kind: 'yearly', anchor: d('2027-03-01') } })
		)!;
		expect(plan.cadence).toBe('year');
		expectAgainstClosedForm(100000, 40000, 1000, 'year', plan);
	});
});

describe('TSK-7DFBFA a credit card pays what its schedule item says, or its minimum', () => {
	it('with a linked 60.00 a month on 1,800.00 at 22.99%, matches the closed form', () => {
		const plan = planOf(item({ amount: minor(6000), rule: { kind: 'monthly', day: 28 } }))!;
		const { n } = expectAgainstClosedForm(180000, 6000, 2299, 'month', plan);
		expect(n).toBeGreaterThan(40);
	});

	it('the minimum is max(floor, balance x pct), capped at the balance', () => {
		expect(cardMinimum(minor(500000), 300, minor(2500))).toBe(15000);
		expect(cardMinimum(minor(100000), 200, minor(2500))).toBe(2500);
		expect(cardMinimum(minor(1800), 200, minor(2500))).toBe(1800);
		expect(cardMinimum(minor(0), 200, minor(2500))).toBe(0);
		expect(cardMinimum(minor(40), 100, null)).toBe(1);
	});

	// Hand calculation: 1,000.00 at 18%, minimum max(25.00, 2%).
	//   month 1: interest 15.00, owed 1015.00, 2% = 20.30 -> pays 25.00, balance 990.00
	//   month 2: interest 14.85, owed 1004.85, 2% = 20.10 -> pays 25.00, balance 979.85
	it('follows the hand-calculated first two months of a floor-and-percent minimum', () => {
		const card = loan({
			type: 'credit-card',
			scheduleItemId: null,
			rateBp: 1800,
			minPctBp: 200,
			minFloor: minor(2500)
		});
		const sim = simulateLoan(card, null, FROM, 1800);
		expect(sim.steps[0]).toEqual({
			date: '2026-11-30',
			interest: 1500,
			payment: 2500,
			balance: 99000
		});
		expect(sim.steps[1]).toEqual({
			date: '2026-12-31',
			interest: 1485,
			payment: 2500,
			balance: 97985
		});
		expect(sim.outcome).toBe('payoff');
	});

	it('a percent-driven minimum is the percent while it is larger: 5,000.00 at 12%, 3%', () => {
		// interest 50.00, owed 5050.00, 3% = 151.50 > floor 25.00 -> pays 151.50, balance 4898.50.
		const card = loan({
			type: 'credit-card',
			scheduleItemId: null,
			balance: minor(500000),
			rateBp: 1200,
			minPctBp: 300,
			minFloor: minor(2500)
		});
		const sim = simulateLoan(card, null, FROM, 1200);
		expect(sim.steps[0]).toMatchObject({ interest: 5000, payment: 15150, balance: 489850 });
	});

	it('with a floor only, it is an ordinary amortisation and matches the closed form', () => {
		const card = loan({
			type: 'credit-card',
			scheduleItemId: null,
			balance: minor(180000),
			rateBp: 2299,
			minPctBp: null,
			minFloor: minor(6000)
		});
		const sim = simulateLoan(card, null, FROM, 2299);
		const r = refRate(2299, 'month');
		expect(sim.steps.length).toBe(Math.ceil(refPeriods(180000, 6000, r)));
		for (const [i, s] of sim.steps.entries()) {
			if (i === sim.steps.length - 1) break;
			expect(Math.abs(s.balance - refBalance(180000, 6000, r, i + 1))).toBeLessThanOrEqual(i + 1);
		}
	});

	it('a card with no linked item and no minimum has no payments to project', () => {
		const card = loan({ type: 'credit-card', scheduleItemId: null });
		expect(projectLoan(card, null, FROM)).toEqual({ kind: 'no-payments' });
	});
});

describe('TSK-5CEFEA a payment that does not beat its interest never pays the loan off', () => {
	const monthly = (amount: number) => planOf(item({ amount: minor(amount) }))!;
	// 1,000.00 at 24%: a month's interest is exactly 20.00.
	const big = (over: Partial<Loan> = {}) => loan({ balance: minor(100000), rateBp: 2400, ...over });

	it('a payment equal to the interest never pays off', () => {
		expect(projectLoan(big(), monthly(2000), FROM)).toEqual({ kind: 'never', reason: 'interest' });
	});

	it('a payment below the interest never pays off', () => {
		expect(projectLoan(big(), monthly(1999), FROM)).toEqual({ kind: 'never', reason: 'interest' });
	});

	it('one minor unit above the interest does pay off, though only after a very long time', () => {
		// With a margin of one unit a month, rounding dominates and the closed form (384) is not a
		// fair reference (the engine needs 388); what matters is that it ends and is not "never".
		const projection = projectLoan(big(), monthly(2001), FROM);
		expect(projection.kind).toBe('payoff');
		if (projection.kind === 'payoff') expect(projection.payments).toBeGreaterThan(300);
	});

	it('with a comfortable margin the count is the closed form: 25.00 over the interest', () => {
		const projection = projectLoan(big(), monthly(4500), FROM);
		// n = -ln(1 - 0.02 x 1000/45) / ln(1.02) = 29.7 -> 30 payments.
		expect(Math.ceil(refPeriods(100000, 4500, 0.02))).toBe(30);
		expect(projection.kind === 'payoff' && projection.payments).toBe(30);
	});

	it('every 14 days it is the 14-day interest that has to be beaten', () => {
		const fortnightly = (amount: number) =>
			planOf(item({ amount: minor(amount), rule: { kind: 'every14', anchor: d('2026-11-06') } }))!;
		// 100000 x 2400 x 14 / 3,650,000 = 920.55 -> 921.
		expect(projectLoan(big(), fortnightly(921), FROM)).toEqual({
			kind: 'never',
			reason: 'interest'
		});
		expect(projectLoan(big(), fortnightly(922), FROM).kind).toBe('payoff');
	});

	it('a card whose minimum is a percent below the monthly rate never pays off', () => {
		const card = loan({
			type: 'credit-card',
			scheduleItemId: null,
			rateBp: 2400,
			minPctBp: 100,
			minFloor: null
		});
		expect(projectLoan(card, null, FROM)).toEqual({ kind: 'never', reason: 'interest' });
	});

	it('a loan that would take more than 50 years is called too long, not given a date', () => {
		const huge = loan({ balance: minor(100_000_000), rateBp: 1200 });
		// A month's interest is 10,000.00; paying 10,000.01 takes about 77 years.
		expect(projectLoan(huge, monthly(1_000_001), FROM)).toEqual({
			kind: 'never',
			reason: 'too-long'
		});
	});
});

describe('TSK-7DFBFA an unknown rate is shown as unknown, with the date at no interest', () => {
	it('is unknown-rate, and says what the payments do at 0%', () => {
		const projection = projectLoan(loan({ rateBp: null }), planOf(item()), FROM);
		expect(projection).toEqual({
			kind: 'unknown-rate',
			assumingNoInterest: { kind: 'payoff', date: '2027-08-01', interest: 0, payments: 10 }
		});
	});

	it('a known 0% is a rate, not an unknown one', () => {
		expect(projectLoan(loan({ rateBp: 0 }), planOf(item()), FROM).kind).toBe('payoff');
	});
});

describe('TSK-7DFBFA other ways a projection ends', () => {
	it('a loan with nothing owed is paid off today', () => {
		expect(projectLoan(loan({ balance: minor(0) }), planOf(item()), FROM)).toEqual({
			kind: 'payoff',
			date: FROM,
			interest: 0,
			payments: 0
		});
	});

	it('a loan with no payment plan and no minimum has no payments', () => {
		expect(projectLoan(loan({ scheduleItemId: null }), null, FROM)).toEqual({
			kind: 'no-payments'
		});
	});

	it('payments that end before the loan does say what is left', () => {
		// 100.00 a month, last payment Dec 1: three payments (Nov 1... Dec 1 is the second) at 0%.
		const plan = planOf(item({ endsOn: d('2026-12-01') }))!;
		const projection = projectLoan(loan({ rateBp: 0 }), plan, FROM);
		expect(projection).toEqual({ kind: 'runs-out', lastPayment: '2026-12-01', remaining: 80000 });
	});

	it('a skipped payment still charges its period and pays nothing', () => {
		const skip: Override = { itemId: '1', originalDate: d('2026-11-01'), action: 'skip' };
		const sim = simulateLoan(loan(), planOf(item(), [skip]), FROM, 1200);
		// Nov: 10.00 interest, nothing paid -> 1010.00. Dec: 10.10 interest, 100.00 paid -> 920.10.
		expect(sim.steps[0]).toEqual({
			date: '2026-11-01',
			interest: 1000,
			payment: 0,
			balance: 101000
		});
		expect(sim.steps[1]).toMatchObject({ date: '2026-12-01', interest: 1010, balance: 92010 });
	});

	it('a changed payment uses its new date and amount', () => {
		const change: Override = {
			itemId: '1',
			originalDate: d('2026-11-01'),
			action: 'change',
			date: d('2026-11-03'),
			amount: minor(25000)
		};
		const sim = simulateLoan(loan(), planOf(item(), [change]), FROM, 1200);
		expect(sim.steps[0]).toMatchObject({ date: '2026-11-03', payment: 25000, balance: 76000 });
	});

	it('does not read payments before the balance date, and ignores pay', () => {
		const plan = planOf(item(), [], d('2026-12-15'))!;
		expect(plan.periods[0].date).toBe('2027-01-01');
		expect(paymentPlanFor({ scheduleItemId: 'pay' }, fixtureItems, [], FROM)).toBeNull();
	});
});

describe('TSK-05B6CF interest this month is one figure', () => {
	it('adds each loan rounded on its own: 34.49 + 10.00 + 0 = 44.49', () => {
		const loans = [
			{ balance: minor(180000), rateBp: 2299 }, // 34.485 -> 34.49
			{ balance: minor(100000), rateBp: 1200 }, // 10.00
			{ balance: minor(15000), rateBp: 0 } // a known 0%
		];
		expect(interestThisMonth(loans)).toBe(4449);
	});

	it('counts a loan whose rate is unknown as nothing, and nothing owed as nothing', () => {
		expect(interestThisMonth([{ balance: minor(100000), rateBp: null }])).toBe(0);
		expect(interestThisMonth([])).toBe(0);
	});
});

describe('TSK-5CEFEA the debt-free date is the latest payoff, naming what blocks it', () => {
	const payoff = (date: string): NamedProjection['projection'] => ({
		kind: 'payoff',
		date: d(date),
		interest: minor(0),
		payments: 1
	});
	const named = (name: string, projection: NamedProjection['projection']): NamedProjection => ({
		loanId: name,
		name,
		projection
	});

	it('is the latest of the loans', () => {
		expect(
			debtFreeDate([
				named('Card', payoff('2027-05-01')),
				named('Car', payoff('2029-02-01')),
				named('Laptop', payoff('2026-12-04'))
			])
		).toEqual({ kind: 'date', date: '2029-02-01', unknownRates: [] });
	});

	it('has no date when one loan never pays off, and names it', () => {
		const result = debtFreeDate([
			named('Card', { kind: 'never', reason: 'interest' }),
			named('Car', payoff('2029-02-01'))
		]);
		expect(result).toEqual({
			kind: 'blocked',
			blocked: [{ loanId: 'Card', name: 'Card', reason: 'never' }],
			unknownRates: []
		});
	});

	it('puts a loan that never pays off ahead of one with no payments', () => {
		const result = debtFreeDate([
			named('Friend', { kind: 'no-payments' }),
			named('Card', { kind: 'never', reason: 'interest' }),
			named('Plan', { kind: 'runs-out', lastPayment: d('2026-12-01'), remaining: minor(100) })
		]);
		expect(result.kind === 'blocked' && result.blocked.map((b) => b.reason)).toEqual([
			'never',
			'runs-out',
			'no-payments'
		]);
	});

	it('says the date assumes the known rates when a rate is unknown', () => {
		const result = debtFreeDate([
			named('Card', { kind: 'unknown-rate', assumingNoInterest: payoff('2027-05-01') }),
			named('Car', payoff('2026-12-01'))
		]);
		expect(result).toEqual({ kind: 'date', date: '2027-05-01', unknownRates: ['Card'] });
	});

	it('has nothing to say when nothing is owed', () => {
		expect(debtFreeDate([])).toEqual({ kind: 'none' });
	});
});

describe('TSK-1E7743 the expected balance is the last balance, plus interest, less payments confirmed', () => {
	const base = { balance: minor(100000), rateBp: 1200, cadence: 'month' as Cadence };

	// 1,000.00 at 12%, one monthly period closed (10.00 interest), the 100.00 payment confirmed:
	// 1,000.00 + 10.00 - 100.00 = 910.00.
	it('adds the period interest and takes off the payment that went out', () => {
		expect(
			expectedLoanBalance({
				...base,
				accruals: [d('2026-11-01')],
				paid: [{ date: d('2026-11-01'), amount: minor(10000) }]
			})
		).toBe(91000);
	});

	it('does not take off a payment that did not go out', () => {
		expect(expectedLoanBalance({ ...base, accruals: [d('2026-11-01')], paid: [] })).toBe(101000);
	});

	it('charges the second period on the balance after the first payment: 910.00 -> 919.10 -> 819.10', () => {
		expect(
			expectedLoanBalance({
				...base,
				accruals: [d('2026-11-01'), d('2026-12-01')],
				paid: [
					{ date: d('2026-11-01'), amount: minor(10000) },
					{ date: d('2026-12-01'), amount: minor(10000) }
				]
			})
		).toBe(81910);
	});

	it('is the balance unchanged for a loan with no period closed, and with an unknown rate', () => {
		expect(expectedLoanBalance({ ...base, accruals: [], paid: [] })).toBe(100000);
		expect(
			expectedLoanBalance({ ...base, rateBp: null, accruals: [d('2026-11-01')], paid: [] })
		).toBe(100000);
	});

	it('never goes below nothing owed', () => {
		expect(
			expectedLoanBalance({
				...base,
				balance: minor(5000),
				accruals: [],
				paid: [{ date: d('2026-11-01'), amount: minor(10000) }]
			})
		).toBe(0);
	});

	it('finds the periods that closed since the balance, from the schedule item or the calendar', () => {
		const plan = planOf(item(), [], d('2026-09-30'))!;
		expect(accrualDates(plan, d('2026-09-30'), d('2026-11-15'))).toEqual({
			cadence: 'month',
			dates: ['2026-10-01', '2026-11-01']
		});
		expect(accrualDates(null, d('2026-09-15'), d('2026-11-15'))).toEqual({
			cadence: 'month',
			dates: ['2026-10-15', '2026-11-15']
		});
		expect(accrualDates(null, d('2026-10-31'), d('2026-11-14')).dates).toEqual([]);
	});
});

describe('TSK-5A6861 card purchases are the card balance above what was expected', () => {
	it('is the rise over the expected balance', () => {
		expect(cardPurchases(minor(190000), minor(150000))).toBe(40000);
	});

	it('is nothing when the card is lower than expected: that is a payment, not spending', () => {
		expect(cardPurchases(minor(100000), minor(150000))).toBe(0);
		expect(cardPurchases(minor(150000), minor(150000))).toBe(0);
	});
});
