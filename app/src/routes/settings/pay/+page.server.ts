import { fail } from '@sveltejs/kit';
import type { RhythmValues } from '#lib/setup/RhythmFields.svelte';
import { dateText, ruleText } from '#lib/format.ts';
import type { Rule } from '#lib/domain/schedule.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getOpenCheckIn } from '#lib/server/money/checkin.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { changeRhythm, splitMainPay } from '#lib/server/money/rhythm.ts';
import { getOwner, loadPlan, ownerToday } from '#lib/server/money/store.ts';
import { checkPayRhythm } from '#lib/server/money/validate.ts';
import type { Actions, PageServerLoad } from './$types';

/** A saved rule as the form's values, so the form opens on what is set now. */
function rhythmValues(rule: Rule): RhythmValues {
	const blank = { date: '', day: '', day2: '' };
	switch (rule.kind) {
		case 'every14':
			return { ...blank, repeat: 'every14', date: rule.anchor };
		case 'monthly':
			return { ...blank, repeat: 'monthly', day: String(rule.day) };
		case 'twiceMonthly':
			return { ...blank, repeat: 'twiceMonthly', day: String(rule.day), day2: String(rule.day2) };
		default:
			return { ...blank, repeat: 'every14' };
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const ownerId = requireOwner(locals);
	const db = await getDb();
	const plan = await loadPlan(db, ownerId, new Date());
	const { today } = plan;
	const { waiting, current: running } = splitMainPay(plan.items, today);
	const current = running.at(-1);
	return {
		hasPay: current !== undefined,
		current: current ? ruleText(current.rule) : null,
		// A change already chosen, still waiting for the next payday.
		waiting: waiting
			? {
					rule: ruleText(waiting.rule),
					from: dateText(waiting.startsOn),
					values: rhythmValues(waiting.rule)
				}
			: null,
		lastOldPayday: current?.endsOn !== undefined && waiting ? dateText(current.endsOn) : null,
		values: rhythmValues((waiting ?? current)?.rule ?? { kind: 'every14', anchor: today }),
		updateUnderWay: (await getOpenCheckIn(db, ownerId)) !== null
	};
};

export const actions: Actions = {
	change: async ({ request, locals }) => {
		const ownerId = requireOwner(locals);
		const db = await getDb();
		const form = await readForm(request);
		const values = {
			repeat: String(form.repeat ?? ''),
			date: String(form.date ?? ''),
			day: String(form.day ?? ''),
			day2: String(form.day2 ?? '')
		};
		const rhythm = checkPayRhythm(form);
		if (!rhythm.ok) return fail(400, { values, problems: rhythm.problems });
		const owner = await getOwner(db, ownerId);
		const today = ownerToday(owner, new Date());
		const result = await changeRhythm(db, ownerId, rhythm.value, owner.timeZone, today);
		if (!result.ok) return fail(400, { values, problems: { repeat: result.problem } });
		return {
			saved: {
				rule: ruleText(rhythm.value),
				lastOldPayday: dateText(result.lastOldPayday),
				firstNewPayday: dateText(result.firstNewPayday)
			}
		};
	}
};
