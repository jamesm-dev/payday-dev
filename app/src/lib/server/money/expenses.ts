/**
 * Daily expenses: what the owner logged as spent (Daily Expense Log). An expense lowers the
 * safe-to-spend number while it counts and is history after (ADR-0012). Every function is scoped to
 * one owner, and an id that is not theirs finds nothing. Amounts are integer minor units.
 */
import { and, desc, eq, gte } from 'drizzle-orm';
import { parseCalDate, type CalDate } from '#lib/domain/dates.ts';
import { minor, sum, type Minor } from '#lib/domain/money.ts';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import { account, expense } from '#lib/server/db/schema.ts';
import type { ExpenseInput } from './validate.ts';

type Row = typeof expense.$inferSelect;

export type ExpenseRow = {
	id: number;
	amount: Minor;
	/** What it was for; null when left empty. */
	note: string | null;
	spentOn: CalDate;
	/** ISO UTC; never changes on edit. */
	loggedAt: string;
	updatedAt: string;
};

/** One day of the list, with the day's total. */
export type ExpenseDay = { date: CalDate; total: Minor; expenses: ExpenseRow[] };

function toRow(row: Row): ExpenseRow {
	return {
		id: row.id,
		amount: minor(row.amountMinor),
		note: row.note,
		spentOn: parseCalDate(row.spentOn),
		loggedAt: row.loggedAt,
		updatedAt: row.updatedAt
	};
}

/** The balance an expense is weighed against: the day it was true on and when it was read. */
export type BalanceStamp = { asOf: CalDate; savedAt: string | null };

/**
 * ADR-0012, as amended: an expense counts when its day is after the balance's day, or on that day
 * and it was logged after the balance was read. A balance true on an earlier day cannot contain a
 * later day's expense, whenever it was typed in. A balance with no saved-at predates the rule and
 * is taken to have been read before every expense.
 */
export function counts(
	e: Pick<ExpenseRow, 'spentOn' | 'loggedAt'>,
	balance: BalanceStamp
): boolean {
	if (e.spentOn > balance.asOf) return true;
	return e.spentOn === balance.asOf && (balance.savedAt === null || e.loggedAt > balance.savedAt);
}

const newestFirst = [desc(expense.spentOn), desc(expense.id)];

/** Logs an expense. Returns it; `now` is when it was logged. */
export async function addExpense(
	db: Db,
	ownerId: number,
	input: ExpenseInput,
	now: Date
): Promise<ExpenseRow> {
	const at = now.toISOString();
	// Under the owner lock, so nothing is logged for an account deleted while this request waited.
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		const [row] = await tx
			.insert(expense)
			.values({
				ownerId,
				amountMinor: input.amount,
				note: input.note,
				spentOn: input.spentOn,
				loggedAt: at,
				updatedAt: at
			})
			.returning();
		return toRow(row);
	});
}

export async function getExpense(db: Db, ownerId: number, id: number): Promise<ExpenseRow | null> {
	const [row] = await db
		.select()
		.from(expense)
		.where(and(eq(expense.id, id), eq(expense.ownerId, ownerId)));
	return row ? toRow(row) : null;
}

/** Changes the amount, note and day. When it was logged stays, so the counting rule is unchanged. */
export async function updateExpense(
	db: Db,
	ownerId: number,
	id: number,
	input: ExpenseInput,
	now: Date
): Promise<boolean> {
	const changed = await db
		.update(expense)
		.set({
			amountMinor: input.amount,
			note: input.note,
			spentOn: input.spentOn,
			updatedAt: now.toISOString()
		})
		.where(and(eq(expense.id, id), eq(expense.ownerId, ownerId)))
		.returning({ id: expense.id });
	return changed.length > 0;
}

export async function removeExpense(db: Db, ownerId: number, id: number): Promise<boolean> {
	const removed = await db
		.delete(expense)
		.where(and(eq(expense.id, id), eq(expense.ownerId, ownerId)))
		.returning({ id: expense.id });
	return removed.length > 0;
}

/** Every expense, newest first, grouped by the day it was spent with each day's total. */
export async function listExpenseDays(db: Db, ownerId: number): Promise<ExpenseDay[]> {
	const days: ExpenseDay[] = [];
	const rows = await db
		.select()
		.from(expense)
		.where(eq(expense.ownerId, ownerId))
		.orderBy(...newestFirst);
	for (const row of rows) {
		const e = toRow(row);
		let day = days.at(-1);
		if (!day || day.date !== e.spentOn) {
			day = { date: e.spentOn, total: minor(0), expenses: [] };
			days.push(day);
		}
		day.expenses.push(e);
		day.total = minor(day.total + e.amount);
	}
	return days;
}

/** The owner's current balance as the counting rule sees it; null without one. */
async function currentStamp(db: Db, ownerId: number): Promise<BalanceStamp | null> {
	const [acct] = await db.select().from(account).where(eq(account.ownerId, ownerId));
	if (!acct || acct.balanceMinor === null || acct.balanceAsOf === null) return null;
	return { asOf: parseCalDate(acct.balanceAsOf), savedAt: acct.balanceSavedAt };
}

/** Whether this expense counts against the owner's current balance (false without a balance). */
export async function expenseCounts(
	db: Db,
	ownerId: number,
	e: Pick<ExpenseRow, 'spentOn' | 'loggedAt'>
): Promise<boolean> {
	const stamp = await currentStamp(db, ownerId);
	return stamp !== null && counts(e, stamp);
}

/**
 * The expenses that count against the owner's current balance, newest first, and their total.
 * Without a balance nothing counts: the number is not shown, so there is nothing to lower.
 */
export async function countingExpenses(
	db: Db,
	ownerId: number
): Promise<{ expenses: ExpenseRow[]; total: Minor }> {
	const stamp = await currentStamp(db, ownerId);
	if (!stamp) return { expenses: [], total: minor(0) };
	const rows = await db
		.select()
		.from(expense)
		.where(and(eq(expense.ownerId, ownerId), gte(expense.spentOn, stamp.asOf)))
		.orderBy(...newestFirst);
	const expenses = rows.map(toRow).filter((e) => counts(e, stamp));
	return { expenses, total: sum(expenses.map((e) => e.amount)) };
}
