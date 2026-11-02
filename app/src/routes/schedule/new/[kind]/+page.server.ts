import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import {
	addItem,
	getOwner,
	listGroups,
	listItems,
	ownerToday,
	setItemLabels
} from '#lib/server/money/store.ts';
import { checkLabels, checkNewItem, isKind } from '#lib/server/money/validate.ts';
import type { Actions, PageServerLoad } from './$types';

/*
 * These screens are plain forms and links that work the same with JavaScript off. The script is sent
 * only for the date fields' calendar (a mouse gets a calendar; a phone keeps its own date picker).
 * Every field stays hydration-safe: empty values are left unbound, so nothing typed in before the
 * script arrived is reset.
 */

/** The kind is part of the address (/schedule/new/bill), so a link needs no query string. */
function kindOf(params: { kind: string }) {
	if (!isKind(params.kind)) error(404, 'Not found');
	return params.kind;
}

export const load: PageServerLoad = ({ params, locals }) => {
	const ownerId = requireOwner(locals);
	return { kind: kindOf(params), groups: listGroups(listItems(getDb(), ownerId)) };
};

export const actions: Actions = {
	default: async ({ request, params, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const form = await readForm(request);
		const kind = kindOf(params);
		const today = ownerToday(getOwner(db, ownerId), new Date());

		const checked = checkNewItem(kind, form, today);
		const labels =
			kind === 'income'
				? ({ ok: true, value: { group: null, optional: false } } as const)
				: checkLabels(form);
		if (!checked.ok || !labels.ok) {
			return fail(400, {
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
		db.transaction(() => {
			const item = addItem(db, ownerId, checked.value);
			setItemLabels(db, ownerId, Number(item.id), labels.value);
		});
		setFlash(cookies, 'item-added');
		redirect(303, '/schedule');
	}
};
