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
import { earlyKey, earlyPayments, markCounts } from './safeToSpend.ts';
import { expand, type Item, type Occurrence, type Override, type PaidMark } from './schedule.ts';

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

/** A payment paid early, as a payday update sees it (ADR-0020, owner's answer Q2). */
export type PaidEarlyLine = {
	occurrence: Occurrence;
	/** The day it was paid, for "Paid early on <date>". */
	paidOn: CalDate;
	/** True when its due date is in `(since, today]`: it is a line of this update, shown already answered. */
	inWindow: boolean;
	/** True when the money left after the last balance, so it comes off the expected balance. */
	subtract: boolean;
};

/**
 * Splits a payday update's payments. `asked` is `paymentsDueSince` less every payment paid early
 * and due in the window: those need no answer (paid early on or before `since`, the balance holds it,
 * so it is not subtracted again; paid inside the window, it is subtracted). `paidEarly` lists them,
 * plus any paid early inside `(since, today]` but due later, which are subtracted too (that money has
 * left). `subtracted` is what to add to `paid` for `expectedBalance`. A payment in `missed` ("did not
 * go out") is not early: it is asked and reserved as ever. `sinceReadAt` is when the last balance
 * was read (ISO), for a mark made on `since` itself, as `markCounts` explains.
 */
export function paymentsSince(input: {
	items: readonly Item[];
	overrides: readonly Override[];
	since: CalDate;
	today: CalDate;
	marks?: readonly PaidMark[];
	sinceReadAt?: string | null;
	missed?: ReadonlySet<string>;
}): { asked: Occurrence[]; paidEarly: PaidEarlyLine[]; subtracted: Occurrence[] } {
	const { items, overrides, since, today } = input;
	const due = paymentsDueSince(items, overrides, since, today);
	const paidEarly: PaidEarlyLine[] = [];
	const early = new Set<string>();
	for (const e of earlyPayments(items, overrides, input.marks ?? [], input.missed)) {
		if (e.paidOn > today) continue;
		const inWindow = e.occurrence.date > since && e.occurrence.date <= today;
		const subtract = markCounts(e, since, input.sinceReadAt);
		if (!inWindow && !subtract) continue;
		if (inWindow) early.add(earlyKey(e.occurrence.itemId, e.occurrence.originalDate));
		paidEarly.push({ occurrence: e.occurrence, paidOn: e.paidOn, inWindow, subtract });
	}
	return {
		asked: due.filter((o) => !early.has(earlyKey(o.itemId, o.originalDate))),
		paidEarly,
		subtracted: paidEarly.filter((l) => l.subtract).map((l) => l.occurrence)
	};
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
