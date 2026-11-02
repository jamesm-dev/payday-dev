/**
 * Reading and writing the owner's loans. A loan's payments are never stored here: they are the
 * schedule item the loan links to, so the safe-to-spend number (which reads the schedule) counts each
 * payment exactly once, whether or not the item is also a loan. Nothing in this file touches an item.
 */
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { parseCalDate, type CalDate } from '#lib/domain/dates.ts';
import {
	accrualDates,
	expectedLoanBalance,
	isLoanType,
	paymentPlanFor,
	type Loan
} from '#lib/domain/loans.ts';
import { minor, sum, type Minor } from '#lib/domain/money.ts';
import { expand, type Occurrence } from '#lib/domain/schedule.ts';
import { addDays } from '#lib/domain/dates.ts';
import type { Db } from '#lib/server/db/open.ts';
import { checkIn, loan, loanBalance } from '#lib/server/db/schema.ts';
import { occurrenceKey, type PaymentStatus } from './checkinForm.ts';
import type { LoanFields } from './loanForm.ts';
import { getItem, type Plan } from './store.ts';

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
export function listLoans(db: Db, ownerId: number): LoanRecord[] {
	return db
		.select()
		.from(loan)
		.where(and(eq(loan.ownerId, ownerId), isNull(loan.closedAt)))
		.orderBy(loan.id)
		.all()
		.map(rowToLoan);
}

export function getLoan(db: Db, ownerId: number, id: number): LoanRecord | null {
	const row = db
		.select()
		.from(loan)
		.where(and(eq(loan.id, id), eq(loan.ownerId, ownerId)))
		.get();
	return row ? rowToLoan(row) : null;
}

/** The open loan that already carries this schedule item's payments, if any. */
export function loanForItem(db: Db, ownerId: number, itemId: number): LoanRecord | null {
	const row = db
		.select()
		.from(loan)
		.where(and(eq(loan.ownerId, ownerId), eq(loan.scheduleItemId, itemId), isNull(loan.closedAt)))
		.get();
	return row ? rowToLoan(row) : null;
}

/**
 * Throws unless the item exists, is not pay, and is not already another loan's payment: one payment
 * belongs to one loan, or the same money would be taken off two balances.
 */
function checkLink(db: Db, ownerId: number, itemId: number | null, exceptLoanId?: number): void {
	if (itemId === null) return;
	const item = getItem(db, ownerId, itemId);
	if (!item) throw new LoanError('That payment is not on your schedule.');
	if (item.kind === 'income') throw new LoanError('Pay cannot be a loan payment.');
	const taken = loanForItem(db, ownerId, itemId);
	if (taken && String(taken.id) !== String(exceptLoanId)) {
		throw new LoanError(`That payment already belongs to ${taken.name}.`);
	}
}

/** Adds a loan and its first balance. Linking an item changes nothing about the item. */
export function createLoan(
	db: Db,
	ownerId: number,
	fields: LoanFields,
	today: CalDate
): LoanRecord {
	checkLink(db, ownerId, fields.scheduleItemId);
	return db.transaction((tx) => {
		const row = tx
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
			.returning()
			.get();
		tx.insert(loanBalance)
			.values({
				loanId: row.id,
				checkInId: null,
				asOf: today,
				balanceMinor: fields.balance,
				source: 'entered'
			})
			.run();
		return rowToLoan(row);
	});
}

/**
 * Replaces a loan's fields. The balance is dated today, and recorded, only when it changed. The kind
 * cannot change: a card and a plan keep different fields.
 */
export function updateLoan(
	db: Db,
	ownerId: number,
	id: number,
	fields: LoanFields,
	today: CalDate
): boolean {
	const existing = getLoan(db, ownerId, id);
	if (!existing || existing.closedAt !== null) return false;
	if (existing.type !== fields.type) throw new LoanError('A loan cannot change kind.');
	checkLink(db, ownerId, fields.scheduleItemId, id);
	db.transaction((tx) => {
		const changed = existing.balance !== fields.balance;
		tx.update(loan)
			.set({
				name: fields.name,
				lender: fields.lender,
				rateBp: fields.rateBp,
				scheduleItemId: fields.scheduleItemId,
				minPctBp: fields.minPctBp,
				minFloorMinor: fields.minFloor,
				...(changed ? { balanceMinor: fields.balance, balanceAsOf: today } : {})
			})
			.where(eq(loan.id, id))
			.run();
		if (changed) {
			tx.insert(loanBalance)
				.values({
					loanId: id,
					checkInId: null,
					asOf: today,
					balanceMinor: fields.balance,
					source: 'entered'
				})
				.run();
		}
	});
	return true;
}

/** Marks a loan paid off: its balance is zero and it leaves the list. Nothing is deleted. */
export function closeLoan(db: Db, ownerId: number, id: number, today: CalDate, now: Date): boolean {
	const existing = getLoan(db, ownerId, id);
	if (!existing || existing.closedAt !== null) return false;
	db.transaction((tx) => {
		tx.update(loan)
			.set({ balanceMinor: 0, balanceAsOf: today, closedAt: now.toISOString() })
			.where(eq(loan.id, id))
			.run();
		tx.insert(loanBalance)
			.values({ loanId: id, checkInId: null, asOf: today, balanceMinor: 0, source: 'entered' })
			.run();
	});
	return true;
}

// ---- Balances at check-ins ----

/** The balances confirmed at one check-in, by loan id. */
export function checkInBalances(db: Db, checkInId: number): Map<number, Minor> {
	const out = new Map<number, Minor>();
	for (const row of db
		.select()
		.from(loanBalance)
		.where(eq(loanBalance.checkInId, checkInId))
		.all()) {
		out.set(row.loanId, minor(row.balanceMinor));
	}
	return out;
}

export type TotalAtCheckIn = { checkInId: number; asOf: CalDate; total: Minor };

/** The total owed at each finished check-in, newest first. */
export function listTotals(db: Db, ownerId: number): TotalAtCheckIn[] {
	const rows = db
		.select({
			checkInId: checkIn.id,
			asOf: checkIn.asOf,
			total: sql<number>`sum(${loanBalance.balanceMinor})`
		})
		.from(loanBalance)
		.innerJoin(checkIn, eq(checkIn.id, loanBalance.checkInId))
		.innerJoin(loan, eq(loan.id, loanBalance.loanId))
		.where(
			and(eq(checkIn.ownerId, ownerId), eq(loan.ownerId, ownerId), isNotNull(checkIn.finishedAt))
		)
		.groupBy(checkIn.id)
		.orderBy(desc(checkIn.id))
		.all();
	return rows.map((r) => ({
		checkInId: r.checkInId,
		asOf: parseCalDate(r.asOf),
		total: minor(r.total)
	}));
}

/** Makes the balances a finished check-in confirmed the loans' own. Called as the check-in is saved. */
export function applyCheckInBalances(tx: Db, checkInId: number, asOf: CalDate): void {
	const rows = tx.select().from(loanBalance).where(eq(loanBalance.checkInId, checkInId)).all();
	for (const row of rows) {
		tx.update(loan)
			.set({ balanceMinor: row.balanceMinor, balanceAsOf: asOf })
			.where(and(eq(loan.id, row.loanId), isNull(loan.closedAt)))
			.run();
	}
}

/** Drops the balances a check-in recorded, when it is thrown away. */
export function discardCheckInBalances(tx: Db, checkInId: number): void {
	tx.delete(loanBalance).where(eq(loanBalance.checkInId, checkInId)).run();
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
export function loanExpectations(
	db: Db,
	ownerId: number,
	plan: Plan,
	answers: ReadonlyMap<string, PaymentStatus>,
	carried: readonly Occurrence[]
): LoanExpectation[] {
	return listLoans(db, ownerId).map((record) => {
		const asOf = record.balanceAsOf;
		const itemPlan = paymentPlanFor(record, plan.items, plan.overrides, asOf);
		const { cadence, dates } = accrualDates(itemPlan, asOf, plan.today);

		const paid = new Map<string, Occurrence>();
		const item = plan.items.find((i) => i.id === record.scheduleItemId);
		if (item) {
			const mine = plan.overrides.filter((o) => o.itemId === item.id);
			for (const o of expand([item], mine, addDays(asOf, 1), plan.today)) {
				const key = occurrenceKey(o.itemId, o.originalDate);
				if (answers.get(key) !== 'missed') paid.set(key, o);
			}
			for (const o of carried) {
				const key = occurrenceKey(o.itemId, o.originalDate);
				if (o.itemId === item.id && answers.get(key) === 'paid') paid.set(key, o);
			}
		}
		const payments = [...paid.values()];
		return {
			loan: record,
			expected: expectedLoanBalance({
				balance: record.balance,
				rateBp: record.rateBp,
				cadence,
				accruals: dates,
				paid: payments.map((o) => ({ date: o.date, amount: o.amount }))
			}),
			paid: sum(payments.map((o) => o.amount))
		};
	});
}

/** The total owed across open loans. */
export function totalOwed(loans: readonly Pick<Loan, 'balance'>[]): Minor {
	return sum(loans.map((l) => l.balance));
}

/** Ids of the open loans, for validating a check-in form. */
export function openLoanIds(db: Db, ownerId: number): number[] {
	return listLoans(db, ownerId).map((l) => Number(l.id));
}
