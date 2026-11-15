/**
 * Reading and writing the owner's loans. A loan's payments are never stored here: they are the
 * schedule item the loan links to, so the safe-to-spend number (which reads the schedule) counts each
 * payment exactly once, whether or not the item is also a loan. Nothing in this file touches an item.
 */
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { parseCalDate, type CalDate } from '#lib/domain/dates.ts';
import {
	accrualDates,
	expectedLoanBalance,
	isLoanType,
	earlyLoanPayments,
	loanPaidList,
	paymentPlanFor,
	type Loan
} from '#lib/domain/loans.ts';
import { minor, sum, type Minor } from '#lib/domain/money.ts';
import { expand, type Occurrence } from '#lib/domain/schedule.ts';
import { addDays } from '#lib/domain/dates.ts';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import { checkIn, loan, loanBalance } from '#lib/server/db/schema.ts';
import { occurrenceKey, type PaymentStatus } from './checkinForm.ts';
import type { LoanFields } from './loanForm.ts';
import { getItem, standingPaidMarks, type Plan } from './store.ts';

/** A stored loan: the domain's `Loan`, plus what only the screens use. */
export type LoanRecord = Loan & {
	lender: string | null;
	createdAt: string;
	closedAt: string | null;
};

type LoanRow = typeof loan.$inferSelect;

export class LoanError extends Error {}

export function rowToLoan(row: LoanRow): LoanRecord {
	if (!isLoanType(row.type)) throw new Error(`Unknown loan type: ${row.type}`);
	return {
		id: String(row.id),
		type: row.type,
		name: row.name,
		lender: row.lender,
		balance: minor(row.balanceMinor),
		balanceAsOf: parseCalDate(row.balanceAsOf),
		rateBp: row.rateBp,
		scheduleItemId: row.scheduleItemId === null ? null : String(row.scheduleItemId),
		minPctBp: row.minPctBp,
		minFloor: row.minFloorMinor === null ? null : minor(row.minFloorMinor),
		createdAt: row.createdAt,
		closedAt: row.closedAt
	};
}

/** Loans still being paid, oldest first. Closed (paid off) loans stay in the database. */
export async function listLoans(db: Db, ownerId: number): Promise<LoanRecord[]> {
	const rows = await db
		.select()
		.from(loan)
		.where(and(eq(loan.ownerId, ownerId), isNull(loan.closedAt)))
		.orderBy(loan.id);
	return rows.map(rowToLoan);
}

export async function getLoan(db: Db, ownerId: number, id: number): Promise<LoanRecord | null> {
	const [row] = await db
		.select()
		.from(loan)
		.where(and(eq(loan.id, id), eq(loan.ownerId, ownerId)));
	return row ? rowToLoan(row) : null;
}

/** The open loan that already carries this schedule item's payments, if any. */
export async function loanForItem(
	db: Db,
	ownerId: number,
	itemId: number
): Promise<LoanRecord | null> {
	const [row] = await db
		.select()
		.from(loan)
		.where(and(eq(loan.ownerId, ownerId), eq(loan.scheduleItemId, itemId), isNull(loan.closedAt)))
		.limit(1);
	return row ? rowToLoan(row) : null;
}

/**
 * Throws unless the item exists, is not pay, and is not already another loan's payment: one payment
 * belongs to one loan, or the same money would be taken off two balances.
 */
async function checkLink(
	db: Db,
	ownerId: number,
	itemId: number | null,
	exceptLoanId?: number
): Promise<void> {
	if (itemId === null) return;
	const item = await getItem(db, ownerId, itemId);
	if (!item) throw new LoanError('That payment is not on your schedule.');
	if (item.kind === 'income') throw new LoanError('Pay cannot be a loan payment.');
	const taken = await loanForItem(db, ownerId, itemId);
	if (taken && String(taken.id) !== String(exceptLoanId)) {
		throw new LoanError(`That payment already belongs to ${taken.name}.`);
	}
}

/** Adds a loan and its first balance. Linking an item changes nothing about the item. */
export async function createLoan(
	db: Db,
	ownerId: number,
	fields: LoanFields,
	today: CalDate
): Promise<LoanRecord> {
	return db.transaction(async (tx) => {
		// The owner lock makes the link check and the insert one step: two loans cannot both claim an item.
		await lockOwner(tx, ownerId);
		await checkLink(tx, ownerId, fields.scheduleItemId);
		const [row] = await tx
			.insert(loan)
			.values({
				ownerId,
				type: fields.type,
				name: fields.name,
				lender: fields.lender,
				balanceMinor: fields.balance,
				balanceAsOf: today,
				rateBp: fields.rateBp,
				scheduleItemId: fields.scheduleItemId,
				minPctBp: fields.minPctBp,
				minFloorMinor: fields.minFloor
			})
			.returning();
		await tx.insert(loanBalance).values({
			loanId: row.id,
			checkInId: null,
			asOf: today,
			balanceMinor: fields.balance,
			source: 'entered'
		});
		return rowToLoan(row);
	});
}

/**
 * Replaces a loan's fields. The balance is dated today, and recorded, only when it changed. The kind
 * cannot change: a card and a plan keep different fields.
 */
export async function updateLoan(
	db: Db,
	ownerId: number,
	id: number,
	fields: LoanFields,
	today: CalDate
): Promise<boolean> {
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		// Read under the lock: a loan closed (or changed) while this waited is seen as it now is.
		const existing = await getLoan(tx, ownerId, id);
		if (!existing || existing.closedAt !== null) return false;
		if (existing.type !== fields.type) throw new LoanError('A loan cannot change kind.');
		await checkLink(tx, ownerId, fields.scheduleItemId, id);
		const changed = existing.balance !== fields.balance;
		await tx
			.update(loan)
			.set({
				name: fields.name,
				lender: fields.lender,
				rateBp: fields.rateBp,
				scheduleItemId: fields.scheduleItemId,
				minPctBp: fields.minPctBp,
				minFloorMinor: fields.minFloor,
				...(changed ? { balanceMinor: fields.balance, balanceAsOf: today } : {})
			})
			.where(and(eq(loan.id, id), eq(loan.ownerId, ownerId), isNull(loan.closedAt)));
		if (changed) {
			await tx.insert(loanBalance).values({
				loanId: id,
				checkInId: null,
				asOf: today,
				balanceMinor: fields.balance,
				source: 'entered'
			});
		}
		return true;
	});
}

/** Marks a loan paid off: its balance is zero and it leaves the list. Nothing is deleted. */
export async function closeLoan(
	db: Db,
	ownerId: number,
	id: number,
	today: CalDate,
	now: Date
): Promise<boolean> {
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		const existing = await getLoan(tx, ownerId, id);
		if (!existing || existing.closedAt !== null) return false;
		const closed = await tx
			.update(loan)
			.set({ balanceMinor: 0, balanceAsOf: today, closedAt: now.toISOString() })
			.where(and(eq(loan.id, id), eq(loan.ownerId, ownerId), isNull(loan.closedAt)))
			.returning({ id: loan.id });
		if (closed.length === 0) return false;
		await tx
			.insert(loanBalance)
			.values({ loanId: id, checkInId: null, asOf: today, balanceMinor: 0, source: 'entered' });
		return true;
	});
}

// ---- Balances at check-ins ----

/** The check-in ids with this id that belong to this owner: none, for anyone else's. */
const ownCheckIn = (db: Db, ownerId: number, checkInId: number) =>
	db
		.select({ id: checkIn.id })
		.from(checkIn)
		.where(and(eq(checkIn.id, checkInId), eq(checkIn.ownerId, ownerId)));

/** The balances confirmed at one of the owner's check-ins, by loan id. */
export async function checkInBalances(
	db: Db,
	ownerId: number,
	checkInId: number
): Promise<Map<number, Minor>> {
	const out = new Map<number, Minor>();
	const rows = await db
		.select()
		.from(loanBalance)
		.where(
			and(
				eq(loanBalance.checkInId, checkInId),
				inArray(loanBalance.checkInId, ownCheckIn(db, ownerId, checkInId))
			)
		);
	for (const row of rows) {
		out.set(row.loanId, minor(row.balanceMinor));
	}
	return out;
}

export type TotalAtCheckIn = { checkInId: number; asOf: CalDate; total: Minor };

/** The total owed at each finished check-in, newest first. */
export async function listTotals(db: Db, ownerId: number): Promise<TotalAtCheckIn[]> {
	const rows = await db
		.select({
			checkInId: checkIn.id,
			asOf: checkIn.asOf,
			// Postgres sums bigints as numeric, which drivers hand back as text.
			total: sql<number>`sum(${loanBalance.balanceMinor})`.mapWith(Number)
		})
		.from(loanBalance)
		.innerJoin(checkIn, eq(checkIn.id, loanBalance.checkInId))
		.innerJoin(loan, eq(loan.id, loanBalance.loanId))
		.where(
			and(eq(checkIn.ownerId, ownerId), eq(loan.ownerId, ownerId), isNotNull(checkIn.finishedAt))
		)
		.groupBy(checkIn.id)
		.orderBy(desc(checkIn.id));
	return rows.map((r) => ({
		checkInId: r.checkInId,
		asOf: parseCalDate(r.asOf),
		total: minor(r.total)
	}));
}

/** Makes the balances a finished check-in confirmed the loans' own. Called as the check-in is saved. */
export async function applyCheckInBalances(
	tx: Db,
	ownerId: number,
	checkInId: number,
	asOf: CalDate
): Promise<void> {
	const rows = await tx
		.select()
		.from(loanBalance)
		.where(
			and(
				eq(loanBalance.checkInId, checkInId),
				inArray(loanBalance.checkInId, ownCheckIn(tx, ownerId, checkInId))
			)
		);
	for (const row of rows) {
		await tx
			.update(loan)
			.set({ balanceMinor: row.balanceMinor, balanceAsOf: asOf })
			.where(and(eq(loan.id, row.loanId), eq(loan.ownerId, ownerId), isNull(loan.closedAt)));
	}
}

/** Drops the balances a check-in recorded, when it is thrown away. */
export async function discardCheckInBalances(
	tx: Db,
	ownerId: number,
	checkInId: number
): Promise<void> {
	await tx
		.delete(loanBalance)
		.where(
			and(
				eq(loanBalance.checkInId, checkInId),
				inArray(loanBalance.checkInId, ownCheckIn(tx, ownerId, checkInId))
			)
		);
}

// ---- What each loan should owe now ----

export type LoanExpectation = {
	loan: LoanRecord;
	expected: Minor;
	/** The payments counted off: confirmed paid since the balance. */
	paid: Minor;
};

/**
 * Each open loan's expected balance at a check-in: its last balance plus the interest its periods
 * charged since, less the payments of its schedule item that went out. A payment is taken off unless
 * this check-in marked it missed; payments marked missed at earlier check-ins come back through
 * `carried` and are taken off only when this one confirms them paid.
 */
export async function loanExpectations(
	db: Db,
	ownerId: number,
	plan: Plan,
	answers: ReadonlyMap<string, PaymentStatus>,
	carried: readonly Occurrence[]
): Promise<LoanExpectation[]> {
	const marks = await standingPaidMarks(db, ownerId, plan.items, plan.settings.timeZone);
	// A payment this update answered "did not go out" is not early: its money is kept (Q2).
	const missed = new Set([...answers].filter(([, v]) => v === 'missed').map(([k]) => k));
	const records = await listLoans(db, ownerId);
	const readAts = await Promise.all(records.map((r) => loanReadAt(db, ownerId, r)));
	return records.map((record, index) => {
		const asOf = record.balanceAsOf;
		const early = earlyLoanPayments({
			itemId: record.scheduleItemId,
			items: plan.items,
			overrides: plan.overrides,
			marks,
			asOf,
			readAt: readAts[index],
			missed
		});
		const itemPlan = paymentPlanFor(record, plan.items, plan.overrides, asOf, early.keys);
		const { cadence, dates } = accrualDates(itemPlan, asOf, plan.today);

		const paid = new Map<string, Occurrence>();
		const item = plan.items.find((i) => i.id === record.scheduleItemId);
		if (item) {
			const mine = plan.overrides.filter((o) => o.itemId === item.id);
			for (const o of expand([item], mine, addDays(asOf, 1), plan.today)) {
				const key = occurrenceKey(o.itemId, o.originalDate);
				// Paid early ones are dropped by `loanPaidList` below.
				if (answers.get(key) !== 'missed') paid.set(key, o);
			}
			for (const o of carried) {
				const key = occurrenceKey(o.itemId, o.originalDate);
				if (o.itemId === item.id && answers.get(key) === 'paid') paid.set(key, o);
			}
		}
		const paidList = loanPaidList({
			assumed: [...paid].map(([key, o]) => ({ key, date: o.date, amount: o.amount })),
			early,
			today: plan.today
		});
		return {
			loan: record,
			expected: expectedLoanBalance({
				balance: record.balance,
				rateBp: record.rateBp,
				cadence,
				accruals: dates,
				paid: paidList
			}),
			paid: sum(paidList.map((p) => p.amount))
		};
	});
}

/**
 * When the balance a loan holds was read (ISO), for an early payment made the same day: only a
 * check-in's balance has a real read time, and only while the loan still holds that check-in's day.
 * It is the moment the loans step saved the loan's figure (the lender's number is read there, later
 * than the account's); a balance saved without one (an older check-in) takes the account balance's.
 */
export async function loanReadAt(
	db: Db,
	ownerId: number,
	record: LoanRecord
): Promise<string | null> {
	const [last] = await db
		.select({ id: checkIn.id, asOf: checkIn.asOf, readAt: checkIn.balanceReadAt })
		.from(checkIn)
		.where(and(eq(checkIn.ownerId, ownerId), isNotNull(checkIn.finishedAt)))
		.orderBy(desc(checkIn.id))
		.limit(1);
	if (!last || last.asOf !== record.balanceAsOf) return null;
	const [saved] = await db
		.select({ readAt: loanBalance.readAt })
		.from(loanBalance)
		.where(and(eq(loanBalance.checkInId, last.id), eq(loanBalance.loanId, Number(record.id))));
	return saved?.readAt ?? last.readAt;
}

/** The total owed across open loans. */
export function totalOwed(loans: readonly Pick<Loan, 'balance'>[]): Minor {
	return sum(loans.map((l) => l.balance));
}

/** Ids of the open loans, for validating a check-in form. */
export async function openLoanIds(db: Db, ownerId: number): Promise<number[]> {
	return (await listLoans(db, ownerId)).map((l) => Number(l.id));
}
