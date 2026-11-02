import { addDays } from '#lib/domain/dates.ts';
import { expand, type ItemKind } from '#lib/domain/schedule.ts';
import { dateText, moneyText, ruleText } from '#lib/format.ts';
import { getDb } from '#lib/server/db/index.ts';
import { requireOwner } from '#lib/server/money/request.ts';
import { loadPlan } from '#lib/server/money/store.ts';
import type { PageServerLoad } from './$types';

/*
 * These screens are plain forms and links: no script is needed, so none is sent. They work the same
 * with JavaScript off, and nothing can reset a field that was typed in before a script arrived.
 */
export const csr = false;

const SECTIONS: { kind: ItemKind; title: string; add: string; empty: string }[] = [
	{ kind: 'income', title: 'Pay', add: 'Add pay', empty: 'No pay yet. Your number needs it.' },
	{ kind: 'bill', title: 'Bills', add: 'Add a bill', empty: 'No bills yet.' },
	{
		kind: 'loan-payment',
		title: 'Loan payments',
		add: 'Add a loan payment',
		empty: 'No loan payments.'
	}
];

export const load: PageServerLoad = ({ locals }) => {
	const ownerId = requireOwner(locals);
	const plan = loadPlan(getDb(), ownerId, new Date());
	const { today, items, overrides, settings } = plan;

	const rows = items.map((item) => {
		const next = expand([item], overrides, today, addDays(today, 800))[0];
		const ended = item.endsOn !== undefined && item.endsOn < today;
		return {
			id: item.id,
			kind: item.kind,
			name: item.name,
			amount: moneyText(item.amount, settings.currency),
			rule: ruleText(item.rule.kind === 'monthly' ? item.rule : { kind: item.rule.kind }),
			next: next ? dateText(next.date) : null,
			nextSort: next?.date ?? '9999-12-31',
			ended,
			endsOn: item.endsOn ? dateText(item.endsOn) : null,
			group: item.group ?? null,
			optional: item.optional === true
		};
	});

	return {
		sections: SECTIONS.map((s) => ({
			...s,
			items: rows
				.filter((r) => r.kind === s.kind)
				.sort((a, b) => Number(a.ended) - Number(b.ended) || a.nextSort.localeCompare(b.nextSort))
		}))
	};
};
