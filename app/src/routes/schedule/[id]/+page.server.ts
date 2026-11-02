import { error, fail, redirect, type Cookies } from '@sveltejs/kit';
import type { Item } from '#lib/domain/schedule.ts';
import { dateText, moneyText, ruleText } from '#lib/format.ts';
import { getDb } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import type { Db } from '#lib/server/db/open.ts';
import { loanForItem } from '#lib/server/money/loans.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import {
	getItem,
	getOwner,
	listGroups,
	loadPlan,
	ownerToday,
	removeOverride,
	setItemEnd,
	setItemLabels,
	setOverride,
	updateItem
} from '#lib/server/money/store.ts';
import { upcoming } from '#lib/server/money/upcoming.ts';
import {
	checkDate,
	checkEnd,
	checkItemFields,
	checkLabels,
	checkOverride,
	startsOnFor
} from '#lib/server/money/validate.ts';
import type { Actions, PageServerLoad } from './$types';

/*
 * These screens are plain forms and links that work the same with JavaScript off. The script is sent
 * only for the date fields' calendar (a mouse gets a calendar; a phone keeps its own date picker).
 * Every field stays hydration-safe: empty values are left unbound, so nothing typed in before the
 * script arrived is reset.
 */

/** Whole units with exactly two decimals, from integer minor units, for refilling an input. */
function toDecimal(minorUnits: number): string {
	const sign = minorUnits < 0 ? '-' : '';
	const abs = Math.abs(minorUnits);
	return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function itemId(params: { id: string }): number {
	if (!/^\d{1,9}$/.test(params.id)) error(404, 'Not found');
	return Number(params.id);
}

function mustGet(db: Db, ownerId: number, id: number): Item {
	const item = getItem(db, ownerId, id);
	if (!item) error(404, 'Not found');
	return item;
}

export const load: PageServerLoad = ({ params, locals }) => {
	const ownerId = requireOwner(locals);
	const id = itemId(params);
	const db = getDb();
	const plan = loadPlan(db, ownerId, new Date());
	const item = plan.items.find((i) => i.id === String(id));
	if (!item) error(404, 'Not found');
	const loan = loanForItem(db, ownerId, id);
	const { today, settings } = plan;
	const money = (n: number) => moneyText(n, settings.currency);

	return {
		item: {
			id: item.id,
			kind: item.kind,
			name: item.name,
			rule: ruleText(item.rule.kind === 'monthly' ? item.rule : { kind: item.rule.kind }),
			amount: money(item.amount),
			ended: item.endsOn !== undefined && item.endsOn < today,
			endsOn: item.endsOn ? dateText(item.endsOn) : null
		},
		values: {
			name: item.name,
			amount: toDecimal(item.amount),
			repeat: item.rule.kind,
			date: item.rule.kind === 'monthly' ? '' : item.rule.anchor,
			day: item.rule.kind === 'monthly' ? String(item.rule.day) : ''
		},
		labels: { group: item.group ?? '', optional: item.optional === true },
		groups: listGroups(plan.items),
		today,
		loan: loan ? { id: loan.id, name: loan.name } : null,
		payments: upcoming(item, plan.overrides, today).map((u) => ({
			originalDate: u.originalDate,
			status: u.status,
			date: dateText(u.date),
			was: u.status === 'changed' ? dateText(u.originalDate) : null,
			amount: money(u.amount),
			amountField: toDecimal(u.amount),
			newDate: u.date
		}))
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const id = itemId(params);
		const item = mustGet(db, ownerId, id);
		const form = await readForm(request);
		const checked = checkItemFields(item.kind, form);
		// Pay has no group or optional mark: it is the top of the list, not a line on it.
		const labels =
			item.kind === 'income'
				? ({ ok: true, value: { group: null, optional: false } } as const)
				: checkLabels(form);
		if (!checked.ok || !labels.ok) {
			return fail(400, {
				action: 'save',
				values: {
					name: String(form.name ?? ''),
					amount: String(form.amount ?? ''),
					repeat: String(form.repeat ?? ''),
					date: String(form.date ?? ''),
					day: String(form.day ?? '')
				},
				labels: { group: String(form.group ?? ''), optional: form.optional === 'yes' },
				problems: {
					...(checked.ok ? {} : checked.problems),
					...(labels.ok ? {} : labels.problems)
				}
			});
		}
		const today = ownerToday(getOwner(db, ownerId), new Date());
		// The history starts again only if the rule itself changed; a new name or amount keeps it.
		const sameRule = JSON.stringify(checked.value.rule) === JSON.stringify(item.rule);
		let startsOn = sameRule ? item.startsOn : startsOnFor(checked.value.rule, today);
		if (item.endsOn && startsOn > item.endsOn) startsOn = item.endsOn;
		db.transaction(() => {
			updateItem(db, ownerId, id, { ...checked.value, startsOn, endsOn: item.endsOn });
			setItemLabels(db, ownerId, id, labels.value);
		});
		setFlash(cookies, 'changes-saved');
		redirect(303, '/schedule');
	},

	/** Ends it on a date. The item and its history stay; it just stops producing payments. */
	end: async ({ params, request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const id = itemId(params);
		const item = mustGet(db, ownerId, id);
		const form = await readForm(request);
		const checked = checkEnd(item.startsOn, form.endsOn);
		if (!checked.ok) return fail(400, { action: 'end', problems: checked.problems });
		setItemEnd(db, ownerId, id, checked.value);
		setFlash(cookies, 'item-ended');
		redirect(303, '/schedule');
	},

	resume: ({ params, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const id = itemId(params);
		mustGet(db, ownerId, id);
		setItemEnd(db, ownerId, id, null);
		setFlash(cookies, 'item-resumed');
		redirect(303, `/schedule/${id}`);
	},

	skip: async ({ params, request, locals, cookies }) =>
		overrideAction('skip', params, request, locals, cookies),
	change: async ({ params, request, locals, cookies }) =>
		overrideAction('change', params, request, locals, cookies),

	/** Undo: the payment goes back to what its rule says. */
	undo: async ({ params, request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const id = itemId(params);
		mustGet(db, ownerId, id);
		const date = checkDate((await readForm(request)).originalDate, 'which payment');
		if (date.ok) {
			removeOverride(db, ownerId, id, date.value);
			setFlash(cookies, 'payment-undone');
		}
		redirect(303, `/schedule/${id}`);
	}
};

async function overrideAction(
	action: 'skip' | 'change',
	params: { id: string },
	request: Request,
	locals: App.Locals,
	cookies: Cookies
) {
	const ownerId = requireOwner(locals);
	const db = getDb();
	const id = itemId(params);
	const item = mustGet(db, ownerId, id);
	const form = await readForm(request);
	const checked = checkOverride(item, action, form);
	if (!checked.ok) {
		return fail(400, {
			action,
			originalDate: String(form.originalDate ?? ''),
			problems: checked.problems
		});
	}
	setOverride(db, ownerId, id, checked.value);
	setFlash(cookies, action === 'skip' ? 'payment-skipped' : 'payment-changed');
	redirect(303, `/schedule/${id}`);
}
