import { error, fail, redirect } from '@sveltejs/kit';
import { setFlash } from '#lib/server/flash.ts';
import { dateText, moneyText } from '#lib/format.ts';
import { TYPE_LABELS, bpToPercent, loanValues } from '#lib/loans/words.ts';
import { getDb } from '#lib/server/db/index.ts';
import { checkLoanFields } from '#lib/server/money/loanForm.ts';
import { LoanError, closeLoan, getLoan, listLoans, updateLoan } from '#lib/server/money/loans.ts';
import { linkableItems } from '#lib/server/money/loansView.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getOwner, loadPlan, ownerToday } from '#lib/server/money/store.ts';
import type { Actions, PageServerLoad } from './$types';

export const csr = false;

/** Whole units with exactly two decimals, from integer minor units, for refilling an input. */
const toDecimal = (n: number) => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;

function loanId(params: { id: string }): number {
	if (!/^\d{1,9}$/.test(params.id)) error(404, 'Not found');
	return Number(params.id);
}

export const load: PageServerLoad = ({ params, locals }) => {
	const ownerId = requireOwner(locals);
	const db = getDb();
	const record = getLoan(db, ownerId, loanId(params));
	if (!record || record.closedAt !== null) error(404, 'Not found');
	const plan = loadPlan(db, ownerId, new Date());
	const taken = new Set(listLoans(db, ownerId).map((l) => l.scheduleItemId ?? ''));
	return {
		id: record.id,
		type: record.type,
		name: record.name,
		kind: TYPE_LABELS[record.type],
		balance: moneyText(record.balance, plan.settings.currency),
		balanceDate: dateText(record.balanceAsOf),
		items: linkableItems(plan, taken, record.scheduleItemId),
		values: {
			name: record.name,
			lender: record.lender ?? '',
			balance: toDecimal(record.balance),
			rate: record.rateBp === null ? '' : bpToPercent(record.rateBp),
			item: record.scheduleItemId ?? '',
			minPct: record.minPctBp === null ? '' : bpToPercent(record.minPctBp),
			minFloor: record.minFloor === null ? '' : toDecimal(record.minFloor)
		}
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const id = loanId(params);
		const record = getLoan(db, ownerId, id);
		if (!record || record.closedAt !== null) error(404, 'Not found');
		const form = await readForm(request);
		const values = loanValues(form);
		const checked = checkLoanFields(record.type, form);
		if (!checked.ok) return fail(400, { action: 'save', values, problems: checked.problems });
		const today = ownerToday(getOwner(db, ownerId), new Date());
		try {
			updateLoan(db, ownerId, id, checked.value, today);
		} catch (e) {
			if (e instanceof LoanError) {
				return fail(400, { action: 'save', values, problems: { item: e.message } });
			}
			throw e;
		}
		setFlash(cookies, 'changes-saved');
		redirect(303, '/loans');
	},

	/** Paid off: the loan leaves the list. It is kept, with its history. */
	close: ({ params, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const today = ownerToday(getOwner(db, ownerId), new Date());
		closeLoan(db, ownerId, loanId(params), today, new Date());
		setFlash(cookies, 'loan-paid-off');
		redirect(303, '/loans');
	}
};
