import { error, fail, redirect } from '@sveltejs/kit';
import { isLoanType } from '#lib/domain/loans.ts';
import { setFlash } from '#lib/server/flash.ts';
import { TYPE_LABELS, loanValues } from '#lib/loans/words.ts';
import { getDb } from '#lib/server/db/index.ts';
import { checkLoanFields } from '#lib/server/money/loanForm.ts';
import { LoanError, createLoan, listLoans } from '#lib/server/money/loans.ts';
import { linkableItems } from '#lib/server/money/loansView.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import { getOwner, loadPlan, ownerToday } from '#lib/server/money/store.ts';
import type { Actions, PageServerLoad } from './$types';

// Plain forms, like the schedule screens: no script, so nothing can reset a typed-in field.
export const csr = false;

const typeOf = (params: { type: string }) => {
	if (!isLoanType(params.type)) error(404, 'Not found');
	return params.type;
};

export const load: PageServerLoad = ({ params, locals, url }) => {
	const ownerId = requireOwner(locals);
	const type = typeOf(params);
	const db = getDb();
	const plan = loadPlan(db, ownerId, new Date());
	const taken = new Set(listLoans(db, ownerId).map((l) => l.scheduleItemId ?? ''));
	const raw = url.searchParams.get('item') ?? '';
	const items = linkableItems(plan, taken, null);
	const chosen = items.find((i) => i.id === raw);
	const picked = chosen ? plan.items.find((i) => i.id === chosen.id) : undefined;
	return {
		type,
		title: TYPE_LABELS[type],
		items,
		values: {
			name: picked?.name ?? '',
			lender: '',
			balance: '',
			// Most of these charge no interest; the form says so and the owner can clear it.
			rate: type === 'bnpl' || type === 'informal' ? '0' : '',
			item: chosen?.id ?? '',
			minPct: '',
			minFloor: ''
		}
	};
};

export const actions: Actions = {
	default: async ({ params, request, locals, cookies }) => {
		const ownerId = requireOwner(locals);
		const type = typeOf(params);
		const db = getDb();
		const form = await readForm(request);
		const values = loanValues(form);
		const checked = checkLoanFields(type, form);
		if (!checked.ok) return fail(400, { values, problems: checked.problems });
		const today = ownerToday(getOwner(db, ownerId), new Date());
		try {
			createLoan(db, ownerId, checked.value, today);
		} catch (e) {
			if (e instanceof LoanError) return fail(400, { values, problems: { item: e.message } });
			throw e;
		}
		setFlash(cookies, 'loan-added');
		redirect(303, '/loans');
	}
};
