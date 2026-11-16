import { error, fail, redirect } from '@sveltejs/kit';
import { checkBalance, checkDate, checkExpense } from '#lib/server/money/validate.ts';
import { addExpense, addExpenseOnce } from '#lib/server/money/expenses.ts';
import { isClientId } from '#lib/checks.ts';
import { setFlash } from '#lib/server/flash.ts';
import { signUpOpen } from '#lib/server/auth/signUp.ts';
import { getDb } from '#lib/server/db/index.ts';
import { loggable } from '#lib/server/errors.ts';
import { log } from '#lib/server/log.ts';
import { buildHomeScreen } from '#lib/server/money/home.ts';
import { markPaidEarlyFromHome } from '#lib/server/money/homeMark.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getOwner, ownerToday, setBalance } from '#lib/server/money/store.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Rendered on the server, so the number is in the first HTML and shows before any script runs.
 * Signed out, the visitor gets the public home page. Its one question is whether sign-up still has
 * room (one count). If the database cannot answer, the page still shows and offers sign-up: the
 * sign-up page itself says "full" if it is.
 */
export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	if (locals.ownerId === null) {
		// One address, two pages: a shared cache must never hand the landing to a signed-in owner or
		// the number to a visitor. Signed in, hooks.server.ts adds `private, no-store`.
		setHeaders({ 'cache-control': 'no-store', vary: 'cookie' });
		let open = true;
		try {
			open = await signUpOpen(await getDb());
		} catch (error) {
			log({
				level: 'warn',
				msg: 'The product page could not count accounts; offering sign-up',
				error: loggable(error).message
			});
		}
		return { landing: true as const, signUpOpen: open };
	}
	const ownerId = requireOwner(locals);
	const db = await getDb();
	// Until setup is finished there is no number to show: carry on where setup left off.
	if ((await getOwner(db, ownerId)).setupStep !== null) redirect(303, '/setup');
	const { home, facts } = await buildHomeScreen(db, ownerId, new Date());
	// `facts` let the home screen's script keep the copy shown when there is no signal (ADR-0029);
	// the layout's `ownerTag` says whose it is. Sent only to this person (`private, no-store`).
	return { landing: false as const, home, facts };
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
		// Sent by the home screen's script, or from the phone's queue once the signal is back, with an
		// id the phone made (ADR-0029). The id makes a second send of the same expense save nothing.
		const clientId = form.clientId;
		if (clientId !== undefined && !isClientId(clientId)) {
			return fail(400, {
				expense: { values, problems: { amount: 'Something went wrong. Please try again.' } }
			});
		}
		const checked = checkExpense(form, ownerToday(await getOwner(db, ownerId), now));
		if (!checked.ok) return fail(400, { expense: { values, problems: checked.problems } });
		if (clientId === undefined) await addExpense(db, ownerId, checked.value, now);
		else await addExpenseOnce(db, ownerId, checked.value, clientId, now);
		setFlash(cookies, form.queued === 'yes' ? 'offline-sent' : 'expense-added');
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
