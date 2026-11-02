/**
 * One paycheck of the plan as the owner's own list (Paycheck List Export). The plan decides what the
 * paycheck covers, exactly as on the Plan page; this adds the owner's groups, the optional marks and
 * what is already paid, and hands the lines to a writer.
 */
import type { CalDate } from '#lib/domain/dates.ts';
import { listLines, paycheckList, type ListEntry } from '#lib/domain/paycheckList.ts';
import { planPaychecks, type Paycheck } from '#lib/domain/plan.ts';
import type { Item } from '#lib/domain/schedule.ts';
import type { Db } from '#lib/server/db/open.ts';
import { occurrenceKey } from './checkinForm.ts';
import { PLAN_LENGTH } from './planView.ts';
import { loadPlan, paidOccurrences } from './store.ts';

/**
 * Every line the paycheck must cover: its bills and loan payments, then the yearly and quarterly
 * shares it sets aside, so the list adds up to what the Plan page says the paycheck must cover.
 */
export function listEntries(
	p: Paycheck,
	items: readonly Item[],
	paid: ReadonlySet<string>
): ListEntry[] {
	const labels = (itemId: string) => {
		const item = items.find((i) => i.id === itemId);
		return {
			...(item?.group ? { group: item.group } : {}),
			...(item?.optional ? { optional: true } : {})
		};
	};
	return [
		...p.covers.map((o) => ({
			name: o.name,
			amount: o.amount,
			date: o.date,
			...labels(o.itemId),
			...(paid.has(occurrenceKey(o.itemId, o.originalDate)) ? { paid: true } : {})
		})),
		...p.setAsides.map((s) => ({
			name: `${s.name} (set aside)`,
			amount: s.share,
			// A share is put aside on the payday itself.
			date: p.payday,
			...labels(s.itemId)
		}))
	];
}

/** The list for one of the next paychecks, or null when that payday is not one of them. */
export function buildPaycheckList(
	db: Db,
	ownerId: number,
	now: Date,
	payday: CalDate
): { lines: string[] } | null {
	const plan = loadPlan(db, ownerId, now);
	const paycheck = planPaychecks(plan.items, plan.overrides, plan.today, PLAN_LENGTH).find(
		(p) => p.payday === payday
	);
	if (!paycheck) return null;
	const paid = paidOccurrences(db, ownerId, plan.items);
	const list = paycheckList(
		paycheck.pays.map((o) => ({ name: o.name, amount: o.amount })),
		listEntries(paycheck, plan.items, paid)
	);
	return { lines: listLines(list) };
}
