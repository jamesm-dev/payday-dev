/**
 * Loans: what is owed, what it costs, and when it ends. Pure; amounts are integer minor units and
 * rates are integer basis points (ADR-0007), so no float is ever involved.
 *
 * One model serves all four kinds (credit card, instalment loan, buy-now-pay-later plan, informal
 * loan). Only where the payments come from differs: a loan with a linked schedule item pays what
 * that item says (the same `expand()` the safe-to-spend number uses, so a payment is one fact, not
 * two); a card with none pays its minimum.
 *
 * Interest convention, stated once because every figure below follows it:
 *
 *   - The rate is the yearly rate (APR) in basis points. NULL is "unknown" and is never guessed.
 *   - Every scheduled payment closes one interest period. The period's interest is charged on the
 *     balance before the payment, then the payment is taken off:
 *         balance' = balance + interest - payment
 *   - A monthly payment closes a month:   interest = round_half_up(balance x rate_bp / (10000 x 12)).
 *     A quarterly or yearly payment closes 3 or 12 months of simple interest on the balance.
 *   - A payment every 14 days closes 14 days: interest = round_half_up(balance x rate_bp x 14 /
 *     (10000 x 365)).
 *   - Interest is rounded once per period, half up, to a whole minor unit. The first payment after
 *     the balance's date is charged a full period, which is slightly conservative.
 *   - A skipped payment still closes its period: the interest is charged and nothing is paid.
 *   - Compounding is per payment period (the textbook amortisation), so a projection can be proved
 *     against n = -ln(1 - rB/P) / ln(1 + r) and the closed-form balance after k payments.
 */
import { addDays, calDate, dateParts, lastDayOfMonth, type CalDate } from './dates.ts';
import { minor, type Minor } from './money.ts';
import { expand, type Item, type Override } from './schedule.ts';

export const LOAN_TYPES = ['credit-card', 'instalment', 'bnpl', 'informal'] as const;
export type LoanType = (typeof LOAN_TYPES)[number];
export const isLoanType = (v: unknown): v is LoanType => LOAN_TYPES.includes(v as LoanType);

export type Loan = {
	id: string;
	type: LoanType;
	name: string;
	balance: Minor;
	/** The date `balance` was true on; payments after it are what is left to pay. */
	balanceAsOf: CalDate;
	/** Yearly rate in basis points; `null` is unknown. */
	rateBp: number | null;
	/** The schedule item that carries this loan's payments, or `null`. */
	scheduleItemId: string | null;
	/** A card's minimum payment, used when no schedule item is linked. */
	minPctBp: number | null;
	minFloor: Minor | null;
};

/** How long one interest period is. */
export type Cadence = 'fortnight' | 'month' | 'quarter' | 'year';

const CADENCE_MONTHS = { month: 1, quarter: 3, year: 12 } as const;

/** Integer division of non-negative integers, rounded half up, without a float quotient. */
export function divRoundHalfUp(numerator: number, denominator: number): number {
	if (!Number.isSafeInteger(numerator) || numerator < 0) {
		throw new RangeError(`Cannot round ${numerator}: too big or negative`);
	}
	if (!Number.isSafeInteger(denominator) || denominator <= 0) {
		throw new RangeError(`Bad denominator: ${denominator}`);
	}
	let q = Math.floor(numerator / denominator);
	// The float quotient can be off by one near a boundary; the remainder says which way.
	while (q * denominator > numerator) q--;
	while ((q + 1) * denominator <= numerator) q++;
	const rest = numerator - q * denominator;
	return rest * 2 >= denominator ? q + 1 : q;
}

/** The interest one period costs on a balance, rounded half up to a whole minor unit. */
export function periodInterest(balance: Minor, rateBp: number, cadence: Cadence): Minor {
	if (balance < 0) throw new RangeError('A balance owed cannot be negative');
	if (!Number.isInteger(rateBp) || rateBp < 0) throw new RangeError(`Bad rate: ${rateBp}`);
	if (cadence === 'fortnight') return minor(divRoundHalfUp(balance * rateBp * 14, 10_000 * 365));
	return minor(divRoundHalfUp(balance * rateBp * CADENCE_MONTHS[cadence], 10_000 * 12));
}

/**
 * A card's minimum payment on a balance: the larger of the floor and the percentage, never more than
 * the balance and never less than one minor unit while anything is owed.
 */
export function cardMinimum(balance: Minor, minPctBp: number | null, floor: Minor | null): Minor {
	if (balance <= 0) return minor(0);
	const byPercent = minor(divRoundHalfUp(balance * (minPctBp ?? 0), 10_000));
	return minor(Math.min(balance, Math.max(1, floor ?? 0, byPercent)));
}

/** The same day of the month `n` months on, or the last day when that month is shorter. */
export function monthsAfter(date: CalDate, n: number): CalDate {
	const { y, m, d } = dateParts(date);
	const index = y * 12 + (m - 1) + n;
	const ny = Math.floor(index / 12);
	const nm = (index % 12) + 1;
	return calDate(ny, nm, Math.min(d, lastDayOfMonth(ny, nm)));
}

// ---- Where the payments come from ----

/** One payment period of a loan's linked schedule item; `amount` is 0 when it was skipped. */
export type PlanPeriod = { date: CalDate; amount: Minor };

export type PaymentPlan = {
	cadence: Cadence;
	periods: readonly PlanPeriod[];
	/** True when the item ends before the horizon, so running out of periods means the payments stop. */
	ends: boolean;
};

/** No projection looks further than this; a loan that outlasts it is called "too long". */
export const PROJECTION_YEARS = 50;

const CADENCE_OF_RULE = {
	every14: 'fortnight',
	monthly: 'month',
	quarterly: 'quarter',
	yearly: 'year'
} as const;

/**
 * The payments after `from` of the loan's linked schedule item, expanded with the schedule's own
 * `expand()`. The periods are the item's rule dates, so a skipped payment keeps its period (interest
 * is still charged) with an amount of 0, and a changed one keeps its new date and amount. Null when
 * the loan has no linked item, or the item is not found or is pay.
 */
export function paymentPlanFor(
	loan: Pick<Loan, 'scheduleItemId'>,
	items: readonly Item[],
	overrides: readonly Override[],
	from: CalDate
): PaymentPlan | null {
	const item = items.find((i) => i.id === loan.scheduleItemId);
	if (!item || item.kind === 'income') return null;
	const start = addDays(from, 1);
	const end = addDays(from, 366 * PROJECTION_YEARS);
	const mine = overrides.filter((o) => o.itemId === item.id);
	const actual = new Map(expand([item], mine, start, end).map((o) => [o.originalDate, o]));
	const periods = expand([item], [], start, end).map((nominal) => {
		const o = actual.get(nominal.originalDate);
		return { date: o?.date ?? nominal.date, amount: o ? o.amount : minor(0) };
	});
	return {
		cadence: CADENCE_OF_RULE[item.rule.kind],
		periods,
		ends: item.endsOn !== undefined && item.endsOn < end
	};
}

// ---- Projection ----

export type Step = { date: CalDate; interest: Minor; payment: Minor; balance: Minor };

export type Simulation = {
	steps: Step[];
	outcome: 'payoff' | 'never' | 'too-long' | 'runs-out' | 'no-payments';
};

/** The longest a card paying its minimum is followed, in months. */
const MAX_CARD_MONTHS = PROJECTION_YEARS * 12;

type LoanTerms = Pick<Loan, 'type' | 'balance' | 'minPctBp' | 'minFloor'>;

/**
 * Plays a loan forward one payment period at a time, from the balance's date to payoff. Exported so
 * the tests can compare the balance after every period with a reference calculation.
 */
export function simulateLoan(
	loan: LoanTerms,
	plan: PaymentPlan | null,
	from: CalDate,
	rateBp: number
): Simulation {
	const steps: Step[] = [];
	if (loan.balance === 0) return { steps, outcome: 'payoff' };

	const hasMinimum =
		loan.type === 'credit-card' && (loan.minPctBp !== null || (loan.minFloor ?? 0) > 0);
	if (!plan && !hasMinimum) return { steps, outcome: 'no-payments' };

	let balance: number = loan.balance;
	let checkedPace = false;
	for (let k = 0; ; k++) {
		let date: CalDate;
		let cadence: Cadence;
		let scheduled: number | null;
		if (plan) {
			if (k >= plan.periods.length) {
				return { steps, outcome: plan.ends ? 'runs-out' : 'too-long' };
			}
			date = plan.periods[k].date;
			cadence = plan.cadence;
			scheduled = plan.periods[k].amount;
		} else {
			if (k >= MAX_CARD_MONTHS) return { steps, outcome: 'too-long' };
			date = monthsAfter(from, k + 1);
			cadence = 'month';
			scheduled = null;
		}

		const interest = periodInterest(minor(balance), rateBp, cadence);
		const due = balance + interest;
		const payment = scheduled ?? cardMinimum(minor(due), loan.minPctBp, loan.minFloor);

		// The pace the owner is on: the first real payment must beat its period's interest.
		if (payment > 0 && !checkedPace) {
			checkedPace = true;
			if (payment <= interest) return { steps, outcome: 'never' };
		}

		const paid = Math.min(payment, due);
		balance = due - paid;
		steps.push({ date, interest, payment: minor(paid), balance: minor(balance) });
		if (balance === 0) return { steps, outcome: 'payoff' };
	}
}

export type Projection =
	| { kind: 'payoff'; date: CalDate; interest: Minor; payments: number }
	| { kind: 'never'; reason: 'interest' | 'too-long' }
	| { kind: 'no-payments' }
	| { kind: 'runs-out'; lastPayment: CalDate | null; remaining: Minor }
	/** The rate is unknown: `assumingNoInterest` is what the payments do at 0%, and only that. */
	| { kind: 'unknown-rate'; assumingNoInterest: Projection };

function summarise(sim: Simulation, from: CalDate): Projection {
	const last = sim.steps.at(-1);
	switch (sim.outcome) {
		case 'payoff': {
			let interest = 0;
			let payments = 0;
			for (const s of sim.steps) {
				interest += s.interest;
				if (s.payment > 0) payments++;
			}
			return { kind: 'payoff', date: last?.date ?? from, interest: minor(interest), payments };
		}
		case 'never':
			return { kind: 'never', reason: 'interest' };
		case 'too-long':
			return { kind: 'never', reason: 'too-long' };
		case 'no-payments':
			return { kind: 'no-payments' };
		case 'runs-out':
			return {
				kind: 'runs-out',
				lastPayment: last?.date ?? null,
				remaining: last?.balance ?? minor(0)
			};
	}
}

/**
 * When a loan ends at its current payments, and what that costs in interest; or that it never does
 * (a payment that does not beat its period's interest), or that its payments stop first, or that it
 * has none, or that its rate is unknown. `from` is the date the balance is true on.
 */
export function projectLoan(loan: Loan, plan: PaymentPlan | null, from: CalDate): Projection {
	if (loan.rateBp === null) {
		return {
			kind: 'unknown-rate',
			assumingNoInterest: summarise(simulateLoan(loan, plan, from, 0), from)
		};
	}
	return summarise(simulateLoan(loan, plan, from, loan.rateBp), from);
}

// ---- Totals ----

/**
 * What the loans cost in interest over one month at their current balances: one figure. A loan with
 * an unknown rate counts as nothing (use `unknownRateLoans` to say so).
 */
export function interestThisMonth(loans: readonly Pick<Loan, 'balance' | 'rateBp'>[]): Minor {
	let total = 0;
	for (const l of loans) {
		if (l.rateBp !== null) total += periodInterest(l.balance, l.rateBp, 'month');
	}
	return minor(total);
}

export function unknownRateLoans<T extends Pick<Loan, 'rateBp'>>(loans: readonly T[]): T[] {
	return loans.filter((l) => l.rateBp === null);
}

export type NamedProjection = { loanId: string; name: string; projection: Projection };

export type Blocker = {
	loanId: string;
	name: string;
	reason: 'never' | 'no-payments' | 'runs-out';
};

export type DebtFree =
	/** Nothing is owed. */
	| { kind: 'none' }
	/** The latest payoff date. `unknownRates` names the loans whose rate is unknown: the date counts them as no interest. */
	| { kind: 'date'; date: CalDate; unknownRates: string[] }
	/** No date: these loans never end at their payments. The first `never` is named first. */
	| { kind: 'blocked'; blocked: Blocker[]; unknownRates: string[] };

/**
 * The date everything is paid off: the latest payoff date. If any loan never pays off (or has no
 * payments, or its payments stop first) there is no date, and the loan is named; if any rate is
 * unknown, the result says the date assumes the known rates.
 */
export function debtFreeDate(projections: readonly NamedProjection[]): DebtFree {
	if (projections.length === 0) return { kind: 'none' };
	const unknownRates: string[] = [];
	const blocked: Blocker[] = [];
	let latest: CalDate | null = null;
	for (const { loanId, name, projection } of projections) {
		let p = projection;
		if (p.kind === 'unknown-rate') {
			unknownRates.push(name);
			p = p.assumingNoInterest;
		}
		if (p.kind === 'payoff') {
			if (latest === null || p.date > latest) latest = p.date;
		} else if (p.kind === 'never') {
			blocked.push({ loanId, name, reason: 'never' });
		} else if (p.kind === 'no-payments') {
			blocked.push({ loanId, name, reason: 'no-payments' });
		} else if (p.kind === 'runs-out') {
			blocked.push({ loanId, name, reason: 'runs-out' });
		}
	}
	if (blocked.length > 0) {
		const rank = { never: 0, 'runs-out': 1, 'no-payments': 2 } as const;
		blocked.sort((a, b) => rank[a.reason] - rank[b.reason]);
		return { kind: 'blocked', blocked, unknownRates };
	}
	return latest === null ? { kind: 'none' } : { kind: 'date', date: latest, unknownRates };
}

// ---- At a check-in ----

/**
 * The days a loan's interest periods close in `(asOf, today]`: its payment dates when it has a
 * schedule item, otherwise the monthly anniversaries of the balance's date.
 */
export function accrualDates(
	plan: PaymentPlan | null,
	asOf: CalDate,
	today: CalDate
): { cadence: Cadence; dates: CalDate[] } {
	if (plan) {
		return {
			cadence: plan.cadence,
			dates: plan.periods.map((p) => p.date).filter((d) => d > asOf && d <= today)
		};
	}
	const dates: CalDate[] = [];
	for (let k = 1; monthsAfter(asOf, k) <= today; k++) dates.push(monthsAfter(asOf, k));
	return { cadence: 'month', dates };
}

/**
 * What a loan should owe at a check-in: the last balance, plus the interest its periods charged
 * since, less the payments confirmed paid. Interest is charged first on a day with a payment, as in
 * the projection. Never below zero: an overpayment leaves nothing owed.
 */
export function expectedLoanBalance(input: {
	balance: Minor;
	rateBp: number | null;
	cadence: Cadence;
	/** The days an interest period closed since the balance. */
	accruals: readonly CalDate[];
	/** Payments confirmed paid since, by date. */
	paid: readonly { date: CalDate; amount: Minor }[];
}): Minor {
	type Event = { date: CalDate; order: 0 | 1; amount: number };
	const events: Event[] = [
		...input.accruals.map((date) => ({ date, order: 0 as const, amount: 0 })),
		...input.paid.map((p) => ({ date: p.date, order: 1 as const, amount: p.amount }))
	].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));

	let balance: number = input.balance;
	for (const e of events) {
		if (e.order === 0) {
			if (input.rateBp !== null)
				balance += periodInterest(minor(balance), input.rateBp, input.cadence);
		} else {
			balance = Math.max(0, balance - e.amount);
		}
	}
	return minor(balance);
}

/**
 * What was bought on a card since the last check-in: its real balance less its expected one, when
 * that is positive. A fall below what was expected is a payment the app was not told about, not
 * spending, and counts for nothing here.
 */
export function cardPurchases(actual: Minor, expected: Minor): Minor {
	return minor(actual > expected ? actual - expected : 0);
}
