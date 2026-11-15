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

export const load: PageServerLoad = async ({ locals }) => {
	const ownerId = requireOwner(locals);
	return { plan: await buildPlan(await getDb(), ownerId, new Date(), PLAN_LENGTH) };
};

export const actions: Actions = {
	/**
	 * Marks one bill paid early, or takes the mark off. Every bill on the plan is still ahead, so the
	 * mark is an early payment (ADR-0020): it comes off the number at once, its paycheck stops holding
	 * it, and taking the mark off puts the money back.
	 */
	paid: async ({ request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = await getDb();
		const form = await readForm(request);
		const raw = String(form.itemId ?? '');
		const item = /^\d{1,9}$/.test(raw) ? await getItem(db, ownerId, Number(raw)) : null;
		if (!item) error(404, 'Not found');
		const checked = checkPaidMark(item, form);
		if (!checked.ok) return fail(400, { problems: checked.problems });
		const { originalDate, paid } = checked.value;
		await setPaidMark(db, ownerId, Number(item.id), originalDate, paid, new Date());
		setFlash(cookies, paid ? 'marked-paid' : 'marked-unpaid');
		const back = String(form.payday ?? '');
		redirect(303, /^\d{4}-\d{2}-\d{2}$/.test(back) ? `/plan#paycheck-${back}` : '/plan');
	}
};
