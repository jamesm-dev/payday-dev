import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	addDays,
	calDate,
	lastDayOfMonth,
	parseCalDate as d,
	type CalDate
} from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import type { Item } from '#lib/domain/schedule.ts';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb, ownerRow } from '#lib/server/db/testing.ts';
import { checkIn, loanBalance, owner } from '#lib/server/db/schema.ts';
import { addExpense, listExpenseDays } from './expenses.ts';
import { buildHome, computeSafe } from './home.ts';
import { createLoan, listLoans } from './loans.ts';
import { presentLoans } from './loansView.ts';
import { addItem, saveRegion, setBalance, setOverride, setSetupStep } from './store.ts';

// TSK-adbca1: the SPECS.md budget (home p95 150 ms) holds when the database holds 100 people, each
// with the five years of data performance.test.ts builds for one. The household below is that file's
// every-14 household (its generator is inline in a beforeAll, not exported), built once for owner 1
// and then copied 99 times in SQL, so building the data costs seconds, not minutes.
const SERVER_P95_BUDGET_MS = 150;
const RUNS = 100;
const OWNERS = 100;
const MIDDLE = 50;
const STRIDE = 1_000_000; // every copied row's id is its original plus (owner - 1) * STRIDE
const NOW = new Date('2026-10-31T12:00:00Z');
const TODAY = d('2026-10-31');
const FIVE_YEARS_AGO = d('2021-11-01');

function lcg(seed: number) {
	let s = seed;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

/** One household with five years of data under owner 1. */
async function buildHousehold(db: Db) {
	await db.insert(owner).values(ownerRow(1));
	await saveRegion(db, 1, 'USD', 'UTC');
	await setSetupStep(db, 1, null);
	await setBalance(db, 1, minor(250000), TODAY, NOW);

	const random = lcg(42);
	const items: Omit<Item, 'id'>[] = [
		{
			kind: 'income',
			name: 'Pay',
			amount: minor(185000),
			rule: { kind: 'every14', anchor: d('2021-11-05') },
			startsOn: FIVE_YEARS_AGO
		}
	];
	for (let i = 0; i < 30; i++) {
		items.push({
			kind: 'bill',
			name: `Monthly bill ${i + 1}`,
			amount: minor(2000 + Math.floor(random() * 90000)),
			rule: { kind: 'monthly', day: 1 + Math.floor(random() * 31) },
			startsOn: FIVE_YEARS_AGO
		});
	}
	for (const [i, anchor] of ['2021-11-28', '2021-12-15', '2022-01-31', '2022-02-10'].entries()) {
		items.push({
			kind: 'bill',
			name: `Quarterly bill ${i + 1}`,
			amount: minor(9000 + i * 1000),
			rule: { kind: 'quarterly', anchor: d(anchor) },
			startsOn: FIVE_YEARS_AGO
		});
	}
	for (let i = 0; i < 3; i++) {
		items.push({
			kind: 'bill',
			name: `Yearly bill ${i + 1}`,
			amount: minor(40000 + i * 5000),
			rule: { kind: 'yearly', anchor: d(['2026-06-15', '2026-08-15', '2026-12-15'][i]) },
			startsOn: FIVE_YEARS_AGO
		});
	}
	for (let i = 0; i < 2; i++) {
		items.push({
			kind: 'loan-payment',
			name: `Loan ${i + 1}`,
			amount: minor(15000 + i * 7500),
			rule: { kind: 'every14', anchor: d(`2021-11-${10 + i}`) },
			startsOn: FIVE_YEARS_AGO
		});
	}
	const loanCadences: Item['rule'][] = [
		{ kind: 'monthly', day: 5 },
		{ kind: 'monthly', day: 18 },
		{ kind: 'quarterly', anchor: d('2026-12-01') },
		{ kind: 'yearly', anchor: d('2027-03-15') }
	];
	for (const [i, rule] of loanCadences.entries()) {
		items.push({
			kind: 'loan-payment',
			name: `Extra loan payment ${i + 1}`,
			amount: minor(25000 + i * 10000),
			rule,
			startsOn: FIVE_YEARS_AGO
		});
	}

	const ids: number[] = [];
	for (const item of items) ids.push(Number((await addItem(db, 1, item)).id));

	const taken = new Set<string>();
	while (taken.size < 600) {
		const n = 1 + Math.floor(random() * 30);
		const item = items[n];
		if (item.rule.kind !== 'monthly') continue;
		const monthsBack = Math.floor(random() * 59);
		const index = 2026 * 12 + 9 - monthsBack;
		const y = Math.floor(index / 12);
		const m = (index % 12) + 1;
		const original: CalDate = calDate(y, m, Math.min(item.rule.day, lastDayOfMonth(y, m)));
		const key = `${n}|${original}`;
		if (taken.has(key) || original < FIVE_YEARS_AGO) continue;
		taken.add(key);
		if (random() < 0.5) {
			await setOverride(db, 1, ids[n], { action: 'skip', originalDate: original });
		} else {
			await setOverride(db, 1, ids[n], {
				action: 'change',
				originalDate: original,
				date: addDays(original, -2),
				amount: minor(1000 + Math.floor(random() * 50000))
			});
		}
	}

	const loanItemId = (name: string) => ids[items.findIndex((it) => it.name === name)];
	const loanBase = { lender: null, minPctBp: null, minFloor: null } as const;
	const loans = [
		{ type: 'instalment', name: 'Car loan', balance: 850000, rateBp: 650, item: 'Loan 1' },
		{ type: 'bnpl', name: 'Laptop plan', balance: 45000, rateBp: 0, item: 'Loan 2' },
		{
			type: 'instalment',
			name: 'Student loan',
			balance: 2400000,
			rateBp: 430,
			item: 'Extra loan payment 1'
		},
		{
			type: 'informal',
			name: 'Loan from Dad',
			balance: 300000,
			rateBp: 0,
			item: 'Extra loan payment 2'
		},
		{
			type: 'informal',
			name: 'Loan from a friend',
			balance: 120000,
			rateBp: 800,
			item: 'Extra loan payment 3'
		},
		{
			type: 'credit-card',
			name: 'Visa',
			balance: 4000000,
			rateBp: 2399,
			item: 'Extra loan payment 4'
		},
		{
			type: 'credit-card',
			name: 'Store card',
			balance: 150000,
			rateBp: 2999,
			item: null,
			min: true
		},
		{ type: 'informal', name: 'Unsettled', balance: 60000, rateBp: null, item: null }
	] as const;
	for (const l of loans) {
		await createLoan(
			db,
			1,
			{
				...loanBase,
				type: l.type,
				name: l.name,
				balance: minor(l.balance),
				rateBp: l.rateBp,
				scheduleItemId: l.item ? loanItemId(l.item) : null,
				...('min' in l ? { minPctBp: 200, minFloor: minor(2500) } : {})
			},
			TODAY
		);
	}

	const loanIds = (await listLoans(db, 1)).map((l) => Number(l.id));
	for (let n = 0; n < 130; n++) {
		const asOf = addDays(TODAY, -14 * n);
		const row = (
			await db
				.insert(checkIn)
				.values({
					ownerId: 1,
					startedAt: `${asOf}T09:00:00.000Z`,
					finishedAt: `${asOf}T09:04:00.000Z`,
					durationSeconds: 240,
					currentStep: 'done',
					payLanded: true,
					payAmountMinor: 185000,
					balanceMinor: 250000,
					expectedMinor: 260000,
					spentMinor: 10000,
					asOf
				})
				.returning()
		)[0];
		for (const loanId of loanIds) {
			await db.insert(loanBalance).values({
				loanId,
				checkInId: row.id,
				asOf,
				balanceMinor: 100000 + 1000 * n + loanId,
				source: 'check-in'
			});
		}
	}

	for (let n = 0; n < 365; n++) {
		const day = addDays(TODAY, -n);
		await addExpense(
			db,
			1,
			{ amount: minor(500 + Math.floor(random() * 9000)), note: `Spend ${n + 1}`, spentOn: day },
			new Date(`${day}T${n === 0 ? '13' : '10'}:00:00.000Z`)
		);
	}
}

/** Copies owner 1's whole household to `who`, every id moved up by (who - 1) * STRIDE. */
async function copyHousehold(db: Db, who: number) {
	const off = (who - 1) * STRIDE;
	await db.execute(sql`
		insert into payday.owner (id, email, currency, time_zone, setup_step, reminder_time)
		select ${who}, ${`owner${who}@example.test`}, currency, time_zone, setup_step, reminder_time
		from payday.owner where id = 1`);
	await db.execute(sql`
		insert into payday.account (id, owner_id, name, balance_minor, balance_as_of, balance_saved_at)
		select id + ${off}, ${who}, name, balance_minor, balance_as_of, balance_saved_at
		from payday.account where owner_id = 1`);
	await db.execute(sql`
		insert into payday.schedule_item (id, account_id, kind, name, amount_minor, rule_kind, rule_anchor,
			rule_day, rule_day_2, starts_on, ends_on, group_name, optional, is_main_pay)
		select id + ${off}, account_id + ${off}, kind, name, amount_minor, rule_kind, rule_anchor,
			rule_day, rule_day_2, starts_on, ends_on, group_name, optional, is_main_pay
		from payday.schedule_item where account_id in (select id from payday.account where owner_id = 1)`);
	await db.execute(sql`
		insert into payday.occurrence_override (id, item_id, original_date, action, new_date, new_amount_minor)
		select o.id + ${off}, o.item_id + ${off}, o.original_date, o.action, o.new_date, o.new_amount_minor
		from payday.occurrence_override o
		where o.item_id in (select s.id from payday.schedule_item s
			join payday.account a on a.id = s.account_id where a.owner_id = 1)`);
	await db.execute(sql`
		insert into payday.expense (id, owner_id, amount_minor, note, spent_on, logged_at, updated_at)
		select id + ${off}, ${who}, amount_minor, note, spent_on, logged_at, updated_at
		from payday.expense where owner_id = 1`);
	await db.execute(sql`
		insert into payday.check_in (id, owner_id, started_at, finished_at, duration_seconds, current_step,
			pay_landed, pay_amount_minor, balance_minor, expected_minor, spent_minor, logged_minor,
			balance_read_at, as_of)
		select id + ${off}, ${who}, started_at, finished_at, duration_seconds, current_step,
			pay_landed, pay_amount_minor, balance_minor, expected_minor, spent_minor, logged_minor,
			balance_read_at, as_of
		from payday.check_in where owner_id = 1`);
	await db.execute(sql`
		insert into payday.loan (id, owner_id, type, name, lender, balance_minor, balance_as_of, rate_bp,
			schedule_item_id, min_pct_bp, min_floor_minor, closed_at)
		select id + ${off}, ${who}, type, name, lender, balance_minor, balance_as_of, rate_bp,
			schedule_item_id + ${off}, min_pct_bp, min_floor_minor, closed_at
		from payday.loan where owner_id = 1`);
	await db.execute(sql`
		insert into payday.loan_balance (id, loan_id, check_in_id, as_of, balance_minor, source, read_at)
		select b.id + ${off}, b.loan_id + ${off}, b.check_in_id + ${off}, b.as_of, b.balance_minor,
			b.source, b.read_at
		from payday.loan_balance b where b.loan_id in (select id from payday.loan where owner_id = 1)`);
}

function p95Of(times: number[]) {
	const sorted = [...times].sort((a, b) => a - b);
	return {
		p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
		median: sorted[Math.floor(sorted.length / 2)],
		max: sorted[sorted.length - 1]
	};
}

describe(
	'TSK-adbca1 the home and loans computations stay fast with 100 people, each with five years of data',
	{ timeout: 120_000 },
	() => {
		let db: Db;
		let buildSeconds = 0;

		beforeAll(async () => {
			db = await freshDb();
			const start = performance.now();
			await buildHousehold(db);
			for (let who = 2; who <= OWNERS; who++) await copyHousehold(db, who);
			await db.execute(sql`analyze`);
			buildSeconds = (performance.now() - start) / 1000;
		}, 600_000);

		it('holds 100 people, each with their own full household', async () => {
			const count = async (table: string) => {
				const result = (await db.execute(
					sql.raw(`select count(*)::int as n from payday.${table}`)
				)) as unknown as { rows: { n: number }[] };
				return Number(result.rows[0].n);
			};
			expect(await count('owner')).toBe(OWNERS);
			expect(await count('schedule_item')).toBe(OWNERS * 44);
			expect(await count('occurrence_override')).toBe(OWNERS * 600);
			expect(await count('check_in')).toBe(OWNERS * 130);
			expect(await count('loan')).toBe(OWNERS * 8);
			expect(await count('loan_balance')).toBe(OWNERS * (130 * 8 + 8));
			expect(await count('expense')).toBe(OWNERS * 365);
			// The person in the middle sees exactly their own household.
			const view = await computeSafe(db, MIDDLE, NOW);
			expect(view.state).toBe('ready');
			expect(view.plan.items).toHaveLength(44);
			expect(view.plan.overrides).toHaveLength(600);
			expect(await listLoans(db, MIDDLE)).toHaveLength(8);
			expect(await listExpenseDays(db, MIDDLE)).toHaveLength(365);
			// And it is the same screen owner 1 gets.
			const first = await buildHome(db, 1, NOW);
			const middle = await buildHome(db, MIDDLE, NOW);
			expect(middle.state).toBe('ready');
			expect(middle.state).toBe(first.state);
		});

		it(`computes the home screen in at most ${SERVER_P95_BUDGET_MS} ms at p95 over ${RUNS} runs`, async () => {
			await buildHome(db, MIDDLE, NOW); // warm-up, not counted
			const times: number[] = [];
			for (let i = 0; i < RUNS; i++) {
				const start = performance.now();
				const view = await buildHome(db, MIDDLE, NOW);
				times.push(performance.now() - start);
				expect(view.state).toBe('ready');
			}
			const { p95, median, max } = p95Of(times);
			console.log(
				`100-owner home computation (owner ${MIDDLE}): p95 ${p95.toFixed(2)} ms, median ` +
					`${median.toFixed(2)} ms, max ${max.toFixed(2)} ms over ${RUNS} runs ` +
					`(${OWNERS} owners, ${OWNERS * 44} items, ${OWNERS * 600} overrides, ${OWNERS * 130} ` +
					`check-ins, ${OWNERS * (130 * 8 + 8)} loan balances, ${OWNERS * 365} expenses; built in ` +
					`${buildSeconds.toFixed(1)} s)`
			);
			expect(p95).toBeLessThanOrEqual(SERVER_P95_BUDGET_MS);
		});

		it(`computes the loans screen in at most ${SERVER_P95_BUDGET_MS} ms at p95 over ${RUNS} runs`, async () => {
			const first = await presentLoans(db, MIDDLE, NOW); // warm-up, not counted
			expect(first.loans).toHaveLength(8);
			expect(first.history).toHaveLength(130);
			const times: number[] = [];
			for (let i = 0; i < RUNS; i++) {
				const start = performance.now();
				await presentLoans(db, MIDDLE, NOW);
				times.push(performance.now() - start);
			}
			const { p95, median, max } = p95Of(times);
			console.log(
				`100-owner loans computation (owner ${MIDDLE}): p95 ${p95.toFixed(2)} ms, median ` +
					`${median.toFixed(2)} ms, max ${max.toFixed(2)} ms over ${RUNS} runs`
			);
			expect(p95).toBeLessThanOrEqual(SERVER_P95_BUDGET_MS);
		});
	}
);
