/**
 * "Paid early" from the home screen's list of what is kept aside (TSK-342C1F). It uses the plan's
 * own checks and the same locked `setPaidMark`, and adds one rule: only a payment still ahead of
 * today and due on or before the next payday is marked here (the plan marks the later ones).
 */
import { expand } from '#lib/domain/schedule.ts';
import { nextPayday } from '#lib/domain/periods.ts';
import type { Db } from '#lib/server/db/open.ts';
import { getItem, loadPlan, setPaidMark } from './store.ts';
import { checkPaidMark } from './validate.ts';

export const NOT_BEFORE_PAYDAY = 'Only a bill due before your next payday can be paid early here.';

export type HomeMarkResult =
	| { ok: true; paid: boolean }
	| { ok: false; status: 404 }
	| { ok: false; status: 400; problem: string };

export async function markPaidEarlyFromHome(
	db: Db,
	ownerId: number,
	form: Record<string, unknown>,
	now: Date
): Promise<HomeMarkResult> {
	const raw = String(form.itemId ?? '');
	const item = /^\d{1,9}$/.test(raw) ? await getItem(db, ownerId, Number(raw)) : null;
	if (!item) return { ok: false, status: 404 };
	const checked = checkPaidMark(item, form);
	if (!checked.ok) return { ok: false, status: 400, problem: Object.values(checked.problems)[0] };
	const { originalDate, paid } = checked.value;
	if (paid) {
		const plan = await loadPlan(db, ownerId, now);
		const next = nextPayday(plan.items, plan.overrides, plan.today);
		const change = plan.overrides.find(
			(o) => o.itemId === item.id && o.originalDate === originalDate
		);
		const due = change?.action === 'change' && change.date ? change.date : originalDate;
		const occurrence = expand([item], plan.overrides, due, due).find(
			(o) => o.originalDate === originalDate
		);
		if (!occurrence || !next || occurrence.date <= plan.today || occurrence.date > next) {
			return { ok: false, status: 400, problem: NOT_BEFORE_PAYDAY };
		}
	}
	await setPaidMark(db, ownerId, Number(item.id), originalDate, paid, now);
	return { ok: true, paid };
}
