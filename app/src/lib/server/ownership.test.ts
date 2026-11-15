import { eq } from 'drizzle-orm';
import { isHttpError, isRedirect, type Cookies } from '@sveltejs/kit';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { listRoutes, PUBLIC_ROUTES } from '../../../tests/support/routes.ts';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb, ownerRow } from '#lib/server/db/testing.ts';
import {
	account,
	checkIn,
	expense,
	loan,
	owner,
	passkey,
	recoveryCode,
	session
} from '#lib/server/db/schema.ts';

/*
 * TSK-0a6680: the two-person sweep. Two people have full budgets in one database. Then, signed in as
 * person 2, every load, action and endpoint of every private route is run, fed person 1's ids (their
 * items, overrides, marks, expenses, check-ins, loans and payday dates). It asserts what matters,
 * not how a route refuses: person 1's data is exactly as it was, and nothing person 2 was given back
 * (data, a refusal's words, a download, a calendar file) carries person 1's names or amounts.
 *
 * A route that is added later and has no entry in the table below fails the meta-test at the end.
 */
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('$app/env', () => ({ dev: true }));
vi.mock('$app/env/private', () => ({ OWNER_SETUP_CODE: 'e2e-setup-code' }));
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => state.db }));

import { hashPassword } from './auth/password.ts';
import { addPasskey } from './auth/passkeys.ts';
import { insertRecoveryCodes } from './auth/recovery.ts';
import { createSession } from './auth/session.ts';
import { stepUps } from './auth/stepUp.ts';
import { cookieJar } from './auth/testEvent.ts';
import { sha256Hex } from './auth/tokens.ts';
import {
	acknowledgeSpending,
	checkInContext,
	discardCheckIn,
	finishCheckIn,
	getOpenCheckIn,
	listFinished,
	paymentLines,
	saveBalanceStep,
	saveLoans,
	savePay,
	savePayments,
	savedAnswers,
	startCheckIn
} from './money/checkin.ts';
import { addExpense } from './money/expenses.ts';
import { loanField } from './money/loanForm.ts';
import { backupText, exportBackup } from './money/fullBackup.ts';
import {
	applyCheckInBalances,
	checkInBalances,
	closeLoan,
	createLoan,
	discardCheckInBalances,
	listLoans,
	updateLoan
} from './money/loans.ts';
import {
	addItem,
	saveRegion,
	setBalance,
	setItemEnd,
	setItemLabels,
	setOverride,
	setPaidMark,
	setSetupStep
} from './money/store.ts';

const NOW = new Date('2026-11-16T12:00:00Z');
const FAST = { N: 2 ** 10, r: 8, p: 1 };
const PASSWORD_1 = 'person one passphrase here';
const PASSWORD_2 = 'person two passphrase here';

// ---- The two households ----

/** What makes a household recognisable: names and amounts no one else has. */
type Persona = {
	owner: number;
	pay: { name: string; amount: number; anchor: string };
	rent: { name: string; amount: number };
	utility: { name: string; amount: number };
	streaming: { name: string; amount: number; group: string };
	loanPayment: { name: string; amount: number };
	retired: { name: string; amount: number };
	expense: { note: string; amount: number };
	card: { name: string; lender: string; balance: number; confirmed: number };
	informal: { name: string; lender: string; balance: number; confirmed: number };
	balance: number;
	atCheckIn: number;
};

const PERSON_1: Persona = {
	owner: 1,
	pay: { name: 'Quillon Industries salary', amount: 987654, anchor: '2026-11-06' },
	rent: { name: 'Zorbax Landlord rent', amount: 413579 },
	utility: { name: 'Vermilion Power Co', amount: 271828 },
	streaming: { name: 'Quasar Streaming', amount: 161803, group: 'Nimbus Group' },
	loanPayment: { name: 'Zircon Card minimum', amount: 177245 },
	retired: { name: 'Obsidian Gym', amount: 141421 },
	expense: { note: 'Xylophone lessons', amount: 314159 },
	card: { name: 'Zircon Card', lender: 'Vantablack Bank', balance: 1414213, confirmed: 1383719 },
	informal: {
		name: 'Borrowed from Uncle Wolfram',
		lender: 'Wolfram',
		balance: 2236068,
		confirmed: 2200001
	},
	balance: 7320508,
	atCheckIn: 6180339
};
const PERSON_2: Persona = {
	owner: 2,
	pay: { name: 'Marigold Bakery wages', amount: 123457, anchor: '2026-11-13' },
	rent: { name: 'Juniper Housing rent', amount: 98765 },
	utility: { name: 'Saffron Water Works', amount: 54321 },
	streaming: { name: 'Pebble Music', amount: 31415, group: 'Meadow Group' },
	loanPayment: { name: 'Tangerine Credit minimum', amount: 23571 },
	retired: { name: 'Willow Pottery Club', amount: 19283 },
	expense: { note: 'Dandelion bakery run', amount: 27182 },
	card: { name: 'Tangerine Credit', lender: 'Meadow Bank', balance: 451783, confirmed: 442210 },
	informal: {
		name: 'Borrowed from Auntie Hazel',
		lender: 'Hazel',
		balance: 330044,
		confirmed: 321009
	},
	balance: 1020304,
	atCheckIn: 905060
};

type Ids = {
	pay: number;
	rent: number;
	utility: number;
	streaming: number;
	loanPayment: number;
	retired: number;
	expense: number;
	card: number;
	informal: number;
	finishedCheckIn: number;
	openCheckIn: number;
	passkey: string;
};

/** The strings that would give a household away: its names, and every way its amounts get written. */
function tokensOf(p: Persona): string[] {
	const names = [
		p.pay.name,
		p.rent.name,
		p.utility.name,
		p.streaming.name,
		p.streaming.group,
		p.loanPayment.name,
		p.retired.name,
		p.expense.note,
		p.card.name,
		p.card.lender,
		p.informal.name,
		p.informal.lender
	];
	const amounts = [
		p.pay.amount,
		p.rent.amount,
		p.utility.amount,
		p.streaming.amount,
		p.loanPayment.amount,
		p.retired.amount,
		p.expense.amount,
		p.card.balance,
		p.card.confirmed,
		p.informal.balance,
		p.informal.confirmed,
		p.balance,
		p.atCheckIn
	].flatMap((m) => {
		const plain = (m / 100).toFixed(2);
		const [whole, cents] = plain.split('.');
		const grouped = `${Number(whole).toLocaleString('en-US')}.${cents}`;
		return [String(m), plain, grouped];
	});
	return [...names, ...amounts];
}

async function buildHousehold(db: Db, p: Persona): Promise<Ids> {
	const id = p.owner;
	await saveRegion(db, id, 'USD', 'UTC');
	const start = d('2026-09-01');
	const add = async (
		kind: 'income' | 'bill' | 'loan-payment',
		x: { name: string; amount: number },
		rule: Parameters<typeof addItem>[2]['rule'],
		extra: { endsOn?: ReturnType<typeof d>; main?: boolean } = {}
	) =>
		Number(
			(
				await addItem(
					db,
					id,
					{
						kind,
						name: x.name,
						amount: minor(x.amount),
						rule,
						startsOn: start,
						endsOn: extra.endsOn
					},
					{ main: extra.main }
				)
			).id
		);
	const pay = await add(
		'income',
		p.pay,
		{ kind: 'every14', anchor: d(p.pay.anchor) },
		{ main: true }
	);
	const rent = await add('bill', p.rent, { kind: 'monthly', day: 25 });
	const utility = await add('bill', p.utility, { kind: 'monthly', day: 10 });
	const streaming = await add('bill', p.streaming, { kind: 'monthly', day: 28 });
	await setItemLabels(db, id, streaming, { group: p.streaming.group, optional: true });
	const loanPayment = await add('loan-payment', p.loanPayment, { kind: 'monthly', day: 12 });
	const retired = await add(
		'bill',
		p.retired,
		{ kind: 'monthly', day: 3 },
		{ endsOn: d('2026-10-31') }
	);

	// An override that changes a payment, one that skips it, and a bill marked paid early.
	await setOverride(db, id, rent, {
		action: 'change',
		originalDate: d('2026-12-25'),
		date: d('2026-12-23'),
		amount: minor(p.rent.amount + 1)
	});
	await setOverride(db, id, rent, { action: 'skip', originalDate: d('2027-01-25') });
	await setPaidMark(db, id, rent, d('2026-11-25'), true, NOW);

	const spent = await addExpense(
		db,
		id,
		{ amount: minor(p.expense.amount), note: p.expense.note, spentOn: d('2026-11-14') },
		NOW
	);

	await setBalance(db, id, minor(p.balance), d('2026-10-30'), new Date('2026-10-30T09:00:00Z'));
	const today = d('2026-10-30');
	const card = await createLoan(
		db,
		id,
		{
			type: 'credit-card',
			name: p.card.name,
			lender: p.card.lender,
			balance: minor(p.card.balance),
			rateBp: 2299,
			scheduleItemId: loanPayment,
			minPctBp: 200,
			minFloor: minor(2500)
		},
		today
	);
	const informal = await createLoan(
		db,
		id,
		{
			type: 'informal',
			name: p.informal.name,
			lender: p.informal.lender,
			balance: minor(p.informal.balance),
			rateBp: 0,
			scheduleItemId: null,
			minPctBp: null,
			minFloor: null
		},
		today
	);

	// One finished check-in (with its payment answers and loan balances), and one open.
	const first = await startCheckIn(db, id, NOW);
	await savePay(db, id, first.id, { landed: true, amount: minor(p.pay.amount) });
	await saveBalanceStep(db, id, first.id, NOW, minor(p.atCheckIn));
	await acknowledgeSpending(db, id, first.id);
	const ctx = (await checkInContext(db, id, NOW))!;
	await savePayments(db, id, first.id, NOW, new Map(paymentLines(ctx).map((l) => [l.key, 'paid'])));
	await saveLoans(
		db,
		id,
		first.id,
		NOW,
		new Map([
			[Number(card.id), minor(p.card.confirmed)],
			[Number(informal.id), minor(p.informal.confirmed)]
		])
	);
	await finishCheckIn(db, id, first.id, NOW);
	const open = await startCheckIn(db, id, NOW);
	await savePay(db, id, open.id, { landed: true, amount: minor(p.pay.amount) });

	await setSetupStep(db, id, null);

	// How they sign in: a password, two sessions, a passkey, recovery codes.
	await db
		.update(owner)
		.set({ passwordHash: await hashPassword(id === 1 ? PASSWORD_1 : PASSWORD_2, FAST) })
		.where(eq(owner.id, id));
	await createSession(db, id, 'another device', NOW);
	const credential = `credential-of-person-${id}`;
	await addPasskey(
		db,
		id,
		{ id: credential, publicKey: new Uint8Array([1, 2, 3]), counter: 7, nickname: `Phone ${id}` },
		NOW
	);
	await insertRecoveryCodes(db, id, NOW);

	return {
		pay,
		rent,
		utility,
		streaming,
		loanPayment,
		retired,
		expense: spent.id,
		card: Number(card.id),
		informal: Number(informal.id),
		finishedCheckIn: first.id,
		openCheckIn: open.id,
		passkey: credential
	};
}

// ---- Running a route as someone ----

type Who = { ownerId: number; cookies: Cookies; sessionId: string; address: string };

async function signedInAs(db: Db, ownerId: number, address: string): Promise<Who> {
	const { token } = await createSession(db, ownerId, 'the sweep', NOW);
	const { cookies } = cookieJar({ session: token });
	const sessionId = sha256Hex(token);
	// A fresh confirmation, so the routes that ask for one run past that door too.
	await stepUps.markAssertion(db, sessionId, NOW.getTime());
	return { ownerId, cookies, sessionId, address };
}

type Call = {
	params?: Record<string, string>;
	form?: Record<string, string | File>;
	json?: unknown;
	path: string;
	headers?: Record<string, string>;
};

/** A request event as SvelteKit would hand it to a load, an action or an endpoint. */
function eventFor(who: Who, call: Call) {
	const url = new URL(`http://localhost${call.path}`);
	let body: BodyInit | undefined;
	const headers: Record<string, string> = { 'user-agent': 'vitest', ...call.headers };
	if (call.form) {
		const data = new FormData();
		for (const [k, v] of Object.entries(call.form)) data.set(k, v);
		body = data;
	} else if (call.json !== undefined) {
		body = JSON.stringify(call.json);
		headers['content-type'] = 'application/json';
	}
	return {
		params: call.params ?? {},
		locals: { ownerId: who.ownerId },
		request: new Request(url, { method: body === undefined ? 'GET' : 'POST', body, headers }),
		cookies: who.cookies,
		url,
		route: { id: call.path },
		setHeaders: () => {},
		getClientAddress: () => who.address,
		isDataRequest: false,
		isSubRequest: false,
		fetch: globalThis.fetch,
		platform: undefined
	};
}

/** What came back, as text to search: data, a refusal, a redirect's address, a download's bytes. */
async function settle(run: () => unknown): Promise<string> {
	try {
		return await describeResult(await run());
	} catch (error) {
		if (isRedirect(error)) return `redirect ${error.status} ${error.location}`;
		if (isHttpError(error)) return `error ${error.status} ${JSON.stringify(error.body)}`;
		// Anything else is a crash a person would see as a 500: not allowed.
		throw error;
	}
}

async function describeResult(out: unknown): Promise<string> {
	if (out instanceof Response) {
		const bytes = new Uint8Array(await out.arrayBuffer());
		// Latin-1 keeps every byte, so names are found in a PDF or a stored Word document too.
		const head = `response ${out.status} ${JSON.stringify([...out.headers])}`;
		return `${head}\n${Buffer.from(bytes).toString('latin1')}`;
	}
	return JSON.stringify(out) ?? 'undefined';
}

// ---- The route modules ----

type RouteModule = Record<string, unknown> & {
	load?: (event: never) => unknown;
	actions?: Record<string, (event: never) => unknown>;
};
const modules = import.meta.glob<RouteModule>('../../routes/**/+*server.ts');
const VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'fallback'];

const routeIdOf = (file: string) =>
	`/${file.replace('../../routes/', '').replace(/\/?\+[^/]+$/, '')}`
		.replace(/\/\([^/]+\)/g, '')
		.replace(/\/$/, '') || '/';
const kindOf = (file: string) => file.slice(file.lastIndexOf('/') + 1);

/** Not behind the sign-in: the sweep runs signed in, so these are not its business. */
const isPublic = (id: string) =>
	PUBLIC_ROUTES.includes(id) || id === '/management' || id.startsWith('/management/');

const load = async (file: string) => (await modules[`../../routes/${file}`]!()) as RouteModule;

/** Every thing the sweep must run: a load, an action, an endpoint's method. */
async function requiredEntries(): Promise<string[]> {
	const keys: string[] = [];
	for (const file of Object.keys(modules)) {
		const id = routeIdOf(file);
		if (isPublic(id)) continue;
		const mod = (await modules[file]!()) as RouteModule;
		const kind = kindOf(file);
		if (kind === '+layout.server.ts' && mod.load) keys.push(`${id} layout load`);
		if (kind === '+page.server.ts' && mod.load) keys.push(`${id} page load`);
		for (const name of Object.keys(mod.actions ?? {})) keys.push(`${id} action ${name}`);
		if (kind === '+server.ts') for (const verb of VERBS) if (mod[verb]) keys.push(`${id} ${verb}`);
	}
	return keys.sort();
}

// ---- The entries ----

type Sweep = { db: Db; me: Who; p1: Ids; p2: Ids; mine: Persona };
type Entry = (s: Sweep) => Promise<string>;

/** Runs a route's load as person 2 (the file is `page` or `layout`, relative to the route folder). */
const loadOf =
	(file: string, call: (s: Sweep) => Call): Entry =>
	async (s) => {
		const mod = await load(file);
		return settle(() => mod.load!(eventFor(s.me, call(s)) as never));
	};
const actionOf =
	(file: string, name: string, call: (s: Sweep) => Call): Entry =>
	async (s) => {
		const mod = await load(file);
		return settle(() => mod.actions![name]!(eventFor(s.me, call(s)) as never));
	};
const verbOf =
	(file: string, verb: string, call: (s: Sweep) => Call): Entry =>
	async (s) => {
		const mod = await load(file);
		return settle(() => (mod[verb] as (e: never) => unknown)(eventFor(s.me, call(s)) as never));
	};

const dateOf = (iso: string) => iso;
/** Person 1's next payday dates, the ones a paycheck list is made for. */
const P1_PAYDAYS = ['2026-11-20', '2026-12-04', '2026-12-18'];

const monthly = (day: number) => ({ repeat: 'monthly', day: String(day) });
const itemForm = (name: string) => ({ name, amount: '1.23', ...monthly(5) });
const loanForm = (name: string) => ({
	name,
	lender: 'Hijack Bank',
	balance: '1.00',
	rate: '1',
	item: '',
	minPct: '',
	minFloor: ''
});

/** The entries run in this order: what ends sessions or erases the budget comes last. */
const ENTRIES: Record<string, Entry> = {
	// The home screen and the layout around everything.
	'/ layout load': loadOf('+layout.server.ts', () => ({ path: '/' })),
	'/ page load': loadOf('+page.server.ts', () => ({ path: '/' })),
	'/ action balance': actionOf('+page.server.ts', 'balance', () => ({
		path: '/',
		form: { amount: '12.34', asOf: '2026-11-16' }
	})),
	'/ action expense': actionOf('+page.server.ts', 'expense', () => ({
		path: '/',
		form: { amount: '1.00', note: 'sweep', date: '2026-11-16' }
	})),
	'/ action paid': actionOf('+page.server.ts', 'paid', (s) => ({
		path: '/',
		form: { itemId: String(s.p1.rent), originalDate: '2026-11-25', paid: 'no' }
	})),

	'/calendar.ics GET': verbOf('calendar.ics/+server.ts', 'GET', () => ({ path: '/calendar.ics' })),

	'/checkin page load': loadOf('checkin/+page.server.ts', () => ({ path: '/checkin' })),
	'/checkin action start': actionOf('checkin/+page.server.ts', 'start', () => ({
		path: '/checkin?/start',
		form: {}
	})),
	'/checkin action pay': actionOf('checkin/+page.server.ts', 'pay', (s) => ({
		path: '/checkin?/pay',
		form: { landed: 'yes', amount: String(s.p1.finishedCheckIn) }
	})),
	'/checkin action balance': actionOf('checkin/+page.server.ts', 'balance', () => ({
		path: '/checkin?/balance',
		form: { balance: '5.00' }
	})),
	'/checkin action spending': actionOf('checkin/+page.server.ts', 'spending', () => ({
		path: '/checkin?/spending',
		form: {}
	})),
	'/checkin action payments': actionOf('checkin/+page.server.ts', 'payments', (s) => ({
		path: '/checkin?/payments',
		form: {
			[`status:${s.p1.utility}|2026-11-10`]: 'paid',
			[`status:${s.p1.loanPayment}|2026-11-12`]: 'missed'
		}
	})),
	'/checkin action loans': actionOf('checkin/+page.server.ts', 'loans', (s) => ({
		path: '/checkin?/loans',
		form: { [loanField(s.p1.card)]: '1.00', [loanField(s.p1.informal)]: '2.00' }
	})),
	'/checkin action finish': actionOf('checkin/+page.server.ts', 'finish', () => ({
		path: '/checkin?/finish',
		form: {}
	})),
	'/checkin action back': actionOf('checkin/+page.server.ts', 'back', () => ({
		path: '/checkin?/back',
		form: {}
	})),
	'/checkin action discard': actionOf('checkin/+page.server.ts', 'discard', () => ({
		path: '/checkin?/discard',
		form: {}
	})),
	'/checkin/done page load': loadOf('checkin/done/+page.server.ts', () => ({
		path: '/checkin/done'
	})),
	'/checkin/history page load': loadOf('checkin/history/+page.server.ts', () => ({
		path: '/checkin/history'
	})),

	'/expenses page load': loadOf('expenses/+page.server.ts', () => ({ path: '/expenses' })),
	'/expenses/[id] page load': loadOf('expenses/[id]/+page.server.ts', (s) => ({
		path: `/expenses/${s.p1.expense}`,
		params: { id: String(s.p1.expense) }
	})),
	'/expenses/[id] action save': actionOf('expenses/[id]/+page.server.ts', 'save', (s) => ({
		path: `/expenses/${s.p1.expense}?/save`,
		params: { id: String(s.p1.expense) },
		form: { amount: '1.00', note: 'Hijack', date: '2026-11-16' }
	})),
	'/expenses/[id] action remove': actionOf('expenses/[id]/+page.server.ts', 'remove', (s) => ({
		path: `/expenses/${s.p1.expense}?/remove`,
		params: { id: String(s.p1.expense) },
		form: {}
	})),

	'/loans page load': loadOf('loans/+page.server.ts', () => ({ path: '/loans' })),
	'/loans/[id] page load': loadOf('loans/[id]/+page.server.ts', (s) => ({
		path: `/loans/${s.p1.card}`,
		params: { id: String(s.p1.card) }
	})),
	'/loans/[id] action save': actionOf('loans/[id]/+page.server.ts', 'save', (s) => ({
		path: `/loans/${s.p1.card}?/save`,
		params: { id: String(s.p1.card) },
		form: { ...loanForm('Hijack'), minPct: '2', minFloor: '25.00' }
	})),
	'/loans/[id] action close': actionOf('loans/[id]/+page.server.ts', 'close', (s) => ({
		path: `/loans/${s.p1.informal}?/close`,
		params: { id: String(s.p1.informal) },
		form: {}
	})),
	'/loans/new page load': loadOf('loans/new/+page.server.ts', (s) => ({
		path: `/loans/new?item=${s.p1.loanPayment}`
	})),
	'/loans/new/[type] page load': loadOf('loans/new/[type]/+page.server.ts', (s) => ({
		path: `/loans/new/credit-card?item=${s.p1.loanPayment}`,
		params: { type: 'credit-card' }
	})),
	// Tries to claim person 1's loan payment for a loan of their own.
	'/loans/new/[type] action default': actionOf(
		'loans/new/[type]/+page.server.ts',
		'default',
		(s) => ({
			path: '/loans/new/credit-card',
			params: { type: 'credit-card' },
			form: {
				...loanForm('Hijack card'),
				item: String(s.p1.loanPayment),
				minPct: '2',
				minFloor: '25.00'
			}
		})
	),

	'/plan page load': loadOf('plan/+page.server.ts', () => ({ path: '/plan' })),
	'/plan action paid': actionOf('plan/+page.server.ts', 'paid', (s) => ({
		path: '/plan?/paid',
		form: {
			itemId: String(s.p1.rent),
			originalDate: '2026-11-25',
			paid: 'no',
			payday: '2026-11-27'
		}
	})),
	'/plan/[payday]/list.[format] GET': async (s) => {
		const mod = await load('plan/[payday]/list.[format]/+server.ts');
		const out: string[] = [];
		for (const payday of [...P1_PAYDAYS, '2026-11-27']) {
			for (const format of ['txt', 'pdf', 'docx']) {
				out.push(
					await settle(() =>
						(mod.GET as (e: never) => unknown)(
							eventFor(s.me, {
								path: `/plan/${payday}/list.${format}`,
								params: { payday: dateOf(payday), format }
							}) as never
						)
					)
				);
			}
		}
		return out.join('\n');
	},

	'/schedule page load': loadOf('schedule/+page.server.ts', () => ({ path: '/schedule' })),
	'/schedule/[id] page load': loadOf('schedule/[id]/+page.server.ts', (s) => ({
		path: `/schedule/${s.p1.rent}`,
		params: { id: String(s.p1.rent) }
	})),
	'/schedule/[id] action save': actionOf('schedule/[id]/+page.server.ts', 'save', (s) => ({
		path: `/schedule/${s.p1.rent}?/save`,
		params: { id: String(s.p1.rent) },
		form: { ...itemForm('Hijack'), group: 'Hijack', optional: 'yes' }
	})),
	'/schedule/[id] action end': actionOf('schedule/[id]/+page.server.ts', 'end', (s) => ({
		path: `/schedule/${s.p1.rent}?/end`,
		params: { id: String(s.p1.rent) },
		form: { endsOn: '2026-12-01' }
	})),
	'/schedule/[id] action resume': actionOf('schedule/[id]/+page.server.ts', 'resume', (s) => ({
		path: `/schedule/${s.p1.retired}?/resume`,
		params: { id: String(s.p1.retired) },
		form: {}
	})),
	'/schedule/[id] action skip': actionOf('schedule/[id]/+page.server.ts', 'skip', (s) => ({
		path: `/schedule/${s.p1.rent}?/skip`,
		params: { id: String(s.p1.rent) },
		form: { originalDate: '2026-11-25' }
	})),
	'/schedule/[id] action change': actionOf('schedule/[id]/+page.server.ts', 'change', (s) => ({
		path: `/schedule/${s.p1.rent}?/change`,
		params: { id: String(s.p1.rent) },
		form: { originalDate: '2026-12-25', date: '2026-12-24', amount: '2.00' }
	})),
	'/schedule/[id] action undo': actionOf('schedule/[id]/+page.server.ts', 'undo', (s) => ({
		path: `/schedule/${s.p1.rent}?/undo`,
		params: { id: String(s.p1.rent) },
		form: { originalDate: '2026-12-25' }
	})),
	'/schedule/new/[kind] page load': loadOf('schedule/new/[kind]/+page.server.ts', () => ({
		path: '/schedule/new/bill',
		params: { kind: 'bill' }
	})),
	'/schedule/new/[kind] action default': actionOf(
		'schedule/new/[kind]/+page.server.ts',
		'default',
		() => ({
			path: '/schedule/new/bill',
			params: { kind: 'bill' },
			form: { ...itemForm('A bill of mine'), group: '', optional: '' }
		})
	),

	'/settings page load': loadOf('settings/+page.server.ts', () => ({ path: '/settings' })),
	'/settings/backup page load': loadOf('settings/backup/+page.server.ts', () => ({
		path: '/settings/backup'
	})),
	'/settings/backup/download GET': verbOf('settings/backup/download/+server.ts', 'GET', () => ({
		path: '/settings/backup/download',
		headers: { 'sec-fetch-site': 'same-origin' }
	})),
	// Person 2 restoring their own backup: it must replace nothing of person 1's.
	'/settings/backup action restore': async (s) => {
		const mod = await load('settings/backup/+page.server.ts');
		const text = backupText(await exportBackup(s.db, s.me.ownerId, NOW));
		return settle(() =>
			mod.actions!.restore!(
				eventFor(s.me, {
					path: '/settings/backup?/restore',
					form: { confirm: 'DELETE', file: new File([text], 'backup.json') }
				}) as never
			)
		);
	},
	'/settings/pay page load': loadOf('settings/pay/+page.server.ts', () => ({
		path: '/settings/pay'
	})),
	'/settings/pay action change': actionOf('settings/pay/+page.server.ts', 'change', () => ({
		path: '/settings/pay?/change',
		form: { repeat: 'monthly', day: '5' }
	})),
	'/settings/reminders page load': loadOf('settings/reminders/+page.server.ts', () => ({
		path: '/settings/reminders'
	})),
	'/settings/reminders action time': actionOf('settings/reminders/+page.server.ts', 'time', () => ({
		path: '/settings/reminders?/time',
		form: { time: '08:30' }
	})),
	'/settings/security page load': loadOf('settings/security/+page.server.ts', () => ({
		path: '/settings/security'
	})),
	'/settings/security action rename': actionOf(
		'settings/security/+page.server.ts',
		'rename',
		(s) => ({
			path: '/settings/security?/rename',
			form: { id: s.p1.passkey, nickname: 'Hijacked' }
		})
	),
	'/settings/security action confirm': actionOf(
		'settings/security/+page.server.ts',
		'confirm',
		() => ({
			path: '/settings/security?/confirm',
			form: { password: PASSWORD_2 }
		})
	),
	'/settings/security action remove': actionOf(
		'settings/security/+page.server.ts',
		'remove',
		(s) => ({
			path: '/settings/security?/remove',
			form: { id: s.p1.passkey }
		})
	),
	'/settings/security action regenerate': actionOf(
		'settings/security/+page.server.ts',
		'regenerate',
		() => ({ path: '/settings/security?/regenerate', form: {} })
	),
	'/settings/security/password page load': loadOf(
		'settings/security/password/+page.server.ts',
		() => ({ path: '/settings/security/password' })
	),
	'/settings/security/password action change': actionOf(
		'settings/security/password/+page.server.ts',
		'change',
		() => ({
			path: '/settings/security/password?/change',
			form: {
				current: '',
				password: 'a different passphrase for two',
				again: 'a different passphrase for two'
			}
		})
	),
	'/settings/security/step-up/options POST': verbOf(
		'settings/security/step-up/options/+server.ts',
		'POST',
		() => ({ path: '/settings/security/step-up/options', json: {} })
	),
	'/settings/security/step-up/verify POST': verbOf(
		'settings/security/step-up/verify/+server.ts',
		'POST',
		(s) => ({
			path: '/settings/security/step-up/verify',
			json: { challengeId: 'unknown', response: { id: s.p1.passkey } }
		})
	),

	// Start over, then the first-run setup that follows it.
	'/settings/security action erase': actionOf('settings/security/+page.server.ts', 'erase', () => ({
		path: '/settings/security?/erase',
		form: { confirm: 'DELETE' }
	})),
	'/setup page load': loadOf('setup/+page.server.ts', () => ({ path: '/setup' })),
	'/setup action start': actionOf('setup/+page.server.ts', 'start', () => ({
		path: '/setup?/start',
		form: {}
	})),
	'/setup action region': actionOf('setup/+page.server.ts', 'region', () => ({
		path: '/setup?/region',
		form: { currency: 'USD', timeZone: 'UTC' }
	})),
	'/setup action pay': actionOf('setup/+page.server.ts', 'pay', () => ({
		path: '/setup?/pay',
		form: { amount: '100.00', repeat: 'monthly', day: '5' }
	})),
	'/setup action balance': actionOf('setup/+page.server.ts', 'balance', () => ({
		path: '/setup?/balance',
		form: { amount: '50.00', asOf: '2026-11-16' }
	})),
	'/setup action add': actionOf('setup/+page.server.ts', 'add', () => ({
		path: '/setup?/add',
		form: { name: 'Setup bill', amount: '9.00', repeat: 'monthly', day: '9' }
	})),
	'/setup action finish': actionOf('setup/+page.server.ts', 'finish', () => ({
		path: '/setup?/finish',
		form: { name: '', amount: '', repeat: '', date: '', day: '' }
	})),
	'/setup action back': actionOf('setup/+page.server.ts', 'back', () => ({
		path: '/setup?/back',
		form: {}
	})),
	'/setup action complete': actionOf('setup/+page.server.ts', 'complete', () => ({
		path: '/setup?/complete',
		form: {}
	})),

	// Last: they end the sessions the rest of the sweep signs in with.
	'/settings/security action signoutEverywhere': actionOf(
		'settings/security/+page.server.ts',
		'signoutEverywhere',
		() => ({ path: '/settings/security?/signoutEverywhere', form: {} })
	),
	'/settings/security action signout': actionOf(
		'settings/security/+page.server.ts',
		'signout',
		() => ({
			path: '/settings/security?/signout',
			form: {}
		})
	)
};

// ---- The checks ----

let db: Db;
let p1: Ids;
let p2: Ids;
let before: string;

/** Person 1's whole budget, plus the rows that are how they sign in. Nothing person 2 does may change it. */
async function personOne(): Promise<string> {
	const doc = await exportBackup(db, 1, NOW);
	const rows = {
		owner: await db.select().from(owner).where(eq(owner.id, 1)),
		account: await db.select().from(account).where(eq(account.ownerId, 1)),
		expenses: await db.select().from(expense).where(eq(expense.ownerId, 1)),
		checkIns: await db.select().from(checkIn).where(eq(checkIn.ownerId, 1)),
		loans: await db.select().from(loan).where(eq(loan.ownerId, 1)),
		passkeys: await db.select().from(passkey).where(eq(passkey.ownerId, 1)),
		recoveryCodes: await db.select().from(recoveryCode).where(eq(recoveryCode.ownerId, 1)),
		sessions: await db.select().from(session).where(eq(session.ownerId, 1))
	};
	return JSON.stringify({ backup: backupText({ ...doc, exportedAt: '' }), rows });
}

const leaks = (text: string, tokens: string[]) =>
	tokens.filter((t) => text.toLowerCase().includes(t.toLowerCase()));

beforeAll(async () => {
	vi.useFakeTimers({ toFake: ['Date'], now: NOW });
	db = await freshDb();
	state.db = db;
	// Person 1 registered first and has no email; person 2 is a later sign-up.
	await db.insert(owner).values(ownerRow(1));
	await db.insert(owner).values(ownerRow(2));
	p1 = await buildHousehold(db, PERSON_1);
	p2 = await buildHousehold(db, PERSON_2);
	before = await personOne();
}, 120_000);

afterAll(() => {
	vi.useRealTimers();
});

describe('TSK-0a6680 the households are built the way the sweep needs them', () => {
	it('gives each person their own ids, a finished and an open check-in, and answers', async () => {
		expect(new Set([p1.rent, p2.rent]).size).toBe(2);
		expect((await listFinished(db, 1)).map((c) => c.id)).toEqual([p1.finishedCheckIn]);
		expect((await getOpenCheckIn(db, 2))?.id).toBe(p2.openCheckIn);
		expect((await checkInBalances(db, 1, p1.finishedCheckIn)).size).toBe(2);
		expect((await savedAnswers(db, 1, p1.finishedCheckIn)).size).toBeGreaterThan(0);
		expect(await listLoans(db, 2)).toHaveLength(2);
	});
});

describe('TSK-0a6680 the sweep can see a household: person 2 sees their own, and only theirs', () => {
	it('shows person 2 their own names and amounts, in pages and in every download', async () => {
		const me = await signedInAs(db, 2, '198.51.100.20');
		const s: Sweep = { db, me, p1, p2, mine: PERSON_2 };
		const own = tokensOf(PERSON_2);
		const theirs = tokensOf(PERSON_1);
		const seen = [
			await ENTRIES['/schedule page load']!(s),
			await ENTRIES['/loans page load']!(s),
			await ENTRIES['/expenses page load']!(s),
			await ENTRIES['/checkin/history page load']!(s),
			await ENTRIES['/calendar.ics GET']!(s),
			await ENTRIES['/settings/backup/download GET']!(s)
		];
		// What each page shows of person 2's own household.
		expect(seen[0]).toContain(PERSON_2.rent.name);
		expect(seen[1]).toContain(PERSON_2.card.name);
		expect(seen[2]).toContain(PERSON_2.expense.note);
		expect(seen[5]).toContain(PERSON_2.pay.name);
		expect(leaks(seen.join('\n'), theirs)).toEqual([]);
		expect(own.length).toBeGreaterThan(20);

		// Their own paycheck list, in all three formats, names their own bills.
		const mod = await load('plan/[payday]/list.[format]/+server.ts');
		for (const format of ['txt', 'pdf', 'docx']) {
			const text = await settle(() =>
				(mod.GET as (e: never) => unknown)(
					eventFor(me, {
						path: `/plan/2026-11-27/list.${format}`,
						params: { payday: '2026-11-27', format }
					}) as never
				)
			);
			expect(text, format).toContain('response 200');
			expect(text, format).toContain(PERSON_2.streaming.name.split(' ')[0]);
			expect(leaks(text, theirs), format).toEqual([]);
		}
	});
});

describe('TSK-0a6680 the bare-id helpers refuse another person, even when handed their ids', () => {
	it('changes nothing of person 1 when person 2 names person 1’s item, loan and check-in', async () => {
		// Each of these trusts an id once the caller has been checked; given another person's id they
		// must still do nothing.
		expect(await setItemEnd(db, 2, p1.rent, d('2027-01-01'))).toBe(false);
		expect(await setItemEnd(db, 2, p1.retired, null)).toBe(false);
		const fields = {
			type: 'credit-card' as const,
			name: 'Hijack',
			lender: null,
			balance: minor(1),
			rateBp: null,
			scheduleItemId: null,
			minPctBp: null,
			minFloor: null
		};
		expect(await updateLoan(db, 2, p1.card, fields, d('2026-11-16'))).toBe(false);
		expect(await closeLoan(db, 2, p1.informal, d('2026-11-16'), NOW)).toBe(false);
		expect((await checkInBalances(db, 2, p1.finishedCheckIn)).size).toBe(0);
		expect((await savedAnswers(db, 2, p1.finishedCheckIn)).size).toBe(0);
		await db.transaction(async (tx) => {
			await applyCheckInBalances(tx, 2, p1.finishedCheckIn, d('2026-11-16'));
			await discardCheckInBalances(tx, 2, p1.finishedCheckIn);
		});
		await discardCheckIn(db, 2, p1.openCheckIn);
		// The same calls as their own owner do see the data, so the refusals above mean something.
		expect((await checkInBalances(db, 1, p1.finishedCheckIn)).size).toBe(2);
		expect((await savedAnswers(db, 1, p1.finishedCheckIn)).size).toBeGreaterThan(0);
		expect(await personOne()).toBe(before);
	});
});

describe('TSK-0a6680 signed in as person 2, nothing in any route reaches person 1', () => {
	it('runs every load, action and endpoint with person 1’s ids and leaves person 1 as they were', async () => {
		const me = await signedInAs(db, 2, '198.51.100.21');
		const s: Sweep = { db, me, p1, p2, mine: PERSON_2 };
		const theirs = tokensOf(PERSON_1);
		const ran: string[] = [];
		for (const [key, entry] of Object.entries(ENTRIES)) {
			const text = await entry(s);
			ran.push(key);
			expect(leaks(text, theirs), `${key} gave person 2 something of person 1's`).toEqual([]);
		}
		expect(ran.length).toBe(Object.keys(ENTRIES).length);
		expect(await personOne()).toBe(before);
	});
});

describe('TSK-0a6680 every route and every action is in the sweep', () => {
	it('has an entry for each load, action and endpoint behind the sign-in', async () => {
		const required = await requiredEntries();
		expect(required.length).toBeGreaterThan(40);
		expect(required.filter((key) => !(key in ENTRIES))).toEqual([]);
	});

	it('has no entry for something that no longer exists', async () => {
		const required = new Set(await requiredEntries());
		expect(Object.keys(ENTRIES).filter((key) => !required.has(key))).toEqual([]);
	});

	it('knows every route in the file tree that is not public', async () => {
		const ids = new Set([...Object.keys(modules)].map(routeIdOf));
		for (const route of listRoutes()) {
			if (isPublic(route.id)) continue;
			// A page with no server file has nothing to run; one with a server file is in `modules`.
			expect(ids.has(route.id) || route.kind === 'page', route.id).toBe(true);
		}
	});
});
