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

// ---- TSK-BFBB02: a loan payment marked during an open update counts once, at the next one ----
// A 300.00 plan at 0%, 100.00 on the 20th of each month, balance 300.00 as of Oct 2. Update 1 is
// Fri Oct 16 (balance read at noon). The Oct 20 payment is marked paid early at 12:30 on Oct 16,
// after that read and before update 1's loans step.
//   Update 1 expects 300.00: the payment is not in the balance the owner reads, and it is not taken
//   off here (the amendment to ADR-0020). The owner confirms 300.00.
//   Update 2 (Oct 30) takes it off, once, from the day it was paid: 300.00 - 100.00 = 200.00.
//   Never 100.00 (twice), and never lower than 200.00 in between.
describe('TSK-BFBB02 a loan payment paid early during an update is taken off once', () => {
	it('update 1 holds 300.00, the loans page never shows less than the debt, update 2 expects 200.00', async () => {
		const db = await household();
		const id = await plan300(db);
		const mark = (at: string) => setPaidMark(db, 1, id, d('2026-10-20'), true, new Date(at));

		const row = await startCheckIn(db, 1, T0);
		await savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
		await saveBalanceStep(db, 1, row.id, T0, minor(300000));
		await acknowledgeSpending(db, 1, row.id);
		await savePayments(db, 1, row.id, T0, new Map(await paidAnswers(db, T0)));
		await mark('2026-10-16T12:30:00Z');
		const ctx = (await checkInContext(db, 1, T0))!;
		expect((await loanLines(db, 1, ctx, row.id))[0].expected).toBe(30000);
		await saveLoans(db, 1, row.id, T0, new Map([[1, minor(30000)]]));
		await finishCheckIn(db, 1, row.id, T0_END);

		// In between: the owner paid 100.00 after the read, so the page may show 200.00 but no less.
		const between = new Date('2026-10-16T13:00:00Z');
		const page = await presentLoans(db, 1, between);
		expect(['$300.00', '$200.00']).toContain(page.total);

		const T2 = new Date('2026-10-30T12:00:00Z');
		const second = await startCheckIn(db, 1, T2);
		await savePay(db, 1, second.id, { landed: true, amount: minor(185000) });
		await saveBalanceStep(db, 1, second.id, T2, minor(400000));
		await acknowledgeSpending(db, 1, second.id);
		await savePayments(db, 1, second.id, T2, new Map(await paidAnswers(db, T2)));
		const ctx2 = (await checkInContext(db, 1, T2))!;
		expect((await loanLines(db, 1, ctx2, second.id))[0].expected).toBe(20000);
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
