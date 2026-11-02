import { error, fail, redirect } from '@sveltejs/kit';
import { dateText, moneyText } from '#lib/format.ts';
import { getDb } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import {
	expenseCounts,
	getExpense,
	removeExpense,
	updateExpense
} from '#lib/server/money/expenses.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getOwner, ownerToday } from '#lib/server/money/store.ts';
import { checkExpense } from '#lib/server/money/validate.ts';
import type { Actions, PageServerLoad } from './$types';

export const csr = false;

/** Whole units with exactly two decimals, from integer minor units, for refilling an input. */
const toDecimal = (n: number) => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;

function expenseId(params: { id: string }): number {
	if (!/^\d{1,9}$/.test(params.id)) error(404, 'Not found');
	return Number(params.id);
}

export const load: PageServerLoad = ({ params, locals }) => {
	const ownerId = requireOwner(locals);
	const db = getDb();
	const record = getExpense(db, ownerId, expenseId(params));
	if (!record) error(404, 'Not found');
	const owner = getOwner(db, ownerId);
	return {
		id: record.id,
		name: record.note ?? 'Expense',
		summary: `${moneyText(record.amount, owner.currency)} on ${dateText(record.spentOn)}`,
		// A newer balance may already include it, and then it no longer lowers the number (ADR-0012).
		counting: expenseCounts(db, ownerId, record),
		today: ownerToday(owner, new Date()) as string,
		values: {
			amount: toDecimal(record.amount),
			note: record.note ?? '',
			date: record.spentOn as string
		}
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const id = expenseId(params);
		if (!getExpense(db, ownerId, id)) error(404, 'Not found');
		const form = await readForm(request);
		const values = {
			amount: String(form.amount ?? ''),
			note: String(form.note ?? ''),
			date: String(form.date ?? '')
		};
		const now = new Date();
		const checked = checkExpense(form, ownerToday(getOwner(db, ownerId), now));
		if (!checked.ok) return fail(400, { values, problems: checked.problems });
		updateExpense(db, ownerId, id, checked.value, now);
		setFlash(cookies, 'expense-changed');
		redirect(303, '/');
	},

	remove: ({ params, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		if (!removeExpense(getDb(), ownerId, expenseId(params))) error(404, 'Not found');
		setFlash(cookies, 'expense-removed');
		redirect(303, '/');
	}
};
