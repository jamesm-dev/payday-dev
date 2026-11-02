import { redirect } from '@sveltejs/kit';
import { dateText, moneyText } from '#lib/format.ts';
import { getDb } from '#lib/server/db/index.ts';
import { listExpenseDays } from '#lib/server/money/expenses.ts';
import { requireOwner } from '#lib/server/money/request.ts';
import { getOwner } from '#lib/server/money/store.ts';
import type { PageServerLoad } from './$types';

// Plain text and links: no script needed, so none is sent.
export const csr = false;

export const load: PageServerLoad = ({ locals }) => {
	const ownerId = requireOwner(locals);
	const db = getDb();
	const owner = getOwner(db, ownerId);
	if (owner.setupStep !== null) redirect(303, '/setup');
	const money = (n: number) => moneyText(n, owner.currency);
	return {
		days: listExpenseDays(db, ownerId).map((day) => ({
			date: day.date as string,
			title: dateText(day.date),
			total: money(day.total),
			expenses: day.expenses.map((e) => ({
				id: e.id,
				name: e.note ?? 'Expense',
				amount: money(e.amount)
			}))
		}))
	};
};
