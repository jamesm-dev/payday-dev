/*
 * Changing how often the owner is paid (TSK-C8DA31, ADR-0021).
 *
 * The owner's rule: the next payday stays on the OLD rhythm, and the new rhythm starts after it.
 * So the old main pay ends on its next payday P, and a new main pay (same name and amount, the new
 * rule) starts the day after P. The engine reads every income marked `main`, so the paydays run on
 * with no gap and no double payday. A payday update under way is not touched.
 */
import { eq } from 'drizzle-orm';
import { addDays, type CalDate } from '#lib/domain/dates.ts';
import { nextPayday, primaryPay } from '#lib/domain/periods.ts';
import { expand, type Rule } from '#lib/domain/schedule.ts';
import { dateText } from '#lib/format.ts';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import { scheduleItem } from '#lib/server/db/schema.ts';
import { addItem, listItems, listOverrides, setItemEnd, updateItem } from './store.ts';

export type PayRule = Extract<Rule, { kind: 'every14' | 'monthly' | 'twiceMonthly' }>;

export type RhythmChange =
	| {
			ok: true;
			/** The last payday on the old rhythm: the next one when the change was made. */
			lastOldPayday: CalDate;
			/** The first payday on the new rhythm. */
			firstNewPayday: CalDate;
			/** Another change was already waiting; this one took its place. */
			replacedWaiting: boolean;
	  }
	| { ok: false; problem: string };

/** Thrown inside the transaction so that nothing is saved. */
class Refused extends Error {}

/** True when two rules give the same paydays. Every 14 days: the same day of the 14-day cycle. */
export function sameRhythm(a: Rule, b: Rule): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'every14' && b.kind === 'every14') {
		const days = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / 86_400_000);
		return (days(a.anchor) - days(b.anchor)) % 14 === 0;
	}
	if (a.kind === 'monthly' && b.kind === 'monthly') return a.day === b.day;
	if (a.kind === 'twiceMonthly' && b.kind === 'twiceMonthly') {
		return a.day === b.day && a.day2 === b.day2;
	}
	return false;
}

/**
 * Changes the main pay's rhythm, from the payday after `today`. `today` is the owner's today, so
 * `tz` is only kept for callers that have it to hand. All of it happens in one transaction under
 * the owner lock. A second change before the first has started replaces the one waiting.
 */
export async function changeRhythm(
	db: Db,
	ownerId: number,
	newRule: PayRule,
	_tz: string | null,
	today: CalDate
): Promise<RhythmChange> {
	try {
		return await db.transaction(async (tx) => {
			await lockOwner(tx, ownerId);
			const items = await listItems(tx, ownerId);
			const overrides = await listOverrides(tx, ownerId, items);

			const main = primaryPay(items);
			const waiting = main.filter((i) => i.startsOn > today && i.endsOn === undefined).at(-1);
			const current = main.filter(
				(i) => i !== waiting && i.startsOn <= today && (i.endsOn === undefined || i.endsOn >= today)
			);
			if (current.length === 0) {
				throw new Refused('You have not added your pay yet. Add it first, then change how often.');
			}

			let lastOldPayday: CalDate;
			let replacedWaiting = false;
			if (waiting) {
				// A change is already waiting for its payday: this one takes its place.
				if (sameRhythm(waiting.rule, newRule)) {
					throw new Refused('This is already how often you are paid. Nothing was changed.');
				}
				lastOldPayday = addDays(waiting.startsOn, -1);
				await updateItem(tx, ownerId, Number(waiting.id), {
					kind: waiting.kind,
					name: waiting.name,
					amount: waiting.amount,
					rule: newRule,
					startsOn: waiting.startsOn
				});
				replacedWaiting = true;
			} else {
				const next = nextPayday(items, overrides, today);
				if (!next) throw new Refused('Payday cannot find your next payday. Check your pay first.');
				lastOldPayday = next;
				const old =
					current.find((i) => expand([i], overrides, next, next).length > 0) ?? current.at(-1)!;
				if (sameRhythm(old.rule, newRule)) {
					throw new Refused('This is already how often you are paid. Nothing was changed.');
				}
				// An income that was the pay only by the old default becomes the main pay for real.
				// The old pay ends first: only one main pay may be active at a time.
				await setItemEnd(tx, ownerId, Number(old.id), next);
				await tx
					.update(scheduleItem)
					.set({ isMainPay: true })
					.where(eq(scheduleItem.id, Number(old.id)));
				await addItem(
					tx,
					ownerId,
					{
						kind: 'income',
						name: old.name,
						amount: old.amount,
						rule: newRule,
						startsOn: addDays(next, 1)
					},
					{ main: true }
				);
			}

			// What was promised, read back from what was saved: the next payday is unchanged and the
			// first new one comes after it, without a gap longer than the new rhythm allows.
			const saved = await listItems(tx, ownerId);
			const savedOverrides = await listOverrides(tx, ownerId, saved);
			if (nextPayday(saved, savedOverrides, today) !== lastOldPayday) {
				throw new Refused(
					'A payday you moved or skipped stops this change from keeping your next payday. Undo that first.'
				);
			}
			const firstNewPayday = nextPayday(saved, savedOverrides, lastOldPayday);
			const longest = newRule.kind === 'every14' ? 14 : 31;
			if (!firstNewPayday || firstNewPayday > addDays(lastOldPayday, longest)) {
				throw new Refused(
					`Your first payday on the new schedule would be ${firstNewPayday ? dateText(firstNewPayday) : 'missing'}, too long after ${dateText(lastOldPayday)}. Check the days you chose.`
				);
			}
			return { ok: true as const, lastOldPayday, firstNewPayday, replacedWaiting };
		});
	} catch (e) {
		if (e instanceof Refused) return { ok: false, problem: e.message };
		throw e;
	}
}
