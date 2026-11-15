/*
 * Integration-review fixes for early payments (ADR-0020), on the fixture household (ids: pay 1, rent
 * 2, phone 3, card 4). Balance 1,500.00 as of Fri 2026-10-02; the first update is on Fri 2026-10-16
 * (UTC) at noon, balance 3,000.00, pay 1,850.00, phone missed.
 */
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner, paymentConfirmation } from '#lib/server/db/schema.ts';
import {
	acknowledgeSpending,
	checkInContext,
	finishCheckIn,
	loanLines,
	paymentLines,
	saveBalanceStep,
	saveLoans,
	savePay,
	savePayments,
	startCheckIn
} from './checkin.ts';
import { createLoan } from './loans.ts';
import { presentLoans } from './loansView.ts';
import { presentDone } from './checkinView.ts';
import { buildHome } from './home.ts';
import { buildPlan } from './planView.ts';
import { seedHousehold } from './seed.ts';
import { addItem, listPaidMarks, listItems, setBalance, setPaidMark } from './store.ts';

const T0 = new Date('2026-10-16T12:00:00Z');
const T0_END = new Date('2026-10-16T12:04:12Z');

async function household() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T0, loans: false });
	await setBalance(db, 1, minor(150000), d('2026-10-02'), new Date('2026-10-02T12:00:00Z'));
	return db;
}

async function firstCheckIn(db: Awaited<ReturnType<typeof household>>) {
	const row = await startCheckIn(db, 1, T0);
	await savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
	await saveBalanceStep(db, 1, row.id, T0, minor(300000));
	await acknowledgeSpending(db, 1, row.id);
	await savePayments(db, 1, row.id, T0, new Map([['3|2026-10-15', 'missed']]));
	return finishCheckIn(db, 1, row.id, T0_END);
}

describe('TSK-C00C8A the done page holds a bill paid early out of what comes before payday', () => {
	it('card (Oct 28, 60.00) paid early: the first paycheck and "you pay" match the plan', async () => {
		const db = await household();
		await firstCheckIn(db);
		const later = new Date('2026-10-16T13:00:00Z');
		await setPaidMark(db, 1, 4, d('2026-10-28'), true, later);
		const done = (await presentDone(db, 1, later))!;
		// Oct 17 to Oct 30: only the pay; the card is paid already. Before: 60.00 and left 1,752.09.
		expect(done.upcoming.map((l) => l.name)).toEqual(['Pay']);
		expect(done.upcomingOut).toBe('$0.00');
		const plan = await buildPlan(db, 1, later);
		if (plan.state !== 'ready') throw new Error(plan.state);
		expect(done.first).toEqual(plan.paychecks[0]);
		// 1,752.09 plus the 60.00 no longer held for the card.
		expect(done.first).toMatchObject({ left: '$1,812.09' });
	});
});

describe('TSK-BFBB02 / LOW: marks', () => {
	it('marking an already-marked bill again keeps the first marked_at', async () => {
		const db = await household();
		await setPaidMark(db, 1, 4, d('2026-10-28'), true, new Date('2026-10-10T09:00:00Z'));
		await setPaidMark(db, 1, 4, d('2026-10-28'), true, new Date('2026-10-12T09:00:00Z'));
		const items = await listItems(db, 1);
		expect([...(await listPaidMarks(db, items)).values()]).toEqual(['2026-10-10T09:00:00.000Z']);
	});

	it('a re-mark after a finished check-in answered it still wins (the latest word)', async () => {
		const db = await household();
		await firstCheckIn(db); // phone (Oct 15) answered "missed" at 12:04:12
		await setPaidMark(db, 1, 3, d('2026-10-15'), true, new Date('2026-10-10T09:00:00Z'));
		// An older mark, before the answer, is not standing; marking again after the answer is.
		await setPaidMark(db, 1, 3, d('2026-10-15'), true, new Date('2026-10-17T09:00:00Z'));
		const items = await listItems(db, 1);
		expect([...(await listPaidMarks(db, items)).values()]).toEqual(['2026-10-17T09:00:00.000Z']);
		expect(await db.select().from(paymentConfirmation)).toHaveLength(1);
	});
});

// ---- TSK-BFBB02: a loan payment marked during an open update counts once ----
// A 300.00 plan at 0%, 100.00 on the 20th of each month, balance 300.00 as of Oct 2. Update 1 is
// Fri Oct 16: the account balance is read at noon, the loans step is saved at 12:31, so that is when
// the lender's figure was read (a loan balance has its own read time). The Oct 20 payment is paid
// early, once, and is counted exactly once.
//   A. Marked at 12:30, before the loans step: the step's figure expects 300.00 - 100.00 = 200.00,
//      and the owner types 200.00 (the lender's, which holds it). It is in that balance, so the next
//      update does not take it off again: Oct 30 expects 200.00 (never 100.00), and /loans shows
//      200.00 in between (never lower).
//   B. Marked at 12:33, after the loans step was saved: the balance does not hold it. /loans shows
//      300.00 - 100.00 = 200.00 at once and Oct 30 expects 300.00 - 100.00 = 200.00, once.
describe('TSK-BFBB02 a loan payment paid early during an update is taken off once', () => {
	const STEP = new Date('2026-10-16T12:31:00Z');
	const END = new Date('2026-10-16T12:35:00Z');
	const T2 = new Date('2026-10-30T12:00:00Z');

	async function update1(
		db: Awaited<ReturnType<typeof household>>,
		id: number,
		markAt: string,
		typed: number
	) {
		const mark = () => setPaidMark(db, 1, id, d('2026-10-20'), true, new Date(markAt));
		const row = await startCheckIn(db, 1, T0);
		await savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		await saveBalanceStep(db, 1, row.id, T0, minor(300000));
		await acknowledgeSpending(db, 1, row.id);
		await savePayments(db, 1, row.id, T0, new Map(await paidAnswers(db, T0)));
		if (markAt < STEP.toISOString()) await mark();
		const ctx = (await checkInContext(db, 1, STEP))!;
		const shown = (await loanLines(db, 1, ctx, row.id))[0].expected;
		await saveLoans(db, 1, row.id, STEP, new Map([[1, minor(typed)]]));
		if (markAt >= STEP.toISOString()) await mark();
		await finishCheckIn(db, 1, row.id, END);
		return shown;
	}

	async function expectedAtUpdate2(db: Awaited<ReturnType<typeof household>>) {
		const second = await startCheckIn(db, 1, T2);
		await savePay(db, 1, second.id, { landed: true, amount: minor(185000) });
		await saveBalanceStep(db, 1, second.id, T2, minor(400000));
		await acknowledgeSpending(db, 1, second.id);
		await savePayments(db, 1, second.id, T2, new Map(await paidAnswers(db, T2)));
		const ctx2 = (await checkInContext(db, 1, T2))!;
		return (await loanLines(db, 1, ctx2, second.id))[0].expected;
	}

	it('A: marked before the loans step and typed in: 200.00 now, 200.00 at the next update', async () => {
		const db = await household();
		const id = await plan300(db);
		expect(await update1(db, id, '2026-10-16T12:30:00Z', 20000)).toBe(20000);
		expect((await presentLoans(db, 1, new Date('2026-10-16T13:00:00Z'))).total).toBe('$200.00');
		expect(await expectedAtUpdate2(db)).toBe(20000);
	});

	it('B: marked after the loans step: 200.00 at once, taken off once at the next update', async () => {
		const db = await household();
		const id = await plan300(db);
		expect(await update1(db, id, '2026-10-16T12:33:00Z', 30000)).toBe(30000);
		// The page's total is the saved figure, 300.00: never below the 200.00 that is owed.
		expect(['$300.00', '$200.00']).toContain(
			(await presentLoans(db, 1, new Date('2026-10-16T13:00:00Z'))).total
		);
		expect(await expectedAtUpdate2(db)).toBe(20000);
	});
});

/** Every payment due since the balance, answered paid. */
async function paidAnswers(db: Awaited<ReturnType<typeof household>>, now: Date) {
	const ctx = (await checkInContext(db, 1, now))!;
	return paymentLines(ctx).map((l): [string, 'paid'] => [l.key, 'paid']);
}

async function plan300(db: Awaited<ReturnType<typeof household>>) {
	const item = await addItem(db, 1, {
		kind: 'loan-payment',
		name: 'Phone plan',
		amount: minor(10000),
		rule: { kind: 'monthly', day: 20 },
		startsOn: d('2026-10-01')
	});
	await createLoan(
		db,
		1,
		{
			type: 'instalment',
			name: 'Phone plan',
			lender: null,
			balance: minor(30000),
			rateBp: 0,
			scheduleItemId: Number(item.id),
			minPctBp: null,
			minFloor: null
		},
		d('2026-10-02')
	);
	return Number(item.id);
}

describe('TSK-4C1D5A the home screen says what it took off for bills paid early', () => {
	it('names the 60.00 card payment paid early, and nothing when none was', async () => {
		const db = await household();
		const at = new Date('2026-10-16T13:00:00Z');
		const before = await buildHome(db, 1, at);
		expect(before).toMatchObject({ state: 'ready', paidEarlyOff: null });
		await setPaidMark(db, 1, 4, d('2026-10-28'), true, at);
		expect(await buildHome(db, 1, at)).toMatchObject({ state: 'ready', paidEarlyOff: '$60.00' });
	});
});
