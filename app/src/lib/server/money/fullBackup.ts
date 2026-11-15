/**
 * A full backup: the owner's whole budget as one JSON document, and restoring one. It covers exactly
 * what Start over deletes (erase.ts): the account and its balance, the schedule, every override and
 * paid mark, every logged expense, every check-in and what it confirmed, every loan and its balances,
 * and the budget settings (currency, time zone, setup step, reminder time).
 *
 * Never in it: the password, devices (passkeys), recovery codes or sessions. Those are sign-in,
 * not the budget; a restore leaves sign-in exactly as it is.
 *
 * The format is plain data and does not depend on the database that holds it (it is the way the
 * budget crosses from SQLite to Postgres): integer minor units (ADR-0007), dates as the
 * `YYYY-MM-DD` strings the schema stores, timestamps as ISO strings, booleans as booleans, and every
 * reference as the id the row has in the file. Ids are only names inside the file: a restore gives
 * every row a new id and maps each reference through old id -> new id, and a reference to an id the
 * file does not hold is a refusal, never trusted. Keys and rows are always in the same order, so two
 * exports of the same budget differ only in `exportedAt`.
 *
 * Version 3 says whose budget it is: `backupId`, the exporting person's random id (owner.backup_id).
 * A restore refuses a version 3 file that is another person's, before anything is changed. Versions
 * 1 and 2 carry no marker and restore into whoever restores them.
 * Version 2 (version 1 had no twice-a-month second day and no main-pay flag). A file with a higher
 * version is refused as "newer"; change the shape, bump the version. A version 1 file is still read:
 * its second day is null and its main pay is inferred, by the rule migration 0003 used.
 */
import { eq, inArray } from 'drizzle-orm';
import { dateParts, parseCalDate, todayIn } from '#lib/domain/dates.ts';
import { isLoanType } from '#lib/domain/loans.ts';
import { isCurrency } from '#lib/format.ts';
import type { Db } from '#lib/server/db/open.ts';
import {
	account,
	checkIn,
	expense,
	loan,
	loanBalance,
	occurrenceOverride,
	owner,
	paidMark,
	paymentConfirmation,
	scheduleItem
} from '#lib/server/db/schema.ts';
import { CHECKIN_STEPS } from './checkin.ts';
import { eraseBudgetIn, type Tx } from './erase.ts';
import { isSetupStep, rowToRule } from './store.ts';
import {
	isKind,
	MAX_EXPENSE_MINOR,
	MAX_GROUP,
	MAX_NAME,
	MAX_NOTE,
	MAX_YEAR,
	MIN_YEAR
} from './validate.ts';

export const BACKUP_FORMAT = 'payday-backup';
export const BACKUP_VERSION = 3;
/** The largest file a restore will read. A household's backup is well under 1 MB. */
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
/** A backup older than this (or none) is worth a nudge. */
export const BACKUP_STALE_DAYS = 14;

// ---- The document ----

export type BackupDocument = {
	format: typeof BACKUP_FORMAT;
	version: number;
	/** Whose budget this is (owner.backup_id). Null in a parsed version 1 or 2 file, which has none. */
	backupId: string | null;
	exportedAt: string;
	settings: {
		currency: string | null;
		timeZone: string | null;
		setupStep: string | null;
		reminderTime: string;
	};
	accounts: {
		id: number;
		name: string;
		balanceMinor: number | null;
		balanceAsOf: string | null;
		balanceSavedAt: string | null;
		createdAt: string;
	}[];
	scheduleItems: {
		id: number;
		accountId: number;
		kind: string;
		name: string;
		amountMinor: number;
		ruleKind: string;
		ruleAnchor: string | null;
		ruleDay: number | null;
		ruleDay2: number | null;
		startsOn: string;
		endsOn: string | null;
		groupName: string | null;
		optional: boolean;
		isMainPay: boolean;
		createdAt: string;
		updatedAt: string;
	}[];
	overrides: {
		id: number;
		itemId: number;
		originalDate: string;
		action: string;
		newDate: string | null;
		newAmountMinor: number | null;
		createdAt: string;
	}[];
	paidMarks: { id: number; itemId: number; originalDate: string; markedAt: string }[];
	expenses: {
		id: number;
		amountMinor: number;
		note: string | null;
		spentOn: string;
		loggedAt: string;
		updatedAt: string;
	}[];
	checkIns: {
		id: number;
		startedAt: string;
		finishedAt: string | null;
		durationSeconds: number | null;
		currentStep: string;
		payLanded: boolean | null;
		payAmountMinor: number | null;
		balanceMinor: number | null;
		expectedMinor: number | null;
		spentMinor: number | null;
		loggedMinor: number | null;
		balanceReadAt: string | null;
		asOf: string;
	}[];
	paymentConfirmations: {
		id: number;
		checkInId: number;
		itemId: number;
		originalDate: string;
		dueDate: string;
		amountMinor: number;
		status: string;
	}[];
	loans: {
		id: number;
		type: string;
		name: string;
		lender: string | null;
		balanceMinor: number;
		balanceAsOf: string;
		rateBp: number | null;
		scheduleItemId: number | null;
		minPctBp: number | null;
		minFloorMinor: number | null;
		createdAt: string;
		closedAt: string | null;
	}[];
	loanBalances: {
		id: number;
		loanId: number;
		checkInId: number | null;
		asOf: string;
		balanceMinor: number;
		source: string;
		/** When the loans step read this figure; null before version 2 or when the check-in's read time stands. */
		readAt: string | null;
	}[];
};

const byId = <T extends { id: number }>(rows: T[]) => rows.sort((a, b) => a.id - b.id);

// ---- Writing ----

/**
 * Reads the whole budget as one document. One transaction at REPEATABLE READ, so every table is read
 * from the same moment: a payment saved halfway through cannot leave the file with a check-in and
 * not its answers.
 */
export function exportBackup(db: Db, ownerId: number, now: Date): Promise<BackupDocument> {
	return db.transaction((tx) => readBackup(tx, ownerId, now), {
		isolationLevel: 'repeatable read'
	});
}

async function readBackup(db: Db, ownerId: number, now: Date): Promise<BackupDocument> {
	const [me] = await db.select().from(owner).where(eq(owner.id, ownerId));
	if (!me) throw new Error(`No owner ${ownerId}`);
	const accounts = byId(await db.select().from(account).where(eq(account.ownerId, ownerId)));
	const items = byId(
		await db
			.select()
			.from(scheduleItem)
			.where(
				inArray(
					scheduleItem.accountId,
					accounts.map((a) => a.id)
				)
			)
	);
	const itemIds = items.map((i) => i.id);
	const checkIns = byId(await db.select().from(checkIn).where(eq(checkIn.ownerId, ownerId)));
	const loans = byId(await db.select().from(loan).where(eq(loan.ownerId, ownerId)));
	const loanIds = loans.map((l) => l.id);
	const checkInIds = checkIns.map((c) => c.id);
	const overrideRows = byId(
		await db.select().from(occurrenceOverride).where(inArray(occurrenceOverride.itemId, itemIds))
	);
	const paidMarkRows = byId(
		await db.select().from(paidMark).where(inArray(paidMark.itemId, itemIds))
	);
	const expenseRows = byId(await db.select().from(expense).where(eq(expense.ownerId, ownerId)));
	const confirmationRows = byId(
		await db
			.select()
			.from(paymentConfirmation)
			.where(inArray(paymentConfirmation.checkInId, checkInIds))
	);
	const loanBalanceRows = byId(
		await db.select().from(loanBalance).where(inArray(loanBalance.loanId, loanIds))
	);

	// A key at a time, in the document's order: the order here IS the file's order.
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		backupId: me.backupId,
		exportedAt: now.toISOString(),
		settings: {
			currency: me.currency,
			timeZone: me.timeZone,
			setupStep: me.setupStep,
			reminderTime: me.reminderTime
		},
		accounts: accounts.map((a) => ({
			id: a.id,
			name: a.name,
			balanceMinor: a.balanceMinor,
			balanceAsOf: a.balanceAsOf,
			balanceSavedAt: a.balanceSavedAt,
			createdAt: a.createdAt
		})),
		scheduleItems: items.map((i) => ({
			id: i.id,
			accountId: i.accountId,
			kind: i.kind,
			name: i.name,
			amountMinor: i.amountMinor,
			ruleKind: i.ruleKind,
			ruleAnchor: i.ruleAnchor,
			ruleDay: i.ruleDay,
			ruleDay2: i.ruleDay2,
			startsOn: i.startsOn,
			endsOn: i.endsOn,
			groupName: i.groupName,
			optional: i.optional,
			isMainPay: i.isMainPay,
			createdAt: i.createdAt,
			updatedAt: i.updatedAt
		})),
		overrides: overrideRows.map((o) => ({
			id: o.id,
			itemId: o.itemId,
			originalDate: o.originalDate,
			action: o.action,
			newDate: o.newDate,
			newAmountMinor: o.newAmountMinor,
			createdAt: o.createdAt
		})),
		paidMarks: paidMarkRows.map((m) => ({
			id: m.id,
			itemId: m.itemId,
			originalDate: m.originalDate,
			markedAt: m.markedAt
		})),
		expenses: expenseRows.map((e) => ({
			id: e.id,
			amountMinor: e.amountMinor,
			note: e.note,
			spentOn: e.spentOn,
			loggedAt: e.loggedAt,
			updatedAt: e.updatedAt
		})),
		checkIns: checkIns.map((c) => ({
			id: c.id,
			startedAt: c.startedAt,
			finishedAt: c.finishedAt,
			durationSeconds: c.durationSeconds,
			currentStep: c.currentStep,
			payLanded: c.payLanded,
			payAmountMinor: c.payAmountMinor,
			balanceMinor: c.balanceMinor,
			expectedMinor: c.expectedMinor,
			spentMinor: c.spentMinor,
			loggedMinor: c.loggedMinor,
			balanceReadAt: c.balanceReadAt,
			asOf: c.asOf
		})),
		paymentConfirmations: confirmationRows.map((p) => ({
			id: p.id,
			checkInId: p.checkInId,
			itemId: p.itemId,
			originalDate: p.originalDate,
			dueDate: p.dueDate,
			amountMinor: p.amountMinor,
			status: p.status
		})),
		loans: loans.map((l) => ({
			id: l.id,
			type: l.type,
			name: l.name,
			lender: l.lender,
			balanceMinor: l.balanceMinor,
			balanceAsOf: l.balanceAsOf,
			rateBp: l.rateBp,
			scheduleItemId: l.scheduleItemId,
			minPctBp: l.minPctBp,
			minFloorMinor: l.minFloorMinor,
			createdAt: l.createdAt,
			closedAt: l.closedAt
		})),
		loanBalances: loanBalanceRows.map((b) => ({
			id: b.id,
			loanId: b.loanId,
			checkInId: b.checkInId,
			asOf: b.asOf,
			balanceMinor: b.balanceMinor,
			source: b.source,
			readAt: b.readAt
		}))
	};
}

/** The file as it is sent: compact JSON (half the size of indented) and a final newline. */
export const backupText = (doc: BackupDocument) => `${JSON.stringify(doc)}\n`;

/** `payday-backup-YYYY-MM-DD.json`, the day it is in the owner's time zone. */
export function backupFilename(timeZone: string | null, now: Date): string {
	return `payday-backup-${todayIn(timeZone ?? 'UTC', now)}.json`;
}

export async function markBackupDownloaded(db: Db, ownerId: number, now: Date): Promise<void> {
	await db.update(owner).set({ lastBackupAt: now.toISOString() }).where(eq(owner.id, ownerId));
}

export async function lastBackupAt(db: Db, ownerId: number): Promise<string | null> {
	const [row] = await db
		.select({ at: owner.lastBackupAt })
		.from(owner)
		.where(eq(owner.id, ownerId));
	return row?.at ?? null;
}

/** Whether to suggest a backup: never taken, or more than two weeks ago. */
export function backupDue(last: string | null, now: Date): boolean {
	if (last === null) return true;
	const at = Date.parse(last);
	if (Number.isNaN(at)) return true;
	return now.getTime() - at > BACKUP_STALE_DAYS * 24 * 60 * 60 * 1000;
}

// ---- Reading ----

/** Why a file was refused, in words the owner reads. Nothing was changed. */
export class BackupRefused extends Error {}

const NOT_A_BACKUP = 'That file is not a Payday backup, so nothing was changed.';
const NOT_YOURS =
	'That backup was made by a different Payday account (or by this one before it was made again). If it is your own budget, tick "Yes, this is my budget from another account" and try again. Nothing was changed.';
const NEWER =
	'That backup was made by a newer version of Payday than this one can read, so nothing was changed.';
const damaged = (detail: string) =>
	new BackupRefused(
		`That backup file is damaged or does not add up (${detail}), so nothing was changed.`
	);

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads one row's fields with their types checked; any slip is a refusal naming the table and row. */
class Fields {
	constructor(
		private readonly r: Obj,
		private readonly where: string
	) {}
	private fail(key: string, why: string): never {
		throw damaged(`${this.where}: ${key} ${why}`);
	}
	int(key: string): number {
		const v = this.r[key];
		if (typeof v !== 'number' || !Number.isSafeInteger(v)) this.fail(key, 'is not a whole number');
		return v;
	}
	intOrNull(key: string): number | null {
		return this.r[key] === null ? null : this.int(key);
	}
	/** Whole minor units from `min` up. */
	atLeast(key: string, min: number): number {
		const v = this.int(key);
		if (v < min) this.fail(key, min > 0 ? 'must be above zero' : 'must not be negative');
		return v;
	}
	atLeastOrNull(key: string, min: number): number | null {
		return this.r[key] === null ? null : this.atLeast(key, min);
	}
	/** Text of at most `max` characters, as the forms allow. */
	short(key: string, max: number): string {
		const v = this.str(key);
		if (v.length > max) this.fail(key, `is longer than ${max} letters`);
		return v;
	}
	shortOrNull(key: string, max: number): string | null {
		return this.r[key] === null ? null : this.short(key, max);
	}
	positive(key: string): number {
		const v = this.int(key);
		if (v <= 0 || v > MAX_EXPENSE_MINOR) this.fail(key, 'must be above zero and not too big');
		return v;
	}
	str(key: string): string {
		const v = this.r[key];
		if (typeof v !== 'string') this.fail(key, 'is not text');
		return v;
	}
	strOrNull(key: string): string | null {
		return this.r[key] === null ? null : this.str(key);
	}
	bool(key: string): boolean {
		const v = this.r[key];
		if (typeof v !== 'boolean') this.fail(key, 'is not true or false');
		return v;
	}
	boolOrNull(key: string): boolean | null {
		return this.r[key] === null ? null : this.bool(key);
	}
	date(key: string): string {
		const v = this.str(key);
		try {
			const { y } = dateParts(parseCalDate(v));
			if (y < MIN_YEAR || y > MAX_YEAR) throw new RangeError('year');
		} catch {
			this.fail(key, 'is not a date');
		}
		return v;
	}
	dateOrNull(key: string): string | null {
		return this.r[key] === null ? null : this.date(key);
	}
	stamp(key: string): string {
		const v = this.str(key);
		// Exactly what the app writes (toISOString, or SQLite's strftime with milliseconds): the
		// number compares these as text, so another spelling of the same moment would count wrongly.
		if (!INSTANT.test(v) || Number.isNaN(Date.parse(v))) this.fail(key, 'is not a date and time');
		return v;
	}
	stampOrNull(key: string): string | null {
		return this.r[key] === null ? null : this.stamp(key);
	}
	oneOf(key: string, ok: (v: unknown) => boolean): string {
		const v = this.str(key);
		if (!ok(v)) this.fail(key, `has a value Payday does not know ("${v.slice(0, 30)}")`);
		return v;
	}
	/** A reference to a row in the file: it must be one of `ids`. */
	ref(key: string, ids: ReadonlySet<number>, to: string): number {
		const v = this.int(key);
		if (!ids.has(v)) this.fail(key, `points to ${to} ${v}, which is not in the file`);
		return v;
	}
	refOrNull(key: string, ids: ReadonlySet<number>, to: string): number | null {
		return this.r[key] === null ? null : this.ref(key, ids, to);
	}
}

/** A table: an array of objects whose ids are whole numbers and appear once. */
function table<T>(doc: Obj, key: string, read: (f: Fields, id: number) => T) {
	const list = doc[key];
	if (!Array.isArray(list)) throw damaged(`${key} is missing`);
	const ids = new Set<number>();
	const rows = list.map((raw, i) => {
		const where = `${key} #${i + 1}`;
		if (!isObj(raw)) throw damaged(`${where} is not a record`);
		const f = new Fields(raw, where);
		const id = f.int('id');
		if (ids.has(id)) throw damaged(`${where}: id ${id} appears twice`);
		ids.add(id);
		return { id, row: read(f, id) };
	});
	return { ids: ids as ReadonlySet<number>, rows };
}

/** A validated backup: every row's fields checked, every reference resolved within the file. */
export type ParsedBackup = BackupDocument;

/** Reads the file's text. Throws `BackupRefused` with the plain-words reason; changes nothing. */
export function parseBackup(text: string): ParsedBackup {
	if (text.length > MAX_BACKUP_BYTES) {
		throw new BackupRefused('That file is too big to be a Payday backup, so nothing was changed.');
	}
	let doc: unknown;
	try {
		doc = JSON.parse(text);
	} catch {
		throw new BackupRefused(NOT_A_BACKUP);
	}
	if (!isObj(doc) || doc.format !== BACKUP_FORMAT) throw new BackupRefused(NOT_A_BACKUP);
	const version = doc.version;
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		throw new BackupRefused(NOT_A_BACKUP);
	}
	if (version > BACKUP_VERSION) throw new BackupRefused(NEWER);

	const exportedAt = new Fields(doc, 'the file').stamp('exportedAt');
	// Version 3 names its owner; older files have no marker.
	const backupId = version >= 3 ? new Fields(doc, 'the file').short('backupId', 100) : null;

	const s = doc.settings;
	if (!isObj(s)) throw damaged('settings is missing');
	const sf = new Fields(s, 'settings');
	const settings = {
		currency: sf.strOrNull('currency'),
		timeZone: sf.strOrNull('timeZone'),
		setupStep: sf.strOrNull('setupStep'),
		reminderTime: sf.str('reminderTime')
	};
	if (settings.currency !== null && !isCurrency(settings.currency)) {
		throw damaged('settings: currency is not one Payday knows');
	}
	if (settings.setupStep !== null && !isSetupStep(settings.setupStep)) {
		throw damaged('settings: setupStep has a value Payday does not know');
	}
	if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.reminderTime)) {
		throw damaged('settings: reminderTime is not a time');
	}
	if (settings.timeZone !== null) {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: settings.timeZone });
		} catch {
			throw damaged('settings: timeZone is not a time zone');
		}
	}

	const accounts = table(doc, 'accounts', (f) => ({
		id: 0,
		name: f.short('name', MAX_NAME),
		balanceMinor: f.intOrNull('balanceMinor'),
		balanceAsOf: f.dateOrNull('balanceAsOf'),
		balanceSavedAt: f.stampOrNull('balanceSavedAt'),
		createdAt: f.stamp('createdAt')
	}));
	// The app has one account per owner everywhere it reads one.
	if (accounts.rows.length > 1) throw damaged('accounts: more than one account');

	const items = table(doc, 'scheduleItems', (f) => {
		// Version 1 had neither field: no second day, and the main pay is inferred below.
		const row = {
			id: 0,
			accountId: f.ref('accountId', accounts.ids, 'account'),
			kind: f.oneOf('kind', isKind),
			name: f.short('name', MAX_NAME),
			amountMinor: f.atLeast('amountMinor', 1),
			ruleKind: f.str('ruleKind'),
			ruleAnchor: f.dateOrNull('ruleAnchor'),
			ruleDay: f.intOrNull('ruleDay'),
			ruleDay2: version >= 2 ? f.intOrNull('ruleDay2') : null,
			startsOn: f.date('startsOn'),
			endsOn: f.dateOrNull('endsOn'),
			groupName: f.shortOrNull('groupName', MAX_GROUP),
			optional: f.bool('optional'),
			isMainPay: version >= 2 ? f.bool('isMainPay') : false,
			createdAt: f.stamp('createdAt'),
			updatedAt: f.stamp('updatedAt')
		};
		if (row.isMainPay && row.kind !== 'income') throw damaged('only pay can be the main pay');
		if (row.isMainPay && !['every14', 'monthly', 'twiceMonthly'].includes(row.ruleKind)) {
			throw damaged(
				'the main pay must be pay that comes every 2 weeks, once a month or twice a month'
			);
		}
		if (row.ruleDay2 !== null && row.ruleKind !== 'twiceMonthly') {
			throw damaged('a second day is set on a repeat that is not twice a month');
		}
		try {
			rowToRule(row);
		} catch {
			throw damaged('a bill or pay in the schedule has a repeat that does not add up');
		}
		if (row.endsOn !== null && row.endsOn < row.startsOn) {
			throw damaged('a bill or pay in the schedule ends before it starts');
		}
		return row;
	});

	if (version < 2) {
		// The rule of migration 0003: of the incomes that repeat every 14 days, the one still running
		// (no end date) comes first, then the lowest id; that one is the main pay.
		const first = items.rows
			.filter((r) => r.row.kind === 'income' && r.row.ruleKind === 'every14')
			.sort(
				(a, b) => Number(a.row.endsOn !== null) - Number(b.row.endsOn !== null) || a.id - b.id
			)[0];
		if (first) first.row.isMainPay = true;
	}

	// One main pay runs at a time. Two may exist only as a rhythm switch left them: the older one
	// ended before the newer one started.
	const mains = items.rows
		.map((r) => r.row)
		.filter((r) => r.isMainPay)
		.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
	if (mains.filter((m) => m.endsOn === null).length > 1) {
		throw damaged('more than one main pay is still running');
	}
	for (let i = 1; i < mains.length; i++) {
		const before = mains[i - 1].endsOn;
		if (before === null || before >= mains[i].startsOn) throw damaged('two main pays overlap');
	}

	const occurrenceSeen = new Set<string>();
	const once = (seen: Set<string>, what: string, per: string, ...parts: (string | number)[]) => {
		const key = parts.join('|');
		if (seen.has(key)) throw damaged(`${what} appears twice for one ${per}`);
		seen.add(key);
	};

	const overrides = table(doc, 'overrides', (f) => {
		const row = {
			id: 0,
			itemId: f.ref('itemId', items.ids, 'item'),
			originalDate: f.date('originalDate'),
			action: f.oneOf('action', (v) => v === 'skip' || v === 'change'),
			newDate: f.dateOrNull('newDate'),
			newAmountMinor: f.atLeastOrNull('newAmountMinor', 1),
			createdAt: f.stamp('createdAt')
		};
		once(occurrenceSeen, 'an override', 'payment', row.itemId, row.originalDate);
		return row;
	});
	const marksSeen = new Set<string>();
	const paidMarks = table(doc, 'paidMarks', (f) => {
		const row = {
			id: 0,
			itemId: f.ref('itemId', items.ids, 'item'),
			originalDate: f.date('originalDate'),
			markedAt: f.stamp('markedAt')
		};
		once(marksSeen, 'a paid mark', 'payment', row.itemId, row.originalDate);
		return row;
	});
	const expenses = table(doc, 'expenses', (f) => ({
		id: 0,
		amountMinor: f.positive('amountMinor'),
		note: f.shortOrNull('note', MAX_NOTE),
		spentOn: f.date('spentOn'),
		loggedAt: f.stamp('loggedAt'),
		updatedAt: f.stamp('updatedAt')
	}));
	const checkIns = table(doc, 'checkIns', (f) => ({
		id: 0,
		startedAt: f.stamp('startedAt'),
		finishedAt: f.stampOrNull('finishedAt'),
		durationSeconds: f.intOrNull('durationSeconds'),
		currentStep: f.oneOf('currentStep', (v) => CHECKIN_STEPS.includes(v as never)),
		payLanded: f.boolOrNull('payLanded'),
		payAmountMinor: f.intOrNull('payAmountMinor'),
		balanceMinor: f.intOrNull('balanceMinor'),
		expectedMinor: f.intOrNull('expectedMinor'),
		spentMinor: f.intOrNull('spentMinor'),
		loggedMinor: f.intOrNull('loggedMinor'),
		balanceReadAt: f.stampOrNull('balanceReadAt'),
		asOf: f.date('asOf')
	}));
	// The database holds one unfinished check-in at most (a unique index), so a file with two cannot
	// be put back: refuse it in words rather than fail halfway through the import.
	if (checkIns.rows.filter((r) => r.row.finishedAt === null).length > 1) {
		throw damaged('more than one check-in is unfinished');
	}
	const confirmedSeen = new Set<string>();
	const confirmations = table(doc, 'paymentConfirmations', (f) => {
		const row = {
			id: 0,
			checkInId: f.ref('checkInId', checkIns.ids, 'check-in'),
			itemId: f.ref('itemId', items.ids, 'item'),
			originalDate: f.date('originalDate'),
			dueDate: f.date('dueDate'),
			amountMinor: f.int('amountMinor'),
			status: f.oneOf('status', (v) => v === 'paid' || v === 'missed')
		};
		once(confirmedSeen, 'a confirmation', 'payment', row.checkInId, row.itemId, row.originalDate);
		return row;
	});
	const loans = table(doc, 'loans', (f) => ({
		id: 0,
		type: f.oneOf('type', isLoanType),
		name: f.short('name', MAX_NAME),
		lender: f.shortOrNull('lender', MAX_NAME),
		balanceMinor: f.int('balanceMinor'),
		balanceAsOf: f.date('balanceAsOf'),
		rateBp: f.atLeastOrNull('rateBp', 0),
		scheduleItemId: f.refOrNull('scheduleItemId', items.ids, 'item'),
		minPctBp: f.atLeastOrNull('minPctBp', 0),
		minFloorMinor: f.atLeastOrNull('minFloorMinor', 0),
		createdAt: f.stamp('createdAt'),
		closedAt: f.stampOrNull('closedAt')
	}));
	const balancesSeen = new Set<string>();
	const loanBalances = table(doc, 'loanBalances', (f) => {
		const row = {
			id: 0,
			loanId: f.ref('loanId', loans.ids, 'loan'),
			checkInId: f.refOrNull('checkInId', checkIns.ids, 'check-in'),
			asOf: f.date('asOf'),
			balanceMinor: f.int('balanceMinor'),
			source: f.oneOf('source', (v) => v === 'entered' || v === 'check-in'),
			readAt: version >= 2 ? f.stampOrNull('readAt') : null
		};
		// A check-in confirms each loan once; twice would count the debt twice.
		if (row.checkInId !== null) {
			once(balancesSeen, 'a loan', 'check-in', row.checkInId, row.loanId);
		}
		return row;
	});

	// Rebuilt with each row's own id put back (the readers above leave it 0 to keep them short).
	const withIds = <T extends { id: number }>(t: { rows: { id: number; row: T }[] }): T[] =>
		t.rows.map(({ id, row }) => ({ ...row, id }));

	// Whatever version it was written in, what comes out is the current shape.
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		backupId,
		exportedAt,
		settings,
		accounts: withIds(accounts),
		scheduleItems: withIds(items),
		overrides: withIds(overrides),
		paidMarks: withIds(paidMarks),
		expenses: withIds(expenses),
		checkIns: withIds(checkIns),
		paymentConfirmations: withIds(confirmations),
		loans: withIds(loans),
		loanBalances: withIds(loanBalances)
	};
}

// ---- Restoring ----

export type Restored = { items: number; checkIns: number; loans: number; expenses: number };

/**
 * Replaces the owner's budget with the file's: Start over, then the import, in one transaction. The
 * file is read and checked in full before anything is written, so a refusal changes nothing; and if
 * the import itself fails, the erase is rolled back with it. Sign-in and `lastBackupAt` are not
 * touched. Throws `BackupRefused` for a file that is not usable.
 */
export async function restoreBackup(
	db: Db,
	ownerId: number,
	text: string,
	sessionId?: string,
	/** The person said this file, made by another account, is theirs. Without it, such a file is refused. */
	options: { allowOtherAccount?: boolean } = {}
): Promise<Restored> {
	const backup = parseBackup(text);
	return db.transaction(async (tx) => {
		// Whose file it is, checked before anything is erased: a refusal changes nothing.
		if (backup.backupId !== null && !options.allowOtherAccount) {
			const [me] = await tx
				.select({ backupId: owner.backupId })
				.from(owner)
				.where(eq(owner.id, ownerId));
			if (!me || me.backupId !== backup.backupId) throw new BackupRefused(NOT_YOURS);
		}
		// eraseBudgetIn takes the owner row lock first (SQLite's `immediate` did this job), and holds
		// it through the import, so no other writer slips in between the erase and the new rows.
		await eraseBudgetIn(tx, ownerId, sessionId);
		return importBackup(tx, ownerId, backup);
	});
}

/** Writes a checked backup. Every new row gets a new id (`id: undefined` drops the file's); each reference goes through its map. */
async function importBackup(tx: Tx, ownerId: number, b: ParsedBackup): Promise<Restored> {
	// Old id (in the file) -> new id (in the database), one map for each table others point at.
	const accountIds = new Map<number, number>();
	const itemIds = new Map<number, number>();
	const checkInIds = new Map<number, number>();
	const loanIds = new Map<number, number>();
	const to = (ids: Map<number, number>, old: number): number => {
		const id = ids.get(old);
		// Unreachable after parseBackup; kept so a bug fails loudly instead of linking the wrong row.
		if (id === undefined) throw new Error(`Backup row points at ${old}, which was not restored`);
		return id;
	};
	const toOrNull = (ids: Map<number, number>, old: number | null) =>
		old === null ? null : to(ids, old);

	await tx
		.update(owner)
		.set({
			currency: b.settings.currency,
			timeZone: b.settings.timeZone,
			setupStep: b.settings.setupStep,
			reminderTime: b.settings.reminderTime
		})
		.where(eq(owner.id, ownerId));

	for (const { id, ...a } of b.accounts) {
		const [row] = await tx
			.insert(account)
			.values({ ...a, ownerId })
			.returning({ id: account.id });
		accountIds.set(id, row.id);
	}
	for (const { id, ...i } of b.scheduleItems) {
		const values = { ...i, accountId: to(accountIds, i.accountId) };
		const [row] = await tx.insert(scheduleItem).values(values).returning({ id: scheduleItem.id });
		itemIds.set(id, row.id);
	}
	for (const o of b.overrides) {
		await tx
			.insert(occurrenceOverride)
			.values({ ...o, id: undefined, itemId: to(itemIds, o.itemId) });
	}
	for (const m of b.paidMarks) {
		await tx.insert(paidMark).values({ ...m, id: undefined, itemId: to(itemIds, m.itemId) });
	}
	for (const e of b.expenses) {
		await tx.insert(expense).values({ ...e, id: undefined, ownerId });
	}
	for (const { id, ...c } of b.checkIns) {
		const [row] = await tx
			.insert(checkIn)
			.values({ ...c, ownerId })
			.returning({ id: checkIn.id });
		checkInIds.set(id, row.id);
	}
	for (const p of b.paymentConfirmations) {
		await tx.insert(paymentConfirmation).values({
			...p,
			id: undefined,
			checkInId: to(checkInIds, p.checkInId),
			itemId: to(itemIds, p.itemId)
		});
	}
	for (const { id, ...l } of b.loans) {
		const values = { ...l, ownerId, scheduleItemId: toOrNull(itemIds, l.scheduleItemId) };
		const [row] = await tx.insert(loan).values(values).returning({ id: loan.id });
		loanIds.set(id, row.id);
	}
	for (const lb of b.loanBalances) {
		await tx.insert(loanBalance).values({
			...lb,
			id: undefined,
			loanId: to(loanIds, lb.loanId),
			checkInId: toOrNull(checkInIds, lb.checkInId)
		});
	}
	return {
		items: b.scheduleItems.length,
		checkIns: b.checkIns.length,
		loans: b.loans.length,
		expenses: b.expenses.length
	};
}
