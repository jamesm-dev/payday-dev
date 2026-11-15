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
	paymentsSince,
	spentSince,
	type Base,
	type PaidEarlyLine
} from '#lib/domain/checkin.ts';
import { parseCalDate } from '#lib/domain/dates.ts';
import { cardPurchases } from '#lib/domain/loans.ts';
import { add, minor, sum, type Minor } from '#lib/domain/money.ts';
import type { Item, Occurrence, PaidMark } from '#lib/domain/schedule.ts';
import { lockOwner } from '#lib/server/db/lock.ts';
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
import { ensureAccount, loadPlan, setBalance, standingPaidMarks, type Plan } from './store.ts';

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
export async function listOutstanding(
	db: Db,
	ownerId: number,
	items: readonly Item[]
): Promise<Occurrence[]> {
	const rows = await db
		.select({ pc: paymentConfirmation, checkInId: checkIn.id })
		.from(paymentConfirmation)
		.innerJoin(checkIn, eq(checkIn.id, paymentConfirmation.checkInId))
		.where(and(eq(checkIn.ownerId, ownerId), isNotNull(checkIn.finishedAt)))
		.orderBy(checkIn.id);
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

export async function getOpenCheckIn(db: Db, ownerId: number): Promise<CheckInRow | null> {
	const [row] = await db
		.select()
		.from(checkIn)
		.where(and(eq(checkIn.ownerId, ownerId), isNull(checkIn.finishedAt)))
		.orderBy(desc(checkIn.id))
		.limit(1);
	return row ?? null;
}

export function listFinished(db: Db, ownerId: number): Promise<CheckInRow[]> {
	return db
		.select()
		.from(checkIn)
		.where(and(eq(checkIn.ownerId, ownerId), isNotNull(checkIn.finishedAt)))
		.orderBy(desc(checkIn.id));
}

export const getLatestFinished = async (db: Db, ownerId: number): Promise<CheckInRow | null> => {
	const [row] = await db
		.select()
		.from(checkIn)
		.where(and(eq(checkIn.ownerId, ownerId), isNotNull(checkIn.finishedAt)))
		.orderBy(desc(checkIn.id))
		.limit(1);
	return row ?? null;
};

export async function readCheckIn(db: Db, ownerId: number, id: number): Promise<CheckInRow | null> {
	const [row] = await db
		.select()
		.from(checkIn)
		.where(and(eq(checkIn.id, id), eq(checkIn.ownerId, ownerId)));
	return row ?? null;
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
	/** The paid marks standing now: the early ones are answered already (ADR-0020). */
	marks: PaidMark[];
	/** When the balance `base` came from was read (ISO), for a mark made the same day. */
	readAt: string | null;
};

/** The plan, the balance to start from and the missed payments still owed. Null with no balance yet. */
export async function checkInContext(db: Db, ownerId: number, now: Date): Promise<Context | null> {
	const plan = await loadPlan(db, ownerId, now);
	if (!plan.balance) return null;
	return {
		plan,
		base: { amount: plan.balance.amount, asOf: plan.balance.asOf },
		outstanding: await listOutstanding(db, ownerId, plan.items),
		marks: await standingPaidMarks(db, ownerId, plan.items, plan.settings.timeZone),
		readAt: (await ensureAccount(db, ownerId)).balanceSavedAt
	};
}

/** The pay scheduled since the balance, and its total: what step 1 offers to confirm. */
export function scheduledPay(ctx: Context): { total: Minor; lines: Occurrence[] } {
	const lines = incomeDueSince(ctx.plan.items, ctx.plan.overrides, ctx.base.asOf, ctx.plan.today);
	return { total: sum(lines.map((o) => o.amount)), lines };
}

/**
 * The payments since the balance, split: those to ask about, those paid early (shown answered, or
 * only taken off the balance), and the ones to subtract. `missed` is this update's "did not go out"
 * answers: such a payment is not early and is asked and reserved as ever (owner's answer Q2).
 */
export function paymentsOf(
	ctx: Context,
	missed?: ReadonlySet<string>,
	/** When this update's own balance was read: an early payment made after it is the next update's. */
	todayReadAt?: string | null
) {
	return paymentsSince({
		items: ctx.plan.items,
		overrides: ctx.plan.overrides,
		since: ctx.base.asOf,
		today: ctx.plan.today,
		marks: ctx.marks,
		sinceReadAt: ctx.readAt,
		todayReadAt,
		missed
	});
}

/** Every payment step 4 asks about: those due since the balance, then those still owed. */
export function paymentLines(ctx: Context, missed?: ReadonlySet<string>): PaymentLine[] {
	const due = paymentsOf(ctx, missed).asked;
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

export type EarlyLine = { key: string; line: PaidEarlyLine };

/** The payments of this update paid early: already answered, needing no answer. */
export function earlyLines(ctx: Context, missed?: ReadonlySet<string>): EarlyLine[] {
	return paymentsOf(ctx, missed)
		.paidEarly.filter((l) => l.inWindow)
		.map((line) => ({
			key: occurrenceKey(line.occurrence.itemId, line.occurrence.originalDate),
			line
		}));
}

const payLanded = (row: CheckInRow): Minor => minor(row.payLanded ? (row.payAmountMinor ?? 0) : 0);

/** The answers saved for this check-in's payments, by occurrence key. */
export async function savedAnswers(db: Db, checkInId: number): Promise<Map<string, PaymentStatus>> {
	const out = new Map<string, PaymentStatus>();
	const saved = await db
		.select()
		.from(paymentConfirmation)
		.where(eq(paymentConfirmation.checkInId, checkInId));
	for (const pc of saved) {
		if (pc.status === 'paid' || pc.status === 'missed') {
			out.set(occurrenceKey(String(pc.itemId), pc.originalDate), pc.status);
		}
	}
	return out;
}

// ---- Writing: one function per step ----

export class CheckInError extends Error {}

/**
 * Starts a check-in, or returns the one already under way. Under the owner lock, so two taps on
 * "Start" cannot both find none and open two (a partial unique index backs this up).
 */
export async function startCheckIn(db: Db, ownerId: number, now: Date): Promise<CheckInRow> {
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		const open = await getOpenCheckIn(tx, ownerId);
		if (open) return open;
		const ctx = await checkInContext(tx, ownerId, now);
		if (!ctx) throw new CheckInError('There is no balance for a payday update yet.');
		const [row] = await tx
			.insert(checkIn)
			.values({ ownerId, startedAt: nowIso(now), currentStep: 'pay', asOf: ctx.plan.today })
			.returning();
		return row;
	});
}

/** Throws unless the check-in is open and at one of the steps. */
async function openAt(
	db: Db,
	ownerId: number,
	id: number,
	...steps: CheckInStep[]
): Promise<CheckInRow> {
	const row = await readCheckIn(db, ownerId, id);
	if (!row || row.finishedAt !== null) throw new CheckInError('This payday update is not open.');
	if (!steps.includes(stepOf(row))) throw new CheckInError('This step is not the current one.');
	return row;
}

/**
 * Runs one step of a check-in as a unit. The owner lock comes first and the check-in is read AFTER
 * it, inside the transaction, so a double tap (or two devices) waits its turn and then finds the
 * step already done: it gets the same "not the current one" refusal as any out-of-turn post, which
 * the page turns into a redirect, and writes nothing.
 */
async function inStep<T>(
	db: Db,
	ownerId: number,
	id: number,
	steps: CheckInStep[],
	run: (tx: Db, row: CheckInRow) => Promise<T>
): Promise<T> {
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		const row = await openAt(tx, ownerId, id, ...steps);
		return run(tx, row);
	});
}

/**
 * Moves the check-in on from `from`. The update only lands on a check-in that is still open and
 * still at `from`; no row means someone else got there first, which is the double-tap path.
 */
async function setStep(
	tx: Db,
	id: number,
	from: CheckInStep,
	to: CheckInStep,
	extra: Partial<CheckInRow> = {}
): Promise<void> {
	const moved = await tx
		.update(checkIn)
		.set({ ...extra, currentStep: to })
		.where(and(eq(checkIn.id, id), eq(checkIn.currentStep, from), isNull(checkIn.finishedAt)))
		.returning({ id: checkIn.id });
	if (moved.length === 0) throw new CheckInError('This step is not the current one.');
}

export async function savePay(
	db: Db,
	ownerId: number,
	id: number,
	answer: PayAnswer
): Promise<void> {
	await inStep(db, ownerId, id, ['pay'], (tx) =>
		setStep(tx, id, 'pay', 'balance', {
			payLanded: answer.landed,
			payAmountMinor: answer.amount
		})
	);
}

/**
 * Saves the balance and works out, for now, what was spent. Until step 4 says which payments went
 * out, every payment due since the last balance is assumed paid, and a payment still owed from
 * before is assumed not.
 */
export async function saveBalanceStep(
	db: Db,
	ownerId: number,
	id: number,
	now: Date,
	balance: Minor
): Promise<void> {
	await inStep(db, ownerId, id, ['balance'], async (tx, row) => {
		const ctx = await checkInContext(tx, ownerId, now);
		if (!ctx) throw new CheckInError('There is no balance for a payday update yet.');
		// Until step 4, every payment due is assumed paid, and so is one paid early in the window.
		const { asked, subtracted } = paymentsOf(ctx, undefined, nowIso(now));
		const expected = expectedBalance({
			base: ctx.base,
			payLanded: payLanded(row),
			paid: [...asked, ...subtracted]
		});
		await setStep(tx, id, 'balance', 'spending', {
			balanceMinor: balance,
			// The moment the bank figure was read: finishing stamps the account's balance with it.
			balanceReadAt: nowIso(now),
			expectedMinor: expected,
			spentMinor: spentSince(expected, balance),
			asOf: ctx.plan.today
		});
	});
}

export async function acknowledgeSpending(db: Db, ownerId: number, id: number): Promise<void> {
	await inStep(db, ownerId, id, ['spending'], (tx) => setStep(tx, id, 'spending', 'payments'));
}

/**
 * Saves which payments went out, then settles the expected balance and the spending on those
 * answers. A payment confirmed paid leaves the account; one marked missed has not, and stays
 * reserved until a later check-in confirms it.
 */
export async function savePayments(
	db: Db,
	ownerId: number,
	id: number,
	now: Date,
	answers: ReadonlyMap<string, PaymentStatus>
): Promise<void> {
	await inStep(db, ownerId, id, ['payments'], async (tx, row) => {
		const ctx = await checkInContext(tx, ownerId, now);
		if (!ctx) throw new CheckInError('There is no balance for a payday update yet.');
		// "Did not go out" on a payment paid early outranks the mark: it becomes a line to answer.
		const missed = new Set([...answers].filter(([, v]) => v === 'missed').map(([k]) => k));
		const lines = paymentLines(ctx, missed);
		for (const line of lines) {
			if (!answers.has(line.key)) throw new CheckInError('Every payment needs an answer.');
		}
		const paid = lines.filter((l) => answers.get(l.key) === 'paid').map((l) => l.occurrence);
		// Payments paid early need no answer; they come off the balance too (never twice).
		const { subtracted } = paymentsOf(ctx, missed, row.balanceReadAt);
		const expected = expectedBalance({
			base: ctx.base,
			payLanded: payLanded(row),
			paid: [...paid, ...subtracted]
		});

		await tx.delete(paymentConfirmation).where(eq(paymentConfirmation.checkInId, id));
		for (const line of lines) {
			const o = line.occurrence;
			await tx.insert(paymentConfirmation).values({
				checkInId: id,
				itemId: Number(o.itemId),
				originalDate: o.originalDate,
				dueDate: o.date,
				amountMinor: o.amount,
				status: answers.get(line.key)!
			});
		}
		// Loans come next, when there are any to confirm; their balances are saved with that step.
		await setStep(
			tx,
			id,
			'payments',
			(await listLoans(tx, ownerId)).length > 0 ? 'loans' : 'finish',
			{
				expectedMinor: expected,
				spentMinor: spentSince(expected, minor(row.balanceMinor ?? 0))
			}
		);
	});
}

/** The account's own spending: what should be there, less what is. Card purchases come on top. */
const accountSpent = (row: CheckInRow): Minor =>
	spentSince(minor(row.expectedMinor ?? 0), minor(row.balanceMinor ?? 0));

/** Spending that went on a card and never touched the account: the part of `spent` above it. */
export const cardSpentOf = (row: CheckInRow): Minor =>
	minor(Math.max(0, (row.spentMinor ?? 0) - accountSpent(row)));

/** Each open loan's expected balance, given the payment answers saved so far. */
export async function loanLines(
	db: Db,
	ownerId: number,
	ctx: Context,
	checkInId: number
): Promise<LoanExpectation[]> {
	return loanExpectations(
		db,
		ownerId,
		ctx.plan,
		await savedAnswers(db, checkInId),
		ctx.outstanding
	);
}

/**
 * Saves each loan's confirmed balance (zero is allowed) against this check-in. A credit card that
 * grew past its expected balance means purchases, and those are added to what was spent: they never
 * touched the account, so the account alone cannot show them. The loans themselves take the new
 * balances only when the check-in is saved, so stopping it leaves them as they were.
 */
export async function saveLoans(
	db: Db,
	ownerId: number,
	id: number,
	now: Date,
	answers: ReadonlyMap<number, Minor>
): Promise<void> {
	await inStep(db, ownerId, id, ['loans'], async (tx, row) => {
		const ctx = await checkInContext(tx, ownerId, now);
		if (!ctx) throw new CheckInError('There is no balance for a payday update yet.');
		const lines = await loanLines(tx, ownerId, ctx, id);
		for (const line of lines) {
			if (!answers.has(Number(line.loan.id))) throw new CheckInError('Every loan needs a balance.');
		}
		let purchases = minor(0);
		for (const line of lines) {
			if (line.loan.type === 'credit-card') {
				purchases = add(
					purchases,
					cardPurchases(answers.get(Number(line.loan.id))!, line.expected)
				);
			}
		}
		await tx.delete(loanBalance).where(eq(loanBalance.checkInId, id));
		for (const line of lines) {
			await tx.insert(loanBalance).values({
				loanId: Number(line.loan.id),
				checkInId: id,
				asOf: ctx.plan.today,
				balanceMinor: answers.get(Number(line.loan.id))!,
				source: 'check-in',
				// The lender's figure is read now, at this step: marks made before it are in the figure.
				readAt: now.toISOString()
			});
		}
		await setStep(tx, id, 'loans', 'finish', { spentMinor: add(accountSpent(row), purchases) });
	});
}

/** Saves the check-in, its duration, and the new balance on the account, dated today. */
export async function finishCheckIn(
	db: Db,
	ownerId: number,
	id: number,
	now: Date
): Promise<CheckInRow> {
	return inStep(db, ownerId, id, ['finish'], async (tx, row) => {
		const ctx = await checkInContext(tx, ownerId, now);
		if (!ctx || row.balanceMinor === null)
			throw new CheckInError('This payday update has no balance.');
		const started = Date.parse(row.startedAt);
		const seconds = Math.max(0, Math.round((now.getTime() - started) / 1000));
		// Before the balance is saved: from then on these expenses no longer count (ADR-0012).
		const logged = await countingExpenses(tx, ownerId);
		const finished = await tx
			.update(checkIn)
			.set({
				loggedMinor: logged.expenses.length > 0 ? logged.total : null,
				finishedAt: nowIso(now),
				durationSeconds: seconds,
				currentStep: 'done',
				asOf: ctx.plan.today
			})
			.where(and(eq(checkIn.id, id), eq(checkIn.currentStep, 'finish'), isNull(checkIn.finishedAt)))
			.returning({ id: checkIn.id });
		if (finished.length === 0) throw new CheckInError('This step is not the current one.');
		// Read at the balance step, not now: an expense logged since then is not in this balance.
		const readAt = row.balanceReadAt ? new Date(row.balanceReadAt) : now;
		await setBalance(tx, ownerId, minor(row.balanceMinor!), ctx.plan.today, readAt);
		await applyCheckInBalances(tx, id, ctx.plan.today);
		return (await readCheckIn(tx, ownerId, id))!;
	});
}

/** Goes back one step to change an answer. Nothing already saved is lost. */
export async function goBack(db: Db, ownerId: number, id: number): Promise<void> {
	await inStep(
		db,
		ownerId,
		id,
		['balance', 'spending', 'payments', 'loans', 'finish'],
		async (tx, row) => {
			const from = stepOf(row);
			let previous = CHECKIN_STEPS[CHECKIN_STEPS.indexOf(from) - 1];
			// With no loans there was no loans step to come back to.
			if (previous === 'loans' && (await listLoans(tx, ownerId)).length === 0)
				previous = 'payments';
			await setStep(tx, id, from, previous);
		}
	);
}

/** Throws a check-in away before it is finished. */
export async function discardCheckIn(db: Db, ownerId: number, id: number): Promise<void> {
	await db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		const row = await readCheckIn(tx, ownerId, id);
		if (!row || row.finishedAt !== null) return;
		await tx.delete(paymentConfirmation).where(eq(paymentConfirmation.checkInId, id));
		await discardCheckInBalances(tx, id);
		await tx.delete(checkIn).where(eq(checkIn.id, id));
	});
}
