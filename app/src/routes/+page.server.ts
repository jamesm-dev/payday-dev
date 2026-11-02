import { fail, redirect } from '@sveltejs/kit';
import { checkBalance, checkDate, checkExpense } from '#lib/server/money/validate.ts';
import { addExpense } from '#lib/server/money/expenses.ts';
import { setFlash } from '#lib/server/flash.ts';
import { getDb } from '#lib/server/db/index.ts';
import { buildHome } from '#lib/server/money/home.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getOwner, ownerToday, setBalance } from '#lib/server/money/store.ts';
import type { Actions, PageServerLoad } from './$types';

/** Rendered on the server, so the number is in the first HTML and shows before any script runs. */
export const load: PageServerLoad = ({ locals }) => {
	const ownerId = requireOwner(locals);
	const db = getDb();
	// Until setup is finished there is no number to show: carry on where setup left off.
	if (getOwner(db, ownerId).setupStep !== null) redirect(303, '/setup');
	return { home: buildHome(db, ownerId, new Date()) };
};

export const actions: Actions = {
	/** The small form on the home screen: a fresh balance, and the day it was true. */
	balance: async ({ request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const form = await readForm(request);
		const values = { amount: String(form.amount ?? ''), asOf: String(form.asOf ?? '') };

		const amount = checkBalance(form.amount);
		const asOf = checkDate(form.asOf, 'the day this balance was true');
		const problems: Record<string, string> = {};
		if (!amount.ok) problems.amount = amount.problems.amount;
		if (!asOf.ok) problems.asOf = asOf.problems.date;
		else if (asOf.value > ownerToday(getOwner(db, ownerId), new Date())) {
			problems.asOf = 'That day has not happened yet. Choose today or an earlier day.';
		}
		if (Object.keys(problems).length > 0 || !amount.ok || !asOf.ok) {
			return fail(400, { balance: { values, problems } });
		}
		setBalance(db, ownerId, amount.value, asOf.value);
		setFlash(cookies, 'balance-updated');
		// Post, redirect, get: reloading the page does not send the balance again.
		redirect(303, '/');
	},

	/** The quick-add form: an amount, what it was for, and the day (today unless changed). */
	expense: async ({ request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const form = await readForm(request);
		const values = {
			amount: String(form.amount ?? ''),
			note: String(form.note ?? ''),
			date: String(form.date ?? '')
		};
		const now = new Date();
		const checked = checkExpense(form, ownerToday(getOwner(db, ownerId), now));
		if (!checked.ok) return fail(400, { expense: { values, problems: checked.problems } });
		addExpense(db, ownerId, checked.value, now);
		setFlash(cookies, 'expense-added');
		redirect(303, '/');
	}
};
