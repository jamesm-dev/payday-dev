import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	customType,
	date,
	index,
	integer,
	pgSchema,
	primaryKey,
	text,
	uniqueIndex
} from 'drizzle-orm/pg-core';

/*
 * Every amount is an integer in minor units (`*_minor`, ADR-0007), held as a 64-bit `bigint` read
 * back as a JavaScript number (ADR-0017). Every date without a time is a `date` read as the string
 * `YYYY-MM-DD`, in the owner's time zone. Every instant is `text` in exactly
 * `YYYY-MM-DDTHH:MM:SS.sssZ`: the app compares instants as strings, and the backup file carries them
 * verbatim, so the column must not reshape them.
 *
 * Every table lives in the `payday` schema, never `public`: Supabase's data API serves `public`
 * only, so it cannot reach these tables (ADR-0014).
 */

export const payday = pgSchema('payday');

/** The current instant in the app's own text form, `2026-11-02T06:53:59.583Z`. */
const now = sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** A money amount: integer minor units, 64-bit, a plain number in TypeScript. */
const money = (name: string) => bigint(name, { mode: 'number' });

/** A calendar date, read and written as `YYYY-MM-DD`. */
const day = (name: string) => date(name, { mode: 'string' });

/** Raw bytes. postgres-js hands back a Buffer and PGlite a Uint8Array; both are Uint8Arrays. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
	dataType: () => 'bytea',
	fromDriver: (value) => new Uint8Array(value)
});

/** A generated whole-number id. "By default" so a test or a restore may still name one. */
const id = () => integer('id').primaryKey().generatedByDefaultAsIdentity();

/** The one owner (ADR-0006, ADR-0010). Created by the first registration; there is never a second. */
export const owner = payday.table('owner', {
	id: id(),
	/**
	 * The password as a self-describing scrypt string (see server/auth/password.ts). Null for an
	 * owner who registered before passwords existed; they set one after signing in another way.
	 */
	passwordHash: text('password_hash'),
	/** ISO 4217, set during first-run setup. */
	currency: text('currency'),
	/** IANA zone, set during first-run setup; "today" is computed in it. */
	timeZone: text('time_zone'),
	/** The first-run setup step to resume at; null once setup is finished. */
	setupStep: text('setup_step').default('welcome'),
	/** `HH:MM` in the owner's time zone: the time of the alarm on each payday in the calendar file. */
	reminderTime: text('reminder_time').notNull().default('09:00'),
	/**
	 * When the owner last downloaded a full backup (ISO, UTC). Not budget data: Start over and a
	 * restore both leave it alone, so "last downloaded" stays true across them.
	 */
	lastBackupAt: text('last_backup_at'),
	createdAt: text('created_at').notNull().default(now)
});

export const passkey = payday.table(
	'passkey',
	{
		/** The credential id, base64url. */
		id: text('id').primaryKey(),
		ownerId: integer('owner_id').notNull(),
		publicKey: bytea('public_key').notNull(),
		counter: money('counter').notNull().default(0),
		/** JSON array of the authenticator's transports, as reported at registration. */
		transports: text('transports'),
		deviceType: text('device_type'),
		backedUp: boolean('backed_up').notNull().default(false),
		/** A name the owner recognises, such as "iPhone". */
		nickname: text('nickname'),
		createdAt: text('created_at').notNull().default(now),
		lastUsedAt: text('last_used_at')
	},
	(t) => [index('passkey_owner').on(t.ownerId)]
);

/** Server sessions. The id is the SHA-256 of the cookie's token, so a leaked table is not a key. */
export const session = payday.table(
	'session',
	{
		id: text('id').primaryKey(),
		ownerId: integer('owner_id').notNull(),
		createdAt: text('created_at').notNull().default(now),
		lastSeenAt: text('last_seen_at').notNull().default(now),
		expiresAt: text('expires_at').notNull(),
		userAgent: text('user_agent'),
		/**
		 * Sign-in state that belongs to this session and ends with it (server/auth/stepUp.ts): when it
		 * last proved the owner is at the keyboard (the 5-minute confirmation), and when it was opened
		 * with a recovery code (the 10-minute window). Epoch milliseconds, because they are compared
		 * as numbers; null when it never happened.
		 */
		stepUpAt: bigint('step_up_at', { mode: 'number' }),
		recoveryAt: bigint('recovery_at', { mode: 'number' })
	},
	(t) => [index('session_owner').on(t.ownerId)]
);

/** One-time recovery codes, stored hashed; each signs in exactly once. */
export const recoveryCode = payday.table('recovery_code', {
	id: id(),
	ownerId: integer('owner_id').notNull(),
	codeHash: text('code_hash').notNull().unique(),
	usedAt: text('used_at'),
	createdAt: text('created_at').notNull().default(now)
});

/*
 * Sign-in state (ADR-0013): everything sign-in remembers between requests lives in the database,
 * because on Netlify any request may run in a fresh function instance. Unlike the rest of the
 * schema these instants are `bigint` epoch milliseconds, not text: the limiters and expiries compare
 * them as numbers, in SQL, in one atomic statement.
 */

/** WebAuthn challenges, single use and short lived. */
export const authChallenge = payday.table('auth_challenge', {
	id: text('id').primaryKey(),
	challenge: text('challenge').notNull(),
	/** register | authenticate | add-passkey | step-up */
	purpose: text('purpose').notNull(),
	/** The session (id) a step-up challenge is bound to; null for the others. */
	bound: text('bound'),
	/** Epoch ms after which it is not current. */
	expiresAt: bigint('expires_at', { mode: 'number' }).notNull()
});

/**
 * The sign-in limits (server/auth/rateLimit.ts, failureBrake.ts): one row per (scope, key). `stamps`
 * holds the epoch ms at which each counted event STOPS counting (the event's time plus its window,
 * or a held slot's lease), so "how many count now" is "how many stamps are in the future".
 * `until` is the newest stamp: the row is garbage once it has passed.
 */
export const attemptCounter = payday.table(
	'attempt_counter',
	{
		scope: text('scope').notNull(),
		key: text('key').notNull(),
		stamps: bigint('stamps', { mode: 'number' }).array().notNull(),
		until: bigint('until', { mode: 'number' }).notNull()
	},
	(t) => [
		primaryKey({ columns: [t.scope, t.key] }),
		index('attempt_counter_until').on(t.scope, t.until)
	]
);

/**
 * A value left for exactly one later read (server/auth/oneTimeSlot.ts), keyed by session id. The
 * value is sealed with a key derived from the session's cookie token, which the database never
 * holds, so a copy of this table reveals nothing.
 */
export const oneTimeSlot = payday.table('one_time_slot', {
	// Cascades, so the sealed codes go with their session on sign-out, sign-out everywhere and a
	// password change, not only when they expire.
	sessionId: text('session_id')
		.primaryKey()
		.references(() => session.id, { onDelete: 'cascade' }),
	sealed: text('sealed').notNull(),
	expiresAt: bigint('expires_at', { mode: 'number' }).notNull()
});

/** Where money is held. v1 shows one account; the table allows more. */
export const account = payday.table('account', {
	id: id(),
	ownerId: integer('owner_id').notNull(),
	name: text('name').notNull(),
	balanceMinor: money('balance_minor'),
	/** The date the balance was true on; the home screen warns once it predates the last payday. */
	balanceAsOf: day('balance_as_of'),
	/**
	 * The moment the balance was saved (ADR-0012), not the day it was true on. An expense logged
	 * before it is already in the balance. Null for a balance saved before this column existed,
	 * which counts as before every expense.
	 */
	balanceSavedAt: text('balance_saved_at'),
	createdAt: text('created_at').notNull().default(now)
});

/**
 * One thing the owner spent money on, logged on the day (Daily Expense Log). It lowers the
 * safe-to-spend number while it counts (ADR-0012); once a newer balance covers it, it is history.
 */
export const expense = payday.table(
	'expense',
	{
		id: id(),
		ownerId: integer('owner_id').notNull(),
		/** Always above zero. */
		amountMinor: money('amount_minor').notNull(),
		/** What it was for, free text of at most 60 characters. Optional. */
		note: text('note'),
		/** The day it was spent, in the owner's time zone. */
		spentOn: day('spent_on').notNull(),
		/** When it was logged. Never changes on edit: the counting rule compares it with the balance. */
		loggedAt: text('logged_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(t) => [index('expense_owner_spent_on').on(t.ownerId, t.spentOn)]
);

/**
 * A repeating paycheck, bill or loan payment, entered once (Recurring Money Schedule). Maps onto
 * `Item` and `Rule` in `#lib/domain/schedule.ts`.
 */
export const scheduleItem = payday.table(
	'schedule_item',
	{
		id: id(),
		accountId: integer('account_id').notNull(),
		/** income | bill | loan-payment */
		kind: text('kind').notNull(),
		name: text('name').notNull(),
		amountMinor: money('amount_minor').notNull(),
		/** every14 | monthly | quarterly | yearly */
		ruleKind: text('rule_kind').notNull(),
		/** The anchor date, for every14, quarterly and yearly rules. */
		ruleAnchor: day('rule_anchor'),
		/** The day of the month, 1 to 31, for monthly rules. */
		ruleDay: integer('rule_day'),
		startsOn: day('starts_on').notNull(),
		endsOn: day('ends_on'),
		/** The owner's own group for it, such as "GCash"; null when ungrouped. Only a label. */
		groupName: text('group_name'),
		/** Something the owner may skip, marked `*` on the paycheck list. Still held back by the number. */
		optional: boolean('optional').notNull().default(false),
		createdAt: text('created_at').notNull().default(now),
		updatedAt: text('updated_at').notNull().default(now)
	},
	(t) => [index('schedule_item_account').on(t.accountId)]
);

/**
 * One payment the owner marked paid from the plan, before a check-in has asked about it. A mark
 * moves no money: the next check-in starts with it ticked, and that check-in's answer outranks it.
 */
export const paidMark = payday.table(
	'paid_mark',
	{
		id: id(),
		itemId: integer('item_id').notNull(),
		originalDate: day('original_date').notNull(),
		markedAt: text('marked_at').notNull().default(now)
	},
	(t) => [uniqueIndex('paid_mark_occurrence').on(t.itemId, t.originalDate)]
);

/** One occurrence skipped or changed, without changing its rule. */
export const occurrenceOverride = payday.table(
	'occurrence_override',
	{
		id: id(),
		itemId: integer('item_id').notNull(),
		originalDate: day('original_date').notNull(),
		/** skip | change */
		action: text('action').notNull(),
		newDate: day('new_date'),
		newAmountMinor: money('new_amount_minor'),
		createdAt: text('created_at').notNull().default(now)
	},
	(t) => [uniqueIndex('occurrence_override_item_date').on(t.itemId, t.originalDate)]
);

/**
 * One payday check-in. It exists from the moment it is started, with the step it has reached, so a
 * dropped connection resumes where it stopped; `finishedAt` is null until it is saved.
 */
export const checkIn = payday.table(
	'check_in',
	{
		id: id(),
		ownerId: integer('owner_id').notNull(),
		startedAt: text('started_at').notNull(),
		finishedAt: text('finished_at'),
		/** Whole seconds from start to finish. */
		durationSeconds: integer('duration_seconds'),
		/** pay | balance | spending | payments | loans | finish | done */
		currentStep: text('current_step').notNull().default('pay'),
		payLanded: boolean('pay_landed'),
		payAmountMinor: money('pay_amount_minor'),
		balanceMinor: money('balance_minor'),
		expectedMinor: money('expected_minor'),
		/** Expected minus actual. Can be negative: more arrived than was counted. */
		spentMinor: money('spent_minor'),
		/** What the owner had logged as spent since the last balance when this was saved; null if nothing. */
		loggedMinor: money('logged_minor'),
		/**
		 * When the balance step was saved: the moment the bank figure was read (ADR-0012). Finishing
		 * stamps the account's balance with this, not with the time of finishing. Null before that step.
		 */
		balanceReadAt: text('balance_read_at'),
		/** The date the balance was true on: the owner's today when the check-in was started. */
		asOf: day('as_of').notNull()
	},
	(t) => [
		index('check_in_owner').on(t.ownerId),
		// One unfinished check-in per owner: a double tap on Start cannot open a second.
		uniqueIndex('check_in_one_open')
			.on(t.ownerId)
			.where(sql`finished_at IS NULL`)
	]
);

/** Whether one scheduled payment went out. The occurrence is named by the date its rule gave it. */
export const paymentConfirmation = payday.table(
	'payment_confirmation',
	{
		id: id(),
		checkInId: integer('check_in_id').notNull(),
		itemId: integer('item_id').notNull(),
		originalDate: day('original_date').notNull(),
		dueDate: day('due_date').notNull(),
		amountMinor: money('amount_minor').notNull(),
		/** paid | missed */
		status: text('status').notNull()
	},
	(t) => [
		uniqueIndex('payment_confirmation_occurrence').on(t.checkInId, t.itemId, t.originalDate),
		index('payment_confirmation_item').on(t.itemId, t.originalDate)
	]
);

/**
 * Something the owner owes: one table for all four kinds (credit card, instalment loan, buy-now-
 * pay-later plan, informal loan). Only the projection differs by type (`#lib/domain/loans.ts`).
 * Its payments are its schedule item, so the safe-to-spend number counts each payment once.
 */
export const loan = payday.table(
	'loan',
	{
		id: id(),
		ownerId: integer('owner_id').notNull(),
		/** credit-card | instalment | bnpl | informal */
		type: text('type').notNull(),
		name: text('name').notNull(),
		/** Who it is owed to. Optional. */
		lender: text('lender'),
		/** What is owed, as last entered or confirmed at a check-in. */
		balanceMinor: money('balance_minor').notNull(),
		/** The date `balanceMinor` was true on. */
		balanceAsOf: day('balance_as_of').notNull(),
		/** The yearly rate (APR) in basis points. NULL means unknown, never a guess; 0 is a known 0%. */
		rateBp: integer('rate_bp'),
		/** The schedule item that carries this loan's payments. The item is never copied or changed. */
		scheduleItemId: integer('schedule_item_id'),
		/** A card's minimum payment: max(floor, balance x pct), capped at the balance. */
		minPctBp: integer('min_pct_bp'),
		minFloorMinor: money('min_floor_minor'),
		createdAt: text('created_at').notNull().default(now),
		closedAt: text('closed_at')
	},
	(t) => [index('loan_owner').on(t.ownerId), index('loan_schedule_item').on(t.scheduleItemId)]
);

/** Every balance a loan has been given: when entered, and at each check-in that confirmed it. */
export const loanBalance = payday.table(
	'loan_balance',
	{
		id: id(),
		loanId: integer('loan_id').notNull(),
		/** Set when the balance was confirmed at a check-in. */
		checkInId: integer('check_in_id'),
		asOf: day('as_of').notNull(),
		balanceMinor: money('balance_minor').notNull(),
		/** entered | check-in */
		source: text('source').notNull()
	},
	(t) => [
		index('loan_balance_loan').on(t.loanId),
		index('loan_balance_check_in').on(t.checkInId),
		// A check-in confirms each loan once, so a double submit cannot count a debt twice.
		uniqueIndex('loan_balance_check_in_loan').on(t.checkInId, t.loanId)
	]
);
