import { fail, redirect } from '@sveltejs/kit';
import type { ItemKind } from '#lib/domain/schedule.ts';
import { CURRENCIES, currencyName } from '#lib/format.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { Db } from '#lib/server/db/open.ts';
import { buildHome } from '#lib/server/money/home.ts';
import { readForm, requireOwner } from '#lib/server/money/request.ts';
import {
	SETUP_STEPS,
	addItem,
	getBalance,
	getOwner,
	listItems,
	ownerToday,
	saveRegion,
	setBalance,
	setSetupStep,
	updateItem,
	type SetupStep
} from '#lib/server/money/store.ts';
import {
	checkBalance,
	checkDate,
	checkNewItem,
	checkRegion,
	timeZones,
	type Problems
} from '#lib/server/money/validate.ts';
import type { Actions, PageServerLoad } from './$types';

/** The step before each one, for "Back". */
const PREVIOUS: Partial<Record<SetupStep, SetupStep>> = {
	region: 'welcome',
	pay: 'region',
	balance: 'pay',
	bills: 'balance',
	loans: 'bills',
	done: 'loans'
};

/** The step a bills or loans form belongs to decides what it adds: the browser cannot choose. */
const KIND_OF_STEP: Partial<Record<SetupStep, ItemKind>> = { bills: 'bill', loans: 'loan-payment' };

/** Whole units with exactly two decimals, from integer minor units, for refilling an input. */
function toDecimal(minorUnits: number): string {
	const sign = minorUnits < 0 ? '-' : '';
	const abs = Math.abs(minorUnits);
	return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export const load: PageServerLoad = ({ locals }) => {
	const ownerId = requireOwner(locals);
	const db = getDb();
	const settings = getOwner(db, ownerId);
	if (settings.setupStep === null) redirect(303, '/');

	const items = listItems(db, ownerId);
	const pay = items.find((i) => i.kind === 'income');
	const balance = getBalance(db, ownerId);

	return {
		step: settings.setupStep,
		stepNumber: SETUP_STEPS.indexOf(settings.setupStep) + 1,
		stepCount: SETUP_STEPS.length,
		today: ownerToday(settings, new Date()),
		currencies: CURRENCIES.map((code) => ({ code, name: currencyName(code) })),
		timeZones: timeZones(),
		saved: { currency: settings.currency, timeZone: settings.timeZone },
		pay:
			pay && pay.rule.kind === 'every14'
				? { amount: toDecimal(pay.amount), date: pay.rule.anchor }
				: null,
		balance: balance ? { amount: toDecimal(balance.amount), asOf: balance.asOf } : null,
		added: {
			bills: items.filter((i) => i.kind === 'bill').map((i) => i.name),
			loans: items.filter((i) => i.kind === 'loan-payment').map((i) => i.name)
		},
		// Only the last step shows the number, so only it pays for computing it.
		home: settings.setupStep === 'done' ? buildHome(db, ownerId, new Date()) : null
	};
};

/** Runs a step's action only if the owner is on that step; a stale form just goes back to it. */
function onStep(db: Db, ownerId: number, expected: SetupStep[]): SetupStep {
	const step = getOwner(db, ownerId).setupStep;
	if (step === null || !expected.includes(step)) redirect(303, '/setup');
	return step;
}

function advance(db: Db, ownerId: number, to: SetupStep | null): never {
	setSetupStep(db, ownerId, to);
	redirect(303, to === null ? '/' : '/setup');
}

/**
 * Adds the item on a bills or loans form. A form left completely empty adds nothing when it was
 * "That's all" (there is nothing to say), but is a mistake when it was "Add another".
 */
function saveItem(
	db: Db,
	ownerId: number,
	step: SetupStep,
	form: Record<string, unknown>,
	required: boolean
) {
	const kind = KIND_OF_STEP[step];
	if (!kind) redirect(303, '/setup');
	const blank = ['name', 'amount', 'date', 'day'].every((k) => !String(form[k] ?? '').trim());
	if (blank && !required) return null;

	const today = ownerToday(getOwner(db, ownerId), new Date());
	const checked = checkNewItem(kind, form, today);
	if (!checked.ok) {
		return fail(400, {
			step,
			values: {
				name: String(form.name ?? ''),
				amount: String(form.amount ?? ''),
				repeat: String(form.repeat ?? ''),
				date: String(form.date ?? ''),
				day: String(form.day ?? '')
			},
			problems: checked.problems
		});
	}
	addItem(db, ownerId, checked.value);
	return null;
}

export const actions: Actions = {
	start: ({ locals }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		onStep(db, ownerId, ['welcome']);
		advance(db, ownerId, 'region');
	},

	region: async ({ request, locals }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		onStep(db, ownerId, ['region']);
		const form = await readForm(request);
		const checked = checkRegion(form);
		if (!checked.ok) {
			return fail(400, {
				step: 'region',
				values: { currency: String(form.currency ?? ''), timeZone: String(form.timeZone ?? '') },
				problems: checked.problems
			});
		}
		saveRegion(db, ownerId, checked.value.currency, checked.value.timeZone);
		advance(db, ownerId, 'pay');
	},

	pay: async ({ request, locals }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		onStep(db, ownerId, ['pay']);
		const form = await readForm(request);
		const today = ownerToday(getOwner(db, ownerId), new Date());
		const date = checkDate(form.date, 'your last or next payday');
		const checked = checkNewItem(
			'income',
			{ name: 'Pay', amount: form.amount, repeat: 'every14', date: date.ok ? date.value : '' },
			today
		);
		if (!checked.ok || !date.ok) {
			const problems: Problems = checked.ok ? {} : { ...checked.problems };
			if (!date.ok) problems.date = date.problems.date;
			return fail(400, {
				step: 'pay',
				values: { amount: String(form.amount ?? ''), date: String(form.date ?? '') },
				problems
			});
		}
		// Going back and forward again edits the same pay; it never adds a second one.
		const existing = listItems(db, ownerId).find((i) => i.kind === 'income');
		if (existing) updateItem(db, ownerId, Number(existing.id), checked.value);
		else addItem(db, ownerId, checked.value);
		advance(db, ownerId, 'balance');
	},

	balance: async ({ request, locals }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		onStep(db, ownerId, ['balance']);
		const form = await readForm(request);
		const values = { amount: String(form.amount ?? ''), asOf: String(form.asOf ?? '') };
		const amount = checkBalance(form.amount);
		const asOf = checkDate(form.asOf, 'the day this balance was true');
		const problems: Problems = {};
		if (!amount.ok) problems.amount = amount.problems.amount;
		if (!asOf.ok) problems.asOf = asOf.problems.date;
		else if (asOf.value > ownerToday(getOwner(db, ownerId), new Date())) {
			problems.asOf = 'That day has not happened yet. Choose today or an earlier day.';
		}
		if (Object.keys(problems).length > 0 || !amount.ok || !asOf.ok) {
			return fail(400, { step: 'balance', values, problems });
		}
		setBalance(db, ownerId, amount.value, asOf.value);
		advance(db, ownerId, 'bills');
	},

	/** Saves the bill or loan payment on the form and shows a blank one. */
	add: async ({ request, locals }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const step = onStep(db, ownerId, ['bills', 'loans']);
		const failure = saveItem(db, ownerId, step, await readForm(request), true);
		if (failure) return failure;
		redirect(303, '/setup');
	},

	/** "That's all": saves what is on the form if anything is, then moves on. */
	finish: async ({ request, locals }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const step = onStep(db, ownerId, ['bills', 'loans']);
		const failure = saveItem(db, ownerId, step, await readForm(request), false);
		if (failure) return failure;
		advance(db, ownerId, step === 'bills' ? 'loans' : 'done');
	},

	back: ({ locals }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		const step = onStep(db, ownerId, Object.keys(PREVIOUS) as SetupStep[]);
		advance(db, ownerId, PREVIOUS[step] ?? 'welcome');
	},

	complete: ({ locals }) => {
		const ownerId = requireOwner(locals);
		const db = getDb();
		onStep(db, ownerId, ['done']);
		advance(db, ownerId, null);
	}
};
