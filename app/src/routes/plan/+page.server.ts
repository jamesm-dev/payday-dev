import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import { buildPlan, PLAN_LENGTH } from '#lib/server/money/planView.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getItem, setPaidMark } from '#lib/server/money/store.ts';
import { checkPaidMark } from '#lib/server/money/validate.ts';
import type { Actions, PageServerLoad } from './$types';

// Plain text, links and one-button forms: no script needed, so none is sent.
export const csr = false;

export const load: PageServerLoad = ({ locals }) => {
	const ownerId = requireOwner(locals);
	return { plan: buildPlan(getDb(), ownerId, new Date(), PLAN_LENGTH) };
};

export const actions: Actions = {
	/**
	 * Marks one bill paid, or takes the mark off. Only a label for the list and the next check-in:
	 * the number does not move until a check-in sees the money gone.
	 */
	paid: async ({ request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const form = await readForm(request);
		const raw = String(form.itemId ?? '');
		const item = /^\d{1,9}$/.test(raw) ? getItem(db, ownerId, Number(raw)) : null;
		if (!item) error(404, 'Not found');
		const checked = checkPaidMark(item, form);
		if (!checked.ok) return fail(400, { problems: checked.problems });
		const { originalDate, paid } = checked.value;
		setPaidMark(db, ownerId, Number(item.id), originalDate, paid, new Date());
		setFlash(cookies, paid ? 'marked-paid' : 'marked-unpaid');
		const back = String(form.payday ?? '');
		redirect(303, /^\d{4}-\d{2}-\d{2}$/.test(back) ? `/plan#paycheck-${back}` : '/plan');
	}
};
