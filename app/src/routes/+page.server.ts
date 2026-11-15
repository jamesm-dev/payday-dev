import { error, fail, redirect } from '@sveltejs/kit';
import { checkBalance, checkDate, checkExpense } from '#lib/server/money/validate.ts';
import { addExpense } from '#lib/server/money/expenses.ts';
import { setFlash } from '#lib/server/flash.ts';
import { getDb } from '#lib/server/db/index.ts';
import { buildHome } from '#lib/server/money/home.ts';
import { markPaidEarlyFromHome } from '#lib/server/money/homeMark.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getOwner, ownerToday, setBalance } from '#lib/server/money/store.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Rendered on the server, so the number is in the first HTML and shows before any script runs.
 * Signed out, the visitor gets the public home page, which needs no data: this returns before
 * anything touches the database.
 */
export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	if (locals.ownerId === null) {
		// One address, two pages: a shared cache must never hand the landing to a signed-in owner or
		// the number to a visitor. Signed in, hooks.server.ts adds `private, no-store`.
		setHeaders({ 'cache-control': 'no-store', vary: 'cookie' });
		return { landing: true as const };
	}
	const ownerId = requireOwner(locals);
	const db = await getDb();
	// Until setup is finished there is no number to show: carry on where setup left off.
	if ((await getOwner(db, ownerId)).setupStep !== null) redirect(303, '/setup');
	return { landing: false as const, home: await buildHome(db, ownerId, new Date()) };
};

export const actions: Actions = {
	/** The small form on the home screen: a fresh balance, and the day it was true. */
	balance: async ({ request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = await getDb();
		const form = await readForm(request);
		const values = { amount: String(form.amount ?? ''), asOf: String(form.asOf ?? '') };

		const amount = checkBalance(form.amount);
		const asOf = checkDate(form.asOf, 'the day this balance was true');
		const problems: Record<string, string> = {};
		if (!amount.ok) problems.amount = amount.problems.amount;
		if (!asOf.ok) problems.asOf = asOf.problems.date;
		else if (asOf.value > ownerToday(await getOwner(db, ownerId), new Date())) {
			problems.asOf = 'That day has not happened yet. Choose today or an earlier day.';
		}
		if (Object.keys(problems).length > 0 || !amount.ok || !asOf.ok) {
			return fail(400, { balance: { values, problems } });
		}
		await setBalance(db, ownerId, amount.value, asOf.value);
		setFlash(cookies, 'balance-updated');
		// Post, redirect, get: reloading the page does not send the balance again.
		redirect(303, '/');
	},

	/** The quick-add form: an amount, what it was for, and the day (today unless changed). */
	expense: async ({ request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = await getDb();
		const form = await readForm(request);
		const values = {
			amount: String(form.amount ?? ''),
			note: String(form.note ?? ''),
			date: String(form.date ?? '')
		};
		const now = new Date();
		const checked = checkExpense(form, ownerToday(await getOwner(db, ownerId), now));
		if (!checked.ok) return fail(400, { expense: { values, problems: checked.problems } });
		await addExpense(db, ownerId, checked.value, now);
		setFlash(cookies, 'expense-added');
		redirect(303, '/');
	},

	/**
	 * "Paid early" on a bill kept aside until the next payday, or taking the mark off. Like the other
	 * actions here it needs the owner: signed out, `requireOwner` refuses before anything is read.
	 */
	paid: async ({ request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = await getDb();
		const result = await markPaidEarlyFromHome(db, ownerId, await readForm(request), new Date());
		if (!result.ok) {
			if (result.status === 404) error(404, 'Not found');
			return fail(400, { paid: { problem: result.problem } });
		}
		setFlash(cookies, result.paid ? 'marked-paid' : 'marked-unpaid');
		redirect(303, '/#kept-aside');
	}
};
