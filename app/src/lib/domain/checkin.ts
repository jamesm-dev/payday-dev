/**
 * The arithmetic of a payday check-in. Pure: the data layer feeds it what was entered.
 *
 *   expected = the last known balance + the pay that landed since - the payments that went out
 *   spent    = expected - actual
 *
 * "Spent" is a difference, so it can be negative: more arrived than was counted (a refund, a late
 * paycheck bigger than scheduled). It is shown as it is, never clamped to zero.
 */
import { addDays, type CalDate } from './dates.ts';
import { add, sub, sum, type Minor } from './money.ts';
import { expand, type Item, type Occurrence, type Override } from './schedule.ts';

/** The last known balance and the day it was true: the last check-in, or setup. */
export type Base = { amount: Minor; asOf: CalDate };

/** Pay scheduled in `(since, today]`: what the check-in expects to have landed. */
export function incomeDueSince(
	items: readonly Item[],
	overrides: readonly Override[],
	since: CalDate,
	today: CalDate
): Occurrence[] {
	return expand(items, overrides, addDays(since, 1), today).filter((o) => o.kind === 'income');
}

/** Bills and loan payments scheduled in `(since, today]`: what the check-in asks about. */
export function paymentsDueSince(
	items: readonly Item[],
	overrides: readonly Override[],
	since: CalDate,
	today: CalDate
): Occurrence[] {
	return expand(items, overrides, addDays(since, 1), today).filter((o) => o.kind !== 'income');
}

/**
 * What the account should hold: the base, plus the pay that landed, less the payments confirmed
 * paid. A payment marked missed is not in `paid`: its money is still in the account.
 */
export function expectedBalance(input: {
	base: Base;
	payLanded: Minor;
	paid: readonly { amount: Minor }[];
}): Minor {
	return sub(add(input.base.amount, input.payLanded), sum(input.paid.map((p) => p.amount)));
}

/** Spending since the last check-in: expected minus actual. Negative when more is there than expected. */
export function spentSince(expected: Minor, actual: Minor): Minor {
	return sub(expected, actual);
}
