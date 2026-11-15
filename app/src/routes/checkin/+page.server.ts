import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import {
	CheckInError,
	acknowledgeSpending,
	discardCheckIn,
	finishCheckIn,
	getOpenCheckIn,
	goBack,
	earlyLines,
	paymentLines,
	checkInContext,
	saveBalanceStep,
	saveLoans,
	savePay,
	savePayments,
	startCheckIn
} from '#lib/server/money/checkin.ts';
import {
	checkCurrentBalance,
	checkPayAnswer,
	checkPaymentAnswers
} from '#lib/server/money/checkinForm.ts';
import { checkLoanAnswers, loanField } from '#lib/server/money/loanForm.ts';
import { openLoanIds } from '#lib/server/money/loans.ts';
import { presentCheckIn } from '#lib/server/money/checkinView.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getOwner } from '#lib/server/money/store.ts';
import type { Actions, PageServerLoad } from './$types';

/*
 * Each step is one plain form that posts and redirects, so a step is saved before the next appears
 * and the whole check-in works with JavaScript off, or after a dropped connection.
 */
export const csr = false;

export const load: PageServerLoad = async ({ locals }) => {
	const ownerId = requireOwner(locals);
	const db = await getDb();
	if ((await getOwner(db, ownerId)).setupStep !== null) redirect(303, '/setup');
	const view = await presentCheckIn(db, ownerId, new Date());
	// No balance yet: the home screen asks for it.
	if (!view) redirect(303, '/');
	return { view };
};

/** The open check-in, or back to the start of the check-in when there is none. */
async function current(locals: App.Locals) {
	const ownerId = requireOwner(locals);
	const db = await getDb();
	const open = await getOpenCheckIn(db, ownerId);
	if (!open) redirect(303, '/checkin');
	return { ownerId, db, open };
}

/** A step posted out of turn (an old tab, a double tap) just shows the step the check-in is at. */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof CheckInError) redirect(303, '/checkin');
		throw error;
	}
}

export const actions: Actions = {
	start: async ({ locals }) => {
		const ownerId = requireOwner(locals);
		const db = await getDb();
		await guarded(() => startCheckIn(db, ownerId, new Date()));
		redirect(303, '/checkin');
	},

	pay: async ({ request, locals }) => {
		const { ownerId, db, open } = await current(locals);
		const form = await readForm(request);
		const answer = checkPayAnswer(form);
		if (!answer.ok) {
			return fail(400, {
				step: 'pay',
				values: { landed: String(form.landed ?? ''), amount: String(form.amount ?? '') },
				problems: answer.problems
			});
		}
		await guarded(() => savePay(db, ownerId, open.id, answer.value));
		redirect(303, '/checkin');
	},

	balance: async ({ request, locals }) => {
		const { ownerId, db, open } = await current(locals);
		const form = await readForm(request);
		const balance = checkCurrentBalance(form);
		if (!balance.ok) {
			return fail(400, {
				step: 'balance',
				values: { balance: String(form.balance ?? '') },
				problems: balance.problems
			});
		}
		await guarded(() => saveBalanceStep(db, ownerId, open.id, new Date(), balance.value));
		redirect(303, '/checkin');
	},

	spending: async ({ locals }) => {
		const { ownerId, db, open } = await current(locals);
		await guarded(() => acknowledgeSpending(db, ownerId, open.id));
		redirect(303, '/checkin');
	},

	payments: async ({ request, locals }) => {
		const { ownerId, db, open } = await current(locals);
		const form = await readForm(request);
		const now = new Date();
		const ctx = await checkInContext(db, ownerId, now);
		// A line paid early needs no answer; only "did not go out" on it is read, and then it is asked.
		const missed = new Set(
			ctx
				? earlyLines(ctx).flatMap((e) => (form[`status:${e.key}`] === 'missed' ? [e.key] : []))
				: []
		);
		const keys = ctx ? paymentLines(ctx, missed).map((l) => l.key) : [];
		const answers = checkPaymentAnswers(form, keys);
		if (!answers.ok) {
			const values: Record<string, string> = {};
			for (const key of keys) {
				const v = form[`status:${key}`];
				if (typeof v === 'string') values[key] = v;
			}
			return fail(400, { step: 'payments', values, problems: answers.problems });
		}
		await guarded(() => savePayments(db, ownerId, open.id, now, answers.value));
		redirect(303, '/checkin');
	},

	loans: async ({ request, locals }) => {
		const { ownerId, db, open } = await current(locals);
		const form = await readForm(request);
		const ids = await openLoanIds(db, ownerId);
		const answers = checkLoanAnswers(form, ids);
		if (!answers.ok) {
			const values: Record<string, string> = {};
			for (const id of ids) {
				const v = form[loanField(id)];
				if (typeof v === 'string') values[loanField(id)] = v;
			}
			return fail(400, { step: 'loans', values, problems: answers.problems });
		}
		await guarded(() => saveLoans(db, ownerId, open.id, new Date(), answers.value));
		redirect(303, '/checkin');
	},

	finish: async ({ locals }) => {
		const { ownerId, db, open } = await current(locals);
		await guarded(() => finishCheckIn(db, ownerId, open.id, new Date()));
		redirect(303, '/checkin/done');
	},

	back: async ({ locals }) => {
		const { ownerId, db, open } = await current(locals);
		await guarded(() => goBack(db, ownerId, open.id));
		redirect(303, '/checkin');
	},

	discard: async ({ locals }) => {
		const { ownerId, db, open } = await current(locals);
		await discardCheckIn(db, ownerId, open.id);
		redirect(303, '/');
	}
};
