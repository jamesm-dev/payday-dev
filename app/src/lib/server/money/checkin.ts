/**
 * The payday check-in, saved a step at a time. A check-in exists from the moment it is started, with
 * the step it has reached, so a dropped connection resumes where it stopped. The arithmetic is the
 * pure domain's (`#lib/domain/checkin.ts`); this file reads and writes what it needs.
 *
 * The balance a check-in starts from is the account's own: normally the last check-in's, because
 * finishing one saves its balance there, but a newer balance typed on the home screen is a better
 * starting point than an older check-in, so it wins.
 */
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import {
	expectedBalance,
	incomeDueSince,
	paymentsDueSince,
	spentSince,
	type Base
} from '#lib/domain/checkin.ts';
import { parseCalDate } from '#lib/domain/dates.ts';
import { cardPurchases } from '#lib/domain/loans.ts';
import { add, minor, sum, type Minor } from '#lib/domain/money.ts';
import type { Item, Occurrence } from '#lib/domain/schedule.ts';
import type { Db } from '#lib/server/db/open.ts';
import { checkIn, loanBalance, paymentConfirmation } from '#lib/server/db/schema.ts';
import { occurrenceKey, type PayAnswer, type PaymentStatus } from './checkinForm.ts';
import {
	applyCheckInBalances,
	discardCheckInBalances,
	listLoans,
	loanExpectations,
	type LoanExpectation
} from './loans.ts';
import { countingExpenses } from './expenses.ts';
import { loadPlan, setBalance, type Plan } from './store.ts';

export const CHECKIN_STEPS = [
	'pay',
	'balance',
	'spending',
	'payments',
	'loans',
	'finish',
	'done'
] as const;
export type CheckInStep = (typeof CHECKIN_STEPS)[number];
export const isCheckInStep = (v: unknown): v is CheckInStep =>
	CHECKIN_STEPS.includes(v as CheckInStep);

export type CheckInRow = typeof checkIn.$inferSelect;

export type PaymentLine = {
	key: string;
	occurrence: Occurrence;
	/** True for a payment marked missed at an earlier check-in and still not confirmed paid. */
	carried: boolean;
};

const nowIso = (now: Date) => now.toISOString();

// ---- Outstanding payments ----

/**
 * Payments marked missed at a finished check-in and not confirmed paid since. The latest answer for
 * each occurrence wins, so a missed payment reappears at every check-in until it is confirmed paid.
 */
export function listOutstanding(db: Db, ownerId: number, items: readonly Item[]): Occurrence[] {
	const rows = db
		.select({ pc: paymentConfirmation, checkInId: checkIn.id })
		.from(paymentConfirmation)
		.innerJoin(checkIn, eq(checkIn.id, paymentConfirmation.checkInId))
		.where(and(eq(checkIn.ownerId, ownerId), isNotNull(checkIn.finishedAt)))
		.orderBy(checkIn.id)
		.all();
	const latest = new Map<string, (typeof rows)[number]['pc']>();
	for (const { pc } of rows) latest.set(occurrenceKey(String(pc.itemId), pc.originalDate), pc);

	const out: Occurrence[] = [];
	for (const pc of latest.values()) {
		if (pc.status !== 'missed') continue;
		const item = items.find((i) => i.id === String(pc.itemId));
		out.push({
			itemId: String(pc.itemId),
			kind: item?.kind ?? 'bill',
			name: item?.name ?? 'A payment',
			date: parseCalDate(pc.dueDate),
			amount: minor(pc.amountMinor),
			originalDate: parseCalDate(pc.originalDate)
		});
	}
	return out.sort(
		(a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.itemId < b.itemId ? -1 : 1)
	);
}

// ---- Reading ----

export function getOpenCheckIn(db: Db, ownerId: number): CheckInRow | null {
	return (
		db
			.select()
			.from(checkIn)
			.where(and(eq(checkIn.ownerId, ownerId), isNull(checkIn.finishedAt)))
			.orderBy(desc(checkIn.id))
			.get() ?? null
	);
}

export function listFinished(db: Db, ownerId: number): CheckInRow[] {
	return db
		.select()
		.from(checkIn)
		.where(and(eq(checkIn.ownerId, ownerId), isNotNull(checkIn.finishedAt)))
		.orderBy(desc(checkIn.id))
		.all();
}

export const getLatestFinished = (db: Db, ownerId: number): CheckInRow | null =>
	db
		.select()
		.from(checkIn)
		.where(and(eq(checkIn.ownerId, ownerId), isNotNull(checkIn.finishedAt)))
		.orderBy(desc(checkIn.id))
		.limit(1)
		.get() ?? null;

export function readCheckIn(db: Db, ownerId: number, id: number): CheckInRow | null {
	return (
		db
			.select()
			.from(checkIn)
			.where(and(eq(checkIn.id, id), eq(checkIn.ownerId, ownerId)))
			.get() ?? null
	);
}

function stepOf(row: CheckInRow): CheckInStep {
	if (!isCheckInStep(row.currentStep)) throw new Error(`Unknown check-in step: ${row.currentStep}`);
	return row.currentStep;
}

// ---- What a check-in asks about ----

export type Context = {
	plan: Plan;
	base: Base;
	outstanding: Occurrence[];
};

/** The plan, the balance to start from and the missed payments still owed. Null with no balance yet. */
export function checkInContext(db: Db, ownerId: number, now: Date): Context | null {
	const plan = loadPlan(db, ownerId, now);
	if (!plan.balance) return null;
	return {
		plan,
		base: { amount: plan.balance.amount, asOf: plan.balance.asOf },
		outstanding: listOutstanding(db, ownerId, plan.items)
	};
}

/** The pay scheduled since the balance, and its total: what step 1 offers to confirm. */
export function scheduledPay(ctx: Context): { total: Minor; lines: Occurrence[] } {
	const lines = incomeDueSince(ctx.plan.items, ctx.plan.overrides, ctx.base.asOf, ctx.plan.today);
	return { total: sum(lines.map((o) => o.amount)), lines };
}

/** Every payment step 4 asks about: those due since the balance, then those still owed. */
export function paymentLines(ctx: Context): PaymentLine[] {
	const due = paymentsDueSince(ctx.plan.items, ctx.plan.overrides, ctx.base.asOf, ctx.plan.today);
	const seen = new Set<string>();
	const lines: PaymentLine[] = [];
	for (const o of ctx.outstanding) {
		const key = occurrenceKey(o.itemId, o.originalDate);
		seen.add(key);
		lines.push({ key, occurrence: o, carried: true });
	}
	for (const o of due) {
		const key = occurrenceKey(o.itemId, o.originalDate);
		if (!seen.has(key)) lines.push({ key, occurrence: o, carried: false });
	}
	return lines.sort(
		(a, b) =>
			(a.occurrence.date < b.occurrence.date
				? -1
				: a.occurrence.date > b.occurrence.date
					? 1
					: 0) || (a.key < b.key ? -1 : 1)
	);
}

const payLanded = (row: CheckInRow): Minor => minor(row.payLanded ? (row.payAmountMinor ?? 0) : 0);

/** The answers saved for this check-in's payments, by occurrence key. */
export function savedAnswers(db: Db, checkInId: number): Map<string, PaymentStatus> {
	const out = new Map<string, PaymentStatus>();
	for (const pc of db
		.select()
		.from(paymentConfirmation)
		.where(eq(paymentConfirmation.checkInId, checkInId))
		.all()) {
		if (pc.status === 'paid' || pc.status === 'missed') {
			out.set(occurrenceKey(String(pc.itemId), pc.originalDate), pc.status);
		}
	}
	return out;
}

// ---- Writing: one function per step ----

export class CheckInError extends Error {}

/** Starts a check-in, or returns the one already under way. */
export function startCheckIn(db: Db, ownerId: number, now: Date): CheckInRow {
	const open = getOpenCheckIn(db, ownerId);
	if (open) return open;
	const ctx = checkInContext(db, ownerId, now);
	if (!ctx) throw new CheckInError('There is no balance to check in from yet.');
	return db
		.insert(checkIn)
		.values({ ownerId, startedAt: nowIso(now), currentStep: 'pay', asOf: ctx.plan.today })
		.returning()
		.get();
}

/** Throws unless the check-in is open and at one of the steps. */
function openAt(db: Db, ownerId: number, id: number, ...steps: CheckInStep[]): CheckInRow {
	const row = readCheckIn(db, ownerId, id);
	if (!row || row.finishedAt !== null) throw new CheckInError('This check-in is not open.');
	if (!steps.includes(stepOf(row))) throw new CheckInError('This step is not the current one.');
	return row;
}

function setStep(db: Db, id: number, step: CheckInStep, extra: Partial<CheckInRow> = {}) {
	db.update(checkIn)
		.set({ ...extra, currentStep: step })
		.where(eq(checkIn.id, id))
		.run();
}

export function savePay(db: Db, ownerId: number, id: number, answer: PayAnswer): void {
	openAt(db, ownerId, id, 'pay');
	setStep(db, id, 'balance', {
		payLanded: answer.landed,
		payAmountMinor: answer.amount
	});
}

/**
 * Saves the balance and works out, for now, what was spent. Until step 4 says which payments went
 * out, every payment due since the last balance is assumed paid, and a payment still owed from
 * before is assumed not.
 */
export function saveBalanceStep(
	db: Db,
	ownerId: number,
	id: number,
	now: Date,
	balance: Minor
): void {
	const row = openAt(db, ownerId, id, 'balance');
	const ctx = checkInContext(db, ownerId, now);
	if (!ctx) throw new CheckInError('There is no balance to check in from yet.');
	const due = paymentsDueSince(ctx.plan.items, ctx.plan.overrides, ctx.base.asOf, ctx.plan.today);
	const expected = expectedBalance({ base: ctx.base, payLanded: payLanded(row), paid: due });
	setStep(db, id, 'spending', {
		balanceMinor: balance,
		// The moment the bank figure was read: finishing stamps the account's balance with it.
		balanceReadAt: nowIso(now),
		expectedMinor: expected,
		spentMinor: spentSince(expected, balance),
		asOf: ctx.plan.today
	});
}

export function acknowledgeSpending(db: Db, ownerId: number, id: number): void {
	openAt(db, ownerId, id, 'spending');
	setStep(db, id, 'payments');
}

/**
 * Saves which payments went out, then settles the expected balance and the spending on those
 * answers. A payment confirmed paid leaves the account; one marked missed has not, and stays
 * reserved until a later check-in confirms it.
 */
export function savePayments(
	db: Db,
	ownerId: number,
	id: number,
	now: Date,
	answers: ReadonlyMap<string, PaymentStatus>
): void {
	const row = openAt(db, ownerId, id, 'payments');
	const ctx = checkInContext(db, ownerId, now);
	if (!ctx) throw new CheckInError('There is no balance to check in from yet.');
	const lines = paymentLines(ctx);
	for (const line of lines) {
		if (!answers.has(line.key)) throw new CheckInError('Every payment needs an answer.');
	}
	const paid = lines.filter((l) => answers.get(l.key) === 'paid').map((l) => l.occurrence);
	const expected = expectedBalance({ base: ctx.base, payLanded: payLanded(row), paid });

	db.transaction((tx) => {
		tx.delete(paymentConfirmation).where(eq(paymentConfirmation.checkInId, id)).run();
		for (const line of lines) {
			const o = line.occurrence;
			tx.insert(paymentConfirmation)
				.values({
					checkInId: id,
					itemId: Number(o.itemId),
					originalDate: o.originalDate,
					dueDate: o.date,
					amountMinor: o.amount,
					status: answers.get(line.key)!
				})
				.run();
		}
		// Loans come next, when there are any to confirm; their balances are saved with that step.
		tx.update(checkIn)
			.set({
				expectedMinor: expected,
				spentMinor: spentSince(expected, minor(row.balanceMinor ?? 0)),
				currentStep: listLoans(tx as unknown as Db, ownerId).length > 0 ? 'loans' : 'finish'
			})
			.where(eq(checkIn.id, id))
			.run();
	});
}

/** The account's own spending: what should be there, less what is. Card purchases come on top. */
const accountSpent = (row: CheckInRow): Minor =>
	spentSince(minor(row.expectedMinor ?? 0), minor(row.balanceMinor ?? 0));

/** Spending that went on a card and never touched the account: the part of `spent` above it. */
export const cardSpentOf = (row: CheckInRow): Minor =>
	minor(Math.max(0, (row.spentMinor ?? 0) - accountSpent(row)));

/** Each open loan's expected balance, given the payment answers saved so far. */
export function loanLines(
	db: Db,
	ownerId: number,
	ctx: Context,
	checkInId: number
): LoanExpectation[] {
	return loanExpectations(db, ownerId, ctx.plan, savedAnswers(db, checkInId), ctx.outstanding);
}

/**
 * Saves each loan's confirmed balance (zero is allowed) against this check-in. A credit card that
 * grew past its expected balance means purchases, and those are added to what was spent: they never
 * touched the account, so the account alone cannot show them. The loans themselves take the new
 * balances only when the check-in is saved, so stopping it leaves them as they were.
 */
export function saveLoans(
	db: Db,
	ownerId: number,
	id: number,
	now: Date,
	answers: ReadonlyMap<number, Minor>
): void {
	const row = openAt(db, ownerId, id, 'loans');
	const ctx = checkInContext(db, ownerId, now);
	if (!ctx) throw new CheckInError('There is no balance to check in from yet.');
	const lines = loanLines(db, ownerId, ctx, id);
	for (const line of lines) {
		if (!answers.has(Number(line.loan.id))) throw new CheckInError('Every loan needs a balance.');
	}
	let purchases = minor(0);
	for (const line of lines) {
		if (line.loan.type === 'credit-card') {
			purchases = add(purchases, cardPurchases(answers.get(Number(line.loan.id))!, line.expected));
		}
	}
	db.transaction((tx) => {
		tx.delete(loanBalance).where(eq(loanBalance.checkInId, id)).run();
		for (const line of lines) {
			tx.insert(loanBalance)
				.values({
					loanId: Number(line.loan.id),
					checkInId: id,
					asOf: ctx.plan.today,
					balanceMinor: answers.get(Number(line.loan.id))!,
					source: 'check-in'
				})
				.run();
		}
		tx.update(checkIn)
			.set({ spentMinor: add(accountSpent(row), purchases), currentStep: 'finish' })
			.where(eq(checkIn.id, id))
			.run();
	});
}

/** Saves the check-in, its duration, and the new balance on the account, dated today. */
export function finishCheckIn(db: Db, ownerId: number, id: number, now: Date): CheckInRow {
	const row = openAt(db, ownerId, id, 'finish');
	const ctx = checkInContext(db, ownerId, now);
	if (!ctx || row.balanceMinor === null) throw new CheckInError('This check-in has no balance.');
	const started = Date.parse(row.startedAt);
	const seconds = Math.max(0, Math.round((now.getTime() - started) / 1000));
	return db.transaction((tx) => {
		// Before the balance is saved: from then on these expenses no longer count (ADR-0012).
		const logged = countingExpenses(tx as unknown as Db, ownerId);
		tx.update(checkIn)
			.set({
				loggedMinor: logged.expenses.length > 0 ? logged.total : null,
				finishedAt: nowIso(now),
				durationSeconds: seconds,
				currentStep: 'done',
				asOf: ctx.plan.today
			})
			.where(eq(checkIn.id, id))
			.run();
		// A transaction answers the same queries as the database; the cast only satisfies the type.
		// Read at the balance step, not now: an expense logged since then is not in this balance.
		const readAt = row.balanceReadAt ? new Date(row.balanceReadAt) : now;
		setBalance(tx as unknown as Db, ownerId, minor(row.balanceMinor!), ctx.plan.today, readAt);
		applyCheckInBalances(tx as unknown as Db, id, ctx.plan.today);
		return readCheckIn(tx as unknown as Db, ownerId, id)!;
	});
}

/** Goes back one step to change an answer. Nothing already saved is lost. */
export function goBack(db: Db, ownerId: number, id: number): void {
	const row = openAt(db, ownerId, id, 'balance', 'spending', 'payments', 'loans', 'finish');
	let previous = CHECKIN_STEPS[CHECKIN_STEPS.indexOf(stepOf(row)) - 1];
	// With no loans there was no loans step to come back to.
	if (previous === 'loans' && listLoans(db, ownerId).length === 0) previous = 'payments';
	setStep(db, id, previous);
}

/** Throws a check-in away before it is finished. */
export function discardCheckIn(db: Db, ownerId: number, id: number): void {
	const row = readCheckIn(db, ownerId, id);
	if (!row || row.finishedAt !== null) return;
	db.transaction((tx) => {
		tx.delete(paymentConfirmation).where(eq(paymentConfirmation.checkInId, id)).run();
		discardCheckInBalances(tx as unknown as Db, id);
		tx.delete(checkIn).where(eq(checkIn.id, id)).run();
	});
}
