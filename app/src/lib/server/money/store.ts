/**
 * Reading and writing the owner's money: the account and its balance, the schedule, and the
 * overrides. Rows map to the pure domain's `Item`, `Rule` and `Override` and back; a row that cannot
 * map (a rule with no anchor, a kind nobody wrote) throws rather than guessing, because a number
 * built on a guess is worse than no number.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { parseCalDate, todayIn, type CalDate } from '#lib/domain/dates.ts';
import { minor, type Minor } from '#lib/domain/money.ts';
import { groupKey } from '#lib/domain/paycheckList.ts';
import type { Item, Override, Rule } from '#lib/domain/schedule.ts';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import {
	account,
	checkIn,
	occurrenceOverride,
	owner,
	paidMark,
	paymentConfirmation,
	scheduleItem
} from '#lib/server/db/schema.ts';
import { occurrenceKey } from './checkinForm.ts';
import { countingExpenses, type ExpenseRow } from './expenses.ts';
import { isKind, isRepeat, type OverrideInput } from './validate.ts';

type ItemRow = typeof scheduleItem.$inferSelect;
type OverrideRow = typeof occurrenceOverride.$inferSelect;

/** The setup steps in order; `null` in the database means setup is finished. */
export const SETUP_STEPS = [
	'welcome',
	'region',
	'pay',
	'balance',
	'bills',
	'loans',
	'done'
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export const isSetupStep = (v: unknown): v is SetupStep => SETUP_STEPS.includes(v as SetupStep);

export function rowToRule(row: Pick<ItemRow, 'ruleKind' | 'ruleAnchor' | 'ruleDay'>): Rule {
	if (!isRepeat(row.ruleKind)) throw new Error(`Unknown repeat rule: ${row.ruleKind}`);
	if (row.ruleKind === 'monthly') {
		const day = row.ruleDay;
		if (day === null || !Number.isInteger(day) || day < 1 || day > 31) {
			throw new Error(`Monthly rule has a bad day: ${day}`);
		}
		return { kind: 'monthly', day };
	}
	if (row.ruleAnchor === null) throw new Error(`A ${row.ruleKind} rule needs an anchor date`);
	return { kind: row.ruleKind, anchor: parseCalDate(row.ruleAnchor) };
}

export function ruleToColumns(rule: Rule): Pick<ItemRow, 'ruleKind' | 'ruleAnchor' | 'ruleDay'> {
	return rule.kind === 'monthly'
		? { ruleKind: 'monthly', ruleAnchor: null, ruleDay: rule.day }
		: { ruleKind: rule.kind, ruleAnchor: rule.anchor, ruleDay: null };
}

export function rowToItem(row: ItemRow): Item {
	if (!isKind(row.kind)) throw new Error(`Unknown item kind: ${row.kind}`);
	const startsOn = parseCalDate(row.startsOn);
	const endsOn = row.endsOn === null ? undefined : parseCalDate(row.endsOn);
	if (endsOn !== undefined && endsOn < startsOn) {
		throw new Error(`Item ${row.id} ends before it starts`);
	}
	return {
		id: String(row.id),
		kind: row.kind,
		name: row.name,
		amount: minor(row.amountMinor),
		rule: rowToRule(row),
		startsOn,
		...(endsOn === undefined ? {} : { endsOn }),
		...(row.groupName === null ? {} : { group: row.groupName }),
		...(row.optional ? { optional: true } : {})
	};
}

/** The schedule columns. The group and the optional mark are left out: only `setItemLabels` writes them. */
export function itemToRow(item: Omit<Item, 'id'>) {
	return {
		kind: item.kind,
		name: item.name,
		amountMinor: item.amount,
		...ruleToColumns(item.rule),
		startsOn: item.startsOn,
		endsOn: item.endsOn ?? null
	};
}

export function rowToOverride(row: OverrideRow): Override {
	const base = { itemId: String(row.itemId), originalDate: parseCalDate(row.originalDate) };
	if (row.action === 'skip') return { ...base, action: 'skip' };
	if (row.action !== 'change') throw new Error(`Unknown override action: ${row.action}`);
	return {
		...base,
		action: 'change',
		...(row.newDate === null ? {} : { date: parseCalDate(row.newDate) }),
		...(row.newAmountMinor === null ? {} : { amount: minor(row.newAmountMinor) })
	};
}

export function overrideToRow(itemId: number, input: OverrideInput) {
	return input.action === 'skip'
		? {
				itemId,
				originalDate: input.originalDate,
				action: 'skip',
				newDate: null,
				newAmountMinor: null
			}
		: {
				itemId,
				originalDate: input.originalDate,
				action: 'change',
				newDate: input.date ?? null,
				newAmountMinor: input.amount ?? null
			};
}

// ---- The owner ----

export type OwnerSettings = {
	currency: string | null;
	timeZone: string | null;
	/** `null` once first-run setup is finished. */
	setupStep: SetupStep | null;
};

export async function getOwner(db: Db, ownerId: number): Promise<OwnerSettings> {
	const [row] = await db.select().from(owner).where(eq(owner.id, ownerId));
	if (!row) throw new Error(`No owner ${ownerId}`);
	if (row.setupStep !== null && !isSetupStep(row.setupStep)) {
		throw new Error(`Unknown setup step: ${row.setupStep}`);
	}
	return { currency: row.currency, timeZone: row.timeZone, setupStep: row.setupStep };
}

export async function saveRegion(
	db: Db,
	ownerId: number,
	currency: string,
	timeZone: string
): Promise<void> {
	await db.update(owner).set({ currency, timeZone }).where(eq(owner.id, ownerId));
}

export async function setSetupStep(db: Db, ownerId: number, step: SetupStep | null): Promise<void> {
	await db.update(owner).set({ setupStep: step }).where(eq(owner.id, ownerId));
}

/** "Today" is the date it is in the owner's time zone; UTC until they have chosen one. */
export function ownerToday(settings: OwnerSettings, now: Date): CalDate {
	return todayIn(settings.timeZone ?? 'UTC', now);
}

// ---- The account and its balance ----

export type Balance = { amount: Minor; asOf: CalDate } | null;

/** The owner's one account, created on first use. */
export async function ensureAccount(db: Db, ownerId: number) {
	const find = async (from: Db) =>
		(await from.select().from(account).where(eq(account.ownerId, ownerId)))[0];
	const existing = await find(db);
	if (existing) return existing;
	// Two requests can both find no account at once; the owner lock makes the second wait, then see
	// the first one's account instead of adding another.
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		const again = await find(tx);
		if (again) return again;
		const [row] = await tx.insert(account).values({ ownerId, name: 'Main account' }).returning();
		return row;
	});
}

export async function getBalance(db: Db, ownerId: number): Promise<Balance> {
	const row = await ensureAccount(db, ownerId);
	if (row.balanceMinor === null || row.balanceAsOf === null) return null;
	return { amount: minor(row.balanceMinor), asOf: parseCalDate(row.balanceAsOf) };
}

/**
 * Saves the balance, with the moment it was saved (ADR-0012): an expense logged before that moment
 * is already in it. `now` defaults to the clock; the check-in passes its own.
 */
export async function setBalance(
	db: Db,
	ownerId: number,
	amount: Minor,
	asOf: CalDate,
	now: Date = new Date()
): Promise<void> {
	const row = await ensureAccount(db, ownerId);
	await db
		.update(account)
		.set({ balanceMinor: amount, balanceAsOf: asOf, balanceSavedAt: now.toISOString() })
		.where(eq(account.id, row.id));
}

// ---- The schedule ----

export async function listItems(db: Db, ownerId: number): Promise<Item[]> {
	const acct = await ensureAccount(db, ownerId);
	const rows = await db
		.select()
		.from(scheduleItem)
		.where(eq(scheduleItem.accountId, acct.id))
		.orderBy(scheduleItem.id);
	return rows.map(rowToItem);
}

export async function getItem(db: Db, ownerId: number, id: number): Promise<Item | null> {
	const acct = await ensureAccount(db, ownerId);
	const [row] = await db
		.select()
		.from(scheduleItem)
		.where(and(eq(scheduleItem.id, id), eq(scheduleItem.accountId, acct.id)));
	return row ? rowToItem(row) : null;
}

export async function addItem(db: Db, ownerId: number, item: Omit<Item, 'id'>): Promise<Item> {
	const acct = await ensureAccount(db, ownerId);
	const [row] = await db
		.insert(scheduleItem)
		.values({ accountId: acct.id, ...itemToRow(item) })
		.returning();
	return rowToItem(row);
}

/** Replaces an item's fields. Its history (overrides) stays; it never deletes anything. */
export async function updateItem(
	db: Db,
	ownerId: number,
	id: number,
	item: Omit<Item, 'id'>
): Promise<boolean> {
	const acct = await ensureAccount(db, ownerId);
	const changed = await db
		.update(scheduleItem)
		.set({ ...itemToRow(item), updatedAt: new Date().toISOString() })
		.where(and(eq(scheduleItem.id, id), eq(scheduleItem.accountId, acct.id)))
		.returning({ id: scheduleItem.id });
	return changed.length > 0;
}

/** Ends an item on a date, or brings it back with `null`. The row and its history stay. */
export async function setItemEnd(
	db: Db,
	ownerId: number,
	id: number,
	endsOn: CalDate | null
): Promise<boolean> {
	const item = await getItem(db, ownerId, id);
	if (!item) return false;
	if (endsOn !== null && endsOn < item.startsOn)
		throw new RangeError('An item cannot end before it starts');
	await db
		.update(scheduleItem)
		.set({ endsOn, updatedAt: new Date().toISOString() })
		.where(eq(scheduleItem.id, id));
	return true;
}

export type ItemLabels = { group: string | null; optional: boolean };

/** Sets an item's group and optional mark, which nothing but the plan and the export reads. */
export async function setItemLabels(
	db: Db,
	ownerId: number,
	id: number,
	labels: ItemLabels
): Promise<boolean> {
	const acct = await ensureAccount(db, ownerId);
	const changed = await db
		.update(scheduleItem)
		.set({
			groupName: labels.group,
			optional: labels.optional,
			updatedAt: new Date().toISOString()
		})
		.where(and(eq(scheduleItem.id, id), eq(scheduleItem.accountId, acct.id)))
		.returning({ id: scheduleItem.id });
	return changed.length > 0;
}

/** Every group name in use, once each, for the form's suggestions. */
export function listGroups(items: readonly Item[]): string[] {
	const byKey = new Map<string, string>();
	for (const item of items) {
		if (item.group && !byKey.has(groupKey(item.group))) byKey.set(groupKey(item.group), item.group);
	}
	return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

// ---- Paid marks ----

/** Marks one payment paid, or takes the mark off. The item must be the owner's bill or loan payment. */
export async function setPaidMark(
	db: Db,
	ownerId: number,
	itemId: number,
	originalDate: CalDate,
	paid: boolean,
	now: Date
): Promise<boolean> {
	const item = await getItem(db, ownerId, itemId);
	if (!item || item.kind === 'income') return false;
	if (paid) {
		const markedAt = now.toISOString();
		await db
			.insert(paidMark)
			.values({ itemId, originalDate, markedAt })
			.onConflictDoUpdate({ target: [paidMark.itemId, paidMark.originalDate], set: { markedAt } });
	} else {
		await db
			.delete(paidMark)
			.where(and(eq(paidMark.itemId, itemId), eq(paidMark.originalDate, originalDate)));
	}
	return true;
}

/** The occurrences marked paid from the plan: `itemId|originalDate` to when it was marked. */
export async function listPaidMarks(db: Db, items: readonly Item[]): Promise<Map<string, string>> {
	const ids = items.map((i) => Number(i.id));
	if (ids.length === 0) return new Map();
	const rows = await db.select().from(paidMark).where(inArray(paidMark.itemId, ids));
	return new Map(rows.map((m) => [occurrenceKey(String(m.itemId), m.originalDate), m.markedAt]));
}

/**
 * The occurrences that count as paid, by `itemId|originalDate`. The latest word on each wins: a
 * finished check-in's answer, paid or missed, or a mark made on the plan after that check-in.
 */
export async function paidOccurrences(
	db: Db,
	ownerId: number,
	items: readonly Item[]
): Promise<Set<string>> {
	const latest = new Map<string, { at: string; paid: boolean }>();
	const answered = await db
		.select({ pc: paymentConfirmation, finishedAt: checkIn.finishedAt })
		.from(paymentConfirmation)
		.innerJoin(checkIn, eq(checkIn.id, paymentConfirmation.checkInId))
		.where(and(eq(checkIn.ownerId, ownerId), isNotNull(checkIn.finishedAt)))
		.orderBy(checkIn.finishedAt, checkIn.id);
	for (const { pc, finishedAt } of answered) {
		latest.set(occurrenceKey(String(pc.itemId), pc.originalDate), {
			at: finishedAt ?? '',
			paid: pc.status === 'paid'
		});
	}
	for (const [key, markedAt] of await listPaidMarks(db, items)) {
		const answer = latest.get(key);
		if (!answer || markedAt > answer.at) latest.set(key, { at: markedAt, paid: true });
	}
	return new Set([...latest].filter(([, v]) => v.paid).map(([key]) => key));
}

// ---- Overrides ----

export async function listOverrides(
	db: Db,
	ownerId: number,
	items?: readonly Item[]
): Promise<Override[]> {
	const ids = (items ?? (await listItems(db, ownerId))).map((i) => Number(i.id));
	if (ids.length === 0) return [];
	const rows = await db
		.select()
		.from(occurrenceOverride)
		.where(inArray(occurrenceOverride.itemId, ids));
	return rows.map(rowToOverride);
}

/** Skips or changes one occurrence; doing it again for the same occurrence replaces the first. */
export async function setOverride(
	db: Db,
	ownerId: number,
	itemId: number,
	input: OverrideInput
): Promise<void> {
	if (!(await getItem(db, ownerId, itemId))) throw new Error(`No item ${itemId}`);
	const row = overrideToRow(itemId, input);
	await db
		.insert(occurrenceOverride)
		.values(row)
		.onConflictDoUpdate({
			target: [occurrenceOverride.itemId, occurrenceOverride.originalDate],
			set: { action: row.action, newDate: row.newDate, newAmountMinor: row.newAmountMinor }
		});
}

/** Undo: the occurrence goes back to what its rule says. */
export async function removeOverride(
	db: Db,
	ownerId: number,
	itemId: number,
	originalDate: CalDate
): Promise<boolean> {
	if (!(await getItem(db, ownerId, itemId))) return false;
	const removed = await db
		.delete(occurrenceOverride)
		.where(
			and(eq(occurrenceOverride.itemId, itemId), eq(occurrenceOverride.originalDate, originalDate))
		)
		.returning({ id: occurrenceOverride.id });
	return removed.length > 0;
}

// ---- Everything the number needs ----

export type Plan = {
	settings: OwnerSettings;
	today: CalDate;
	balance: Balance;
	items: Item[];
	overrides: Override[];
	/** Logged spending that still counts (ADR-0012); empty until there is a balance. */
	expenses: ExpenseRow[];
	/** The sum of `expenses`, in minor units. */
	expensesTotal: Minor;
};

/** The data layer for the home screen: one read of everything `safeToSpend` takes. */
export async function loadPlan(db: Db, ownerId: number, now: Date): Promise<Plan> {
	const settings = await getOwner(db, ownerId);
	const items = await listItems(db, ownerId);
	const counting = await countingExpenses(db, ownerId);
	return {
		settings,
		today: ownerToday(settings, now),
		balance: await getBalance(db, ownerId),
		items,
		overrides: await listOverrides(db, ownerId, items),
		expenses: counting.expenses,
		expensesTotal: counting.total
	};
}
