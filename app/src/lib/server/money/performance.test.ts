import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	addDays,
	calDate,
	lastDayOfMonth,
	parseCalDate as d,
	type CalDate
} from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import type { Item } from '#lib/domain/schedule.ts';
import { open } from '#lib/server/db/open.ts';
import { checkIn, loanBalance, owner } from '#lib/server/db/schema.ts';
import { addExpense, countingExpenses, listExpenseDays } from './expenses.ts';
import { buildHome, computeSafe } from './home.ts';
import { createLoan, listLoans } from './loans.ts';
import { presentLoans } from './loansView.ts';
import { addItem, saveRegion, setBalance, setOverride, setSetupStep } from './store.ts';

// SPECS.md performance budget, re-checked with five years of data (Phase 1 exit criterion).
const SERVER_P95_BUDGET_MS = 150;
const RUNS = 100;
const NOW = new Date('2026-10-31T12:00:00Z');
const TODAY = d('2026-10-31');
const FIVE_YEARS_AGO = d('2021-11-01');

/** A small deterministic generator, so every run builds the same five years. */
function lcg(seed: number) {
	let s = seed;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

// 100 timed runs each can outlast Vitest's 5 s default on a busy machine; the budget is the p95, not
// the wall-clock length of the test, so the time limit is raised rather than the runs cut.
describe(
	'TSK-79C0D4 TSK-DD46D6 the home and loans computations stay fast with five years of data',
	{ timeout: 60_000 },
	() => {
		let dir: string;
		let db: ReturnType<typeof open>;
		let itemCount = 0;
		let overrideCount = 0;
		let checkInCount = 0;
		let balanceCount = 0;
		let expenseCount = 0;

		beforeAll(() => {
			dir = mkdtempSync(join(tmpdir(), 'payday-perf-'));
			db = open(join(dir, 'five-years.db'));
			db.insert(owner).values({ id: 1 }).run();
			saveRegion(db, 1, 'USD', 'UTC');
			setSetupStep(db, 1, null);
			setBalance(db, 1, minor(250000), TODAY, NOW);

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
			const quarterlyAnchors = ['2021-11-28', '2021-12-15', '2022-01-31', '2022-02-10'];
			for (const [i, anchor] of quarterlyAnchors.entries()) {
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

			// Four more loan payments, for the loans below: monthly, quarterly and yearly cadences.
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

			const ids = items.map((item) => Number(addItem(db, 1, item).id));
			itemCount = ids.length;

			// About 600 overrides, each on a real past occurrence of a monthly bill.
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
					setOverride(db, 1, ids[n], { action: 'skip', originalDate: original });
				} else {
					setOverride(db, 1, ids[n], {
						action: 'change',
						originalDate: original,
						date: addDays(original, -2),
						amount: minor(1000 + Math.floor(random() * 50000))
					});
				}
			}
			overrideCount = taken.size;

			// Eight loans, one of each shape the projection has to walk: two on the fortnightly
			// payments, four on monthly, quarterly and yearly ones, a card on its minimum rule, and a
			// loan with no payments. One of them never pays off, so it is walked for the full 50 years.
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
				createLoan(
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

			// Five years of fortnightly check-ins, each confirming every loan's balance.
			const loanIds = listLoans(db, 1).map((l) => Number(l.id));
			for (let n = 0; n < 130; n++) {
				const asOf = addDays(TODAY, -14 * n);
				const row = db
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
					.get();
				checkInCount++;
				for (const loanId of loanIds) {
					db.insert(loanBalance)
						.values({
							loanId,
							checkInId: row.id,
							asOf,
							balanceMinor: 100000 + 1000 * n + loanId,
							source: 'check-in'
						})
						.run();
					balanceCount++;
				}
			}

			// TSK-DD46D6: a year of daily expenses, 365 days back from today, logged on the day. The
			// balance (today) was read at NOW, 12:00: the expense logged at 13:00 today counts and the
			// rest are history, but the list and the counting query still have the whole year to read.
			for (let n = 0; n < 365; n++) {
				const day = addDays(TODAY, -n);
				addExpense(
					db,
					1,
					{
						amount: minor(500 + Math.floor(random() * 9000)),
						note: `Spend ${n + 1}`,
						spentOn: day
					},
					new Date(`${day}T${n === 0 ? '13' : '10'}:00:00.000Z`)
				);
				expenseCount++;
			}
		});

		afterAll(() => {
			db.$client.close();
			rmSync(dir, { recursive: true, force: true });
		});

		it('has the five years of data the criterion asks for', () => {
			const plan = computeSafe(db, 1, NOW).plan;
			expect(plan.items).toHaveLength(itemCount);
			expect(itemCount).toBe(44);
			expect(plan.overrides).toHaveLength(overrideCount);
			expect(overrideCount).toBe(600);
			expect(computeSafe(db, 1, NOW).state).toBe('ready');
			expect(listLoans(db, 1)).toHaveLength(8);
			expect(checkInCount).toBe(130);
			expect(balanceCount).toBe(130 * 8);
			expect(expenseCount).toBe(365);
			expect(listExpenseDays(db, 1)).toHaveLength(365);
			// The timed runs below include the counting rule doing real work: today's expense counts.
			expect(countingExpenses(db, 1).expenses.length).toBeGreaterThanOrEqual(1);
		});

		it(`computes the home screen in at most ${SERVER_P95_BUDGET_MS} ms at p95 over ${RUNS} runs`, () => {
			buildHome(db, 1, NOW); // warm-up, not counted
			const times: number[] = [];
			for (let i = 0; i < RUNS; i++) {
				const start = performance.now();
				const view = buildHome(db, 1, NOW);
				times.push(performance.now() - start);
				expect(view.state).toBe('ready');
			}
			times.sort((a, b) => a - b);
			const p95 = times[Math.ceil(times.length * 0.95) - 1];
			const median = times[Math.floor(times.length / 2)];
			console.log(
				`five-year home computation: p95 ${p95.toFixed(2)} ms, median ${median.toFixed(2)} ms, ` +
					`max ${times[times.length - 1].toFixed(2)} ms over ${RUNS} runs ` +
					`(${itemCount} items, ${overrideCount} overrides, 8 loans, ${checkInCount} check-ins, ` +
					`${balanceCount} loan balances, ${expenseCount} expenses)`
			);
			expect(p95).toBeLessThanOrEqual(SERVER_P95_BUDGET_MS);
		});

		it(`computes the loans screen in at most ${SERVER_P95_BUDGET_MS} ms at p95 over ${RUNS} runs`, () => {
			const first = presentLoans(db, 1, NOW); // warm-up, not counted
			expect(first.loans).toHaveLength(8);
			expect(first.history).toHaveLength(130);
			const times: number[] = [];
			for (let i = 0; i < RUNS; i++) {
				const start = performance.now();
				presentLoans(db, 1, NOW);
				times.push(performance.now() - start);
			}
			times.sort((a, b) => a - b);
			const p95 = times[Math.ceil(times.length * 0.95) - 1];
			const median = times[Math.floor(times.length / 2)];
			console.log(
				`five-year loans computation: p95 ${p95.toFixed(2)} ms, median ${median.toFixed(2)} ms, ` +
					`max ${times[times.length - 1].toFixed(2)} ms over ${RUNS} runs ` +
					`(8 loans projected, ${first.history.length} check-in totals)`
			);
			expect(p95).toBeLessThanOrEqual(SERVER_P95_BUDGET_MS);
		});
	}
);
