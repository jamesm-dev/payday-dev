import { sql } from 'drizzle-orm';
import { blob, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/*
 * Every amount is an integer in minor units (`*_minor`, ADR-0007). Every date without a time is a
 * calendar date `YYYY-MM-DD` in the owner's time zone; every timestamp is an ISO-8601 UTC string.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** The one owner (ADR-0006, ADR-0010). Created by the first registration; there is never a second. */
export const owner = sqliteTable('owner', {
	id: integer('id').primaryKey(),
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
	/** `HH:MM` in the owner's time zone: when the payday reminder is sent. */
	reminderTime: text('reminder_time').notNull().default('09:00'),
	/**
	 * When a push service last told us a subscription was gone (404 or 410). It lets the settings
	 * page say "your phone stopped accepting reminders" after the dead subscription is deleted;
	 * cleared when the owner turns reminders on again or off on purpose.
	 */
	remindersExpiredAt: text('reminders_expired_at'),
	createdAt: text('created_at').notNull().default(now)
});

export const passkey = sqliteTable(
	'passkey',
	{
		/** The credential id, base64url. */
		id: text('id').primaryKey(),
		ownerId: integer('owner_id').notNull(),
		publicKey: blob('public_key', { mode: 'buffer' }).notNull(),
		counter: integer('counter').notNull().default(0),
		/** JSON array of the authenticator's transports, as reported at registration. */
		transports: text('transports'),
		deviceType: text('device_type'),
		backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
		/** A name the owner recognises, such as "iPhone". */
		nickname: text('nickname'),
		createdAt: text('created_at').notNull().default(now),
		lastUsedAt: text('last_used_at')
	},
	(t) => [index('passkey_owner').on(t.ownerId)]
);

/** Server sessions. The id is the SHA-256 of the cookie's token, so a leaked table is not a key. */
export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		ownerId: integer('owner_id').notNull(),
		createdAt: text('created_at').notNull().default(now),
		lastSeenAt: text('last_seen_at').notNull().default(now),
		expiresAt: text('expires_at').notNull(),
		userAgent: text('user_agent')
	},
	(t) => [index('session_owner').on(t.ownerId)]
);

/** One-time recovery codes, stored hashed; each signs in exactly once. */
export const recoveryCode = sqliteTable('recovery_code', {
	id: integer('id').primaryKey(),
	ownerId: integer('owner_id').notNull(),
	codeHash: text('code_hash').notNull().unique(),
	usedAt: text('used_at'),
	createdAt: text('created_at').notNull().default(now)
});

/** WebAuthn challenges, single use and short lived. */
export const authChallenge = sqliteTable('auth_challenge', {
	id: text('id').primaryKey(),
	challenge: text('challenge').notNull(),
	/** register | authenticate | add-passkey */
	purpose: text('purpose').notNull(),
	expiresAt: text('expires_at').notNull()
});

/** Where money is held. v1 shows one account; the table allows more. */
export const account = sqliteTable('account', {
	id: integer('id').primaryKey(),
	ownerId: integer('owner_id').notNull(),
	name: text('name').notNull(),
	balanceMinor: integer('balance_minor'),
	/** The date the balance was true on; the home screen warns once it predates the last payday. */
	balanceAsOf: text('balance_as_of'),
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
export const expense = sqliteTable(
	'expense',
	{
		id: integer('id').primaryKey(),
		ownerId: integer('owner_id').notNull(),
		/** Always above zero. */
		amountMinor: integer('amount_minor').notNull(),
		/** What it was for, free text of at most 60 characters. Optional. */
		note: text('note'),
		/** The day it was spent, in the owner's time zone. */
		spentOn: text('spent_on').notNull(),
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
export const scheduleItem = sqliteTable(
	'schedule_item',
	{
		id: integer('id').primaryKey(),
		accountId: integer('account_id').notNull(),
		/** income | bill | loan-payment */
		kind: text('kind').notNull(),
		name: text('name').notNull(),
		amountMinor: integer('amount_minor').notNull(),
		/** every14 | monthly | quarterly | yearly */
		ruleKind: text('rule_kind').notNull(),
		/** The anchor date, for every14, quarterly and yearly rules. */
		ruleAnchor: text('rule_anchor'),
		/** The day of the month, 1 to 31, for monthly rules. */
		ruleDay: integer('rule_day'),
		startsOn: text('starts_on').notNull(),
		endsOn: text('ends_on'),
		/** The owner's own group for it, such as "GCash"; null when ungrouped. Only a label. */
		groupName: text('group_name'),
		/** Something the owner may skip, marked `*` on the paycheck list. Still held back by the number. */
		optional: integer('optional', { mode: 'boolean' }).notNull().default(false),
		createdAt: text('created_at').notNull().default(now),
		updatedAt: text('updated_at').notNull().default(now)
	},
	(t) => [index('schedule_item_account').on(t.accountId)]
);

/**
 * One payment the owner marked paid from the plan, before a check-in has asked about it. A mark
 * moves no money: the next check-in starts with it ticked, and that check-in's answer outranks it.
 */
export const paidMark = sqliteTable(
	'paid_mark',
	{
		id: integer('id').primaryKey(),
		itemId: integer('item_id').notNull(),
		originalDate: text('original_date').notNull(),
		markedAt: text('marked_at').notNull().default(now)
	},
	(t) => [uniqueIndex('paid_mark_occurrence').on(t.itemId, t.originalDate)]
);

/** One occurrence skipped or changed, without changing its rule. */
export const occurrenceOverride = sqliteTable(
	'occurrence_override',
	{
		id: integer('id').primaryKey(),
		itemId: integer('item_id').notNull(),
		originalDate: text('original_date').notNull(),
		/** skip | change */
		action: text('action').notNull(),
		newDate: text('new_date'),
		newAmountMinor: integer('new_amount_minor'),
		createdAt: text('created_at').notNull().default(now)
	},
	(t) => [uniqueIndex('occurrence_override_item_date').on(t.itemId, t.originalDate)]
);

/**
 * One payday check-in. It exists from the moment it is started, with the step it has reached, so a
 * dropped connection resumes where it stopped; `finishedAt` is null until it is saved.
 */
export const checkIn = sqliteTable(
	'check_in',
	{
		id: integer('id').primaryKey(),
		ownerId: integer('owner_id').notNull(),
		startedAt: text('started_at').notNull(),
		finishedAt: text('finished_at'),
		/** Whole seconds from start to finish. */
		durationSeconds: integer('duration_seconds'),
		/** pay | balance | spending | payments | loans | finish | done */
		currentStep: text('current_step').notNull().default('pay'),
		payLanded: integer('pay_landed', { mode: 'boolean' }),
		payAmountMinor: integer('pay_amount_minor'),
		balanceMinor: integer('balance_minor'),
		expectedMinor: integer('expected_minor'),
		/** Expected minus actual. Can be negative: more arrived than was counted. */
		spentMinor: integer('spent_minor'),
		/** What the owner had logged as spent since the last balance when this was saved; null if nothing. */
		loggedMinor: integer('logged_minor'),
		/**
		 * When the balance step was saved: the moment the bank figure was read (ADR-0012). Finishing
		 * stamps the account's balance with this, not with the time of finishing. Null before that step.
		 */
		balanceReadAt: text('balance_read_at'),
		/** The date the balance was true on: the owner's today when the check-in was started. */
		asOf: text('as_of').notNull()
	},
	(t) => [index('check_in_owner').on(t.ownerId)]
);

/** Whether one scheduled payment went out. The occurrence is named by the date its rule gave it. */
export const paymentConfirmation = sqliteTable(
	'payment_confirmation',
	{
		id: integer('id').primaryKey(),
		checkInId: integer('check_in_id').notNull(),
		itemId: integer('item_id').notNull(),
		originalDate: text('original_date').notNull(),
		dueDate: text('due_date').notNull(),
		amountMinor: integer('amount_minor').notNull(),
		/** paid | missed */
		status: text('status').notNull()
	},
	(t) => [
		uniqueIndex('payment_confirmation_occurrence').on(t.checkInId, t.itemId, t.originalDate),
		index('payment_confirmation_item').on(t.itemId, t.originalDate)
	]
);

/** A phone's Web Push subscription. The endpoint is the identity; one phone is one row. */
export const pushSubscription = sqliteTable('push_subscription', {
	id: integer('id').primaryKey(),
	ownerId: integer('owner_id').notNull(),
	endpoint: text('endpoint').notNull().unique(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	createdAt: text('created_at').notNull().default(now),
	lastSuccessAt: text('last_success_at'),
	failedAt: text('failed_at'),
	failureReason: text('failure_reason')
});

/** One row per payday a reminder was sent for, so a restart never sends it twice. */
export const reminderSent = sqliteTable('reminder_sent', {
	paydayDate: text('payday_date').primaryKey(),
	sentAt: text('sent_at').notNull()
});

/**
 * Something the owner owes: one table for all four kinds (credit card, instalment loan, buy-now-
 * pay-later plan, informal loan). Only the projection differs by type (`#lib/domain/loans.ts`).
 * Its payments are its schedule item, so the safe-to-spend number counts each payment once.
 */
export const loan = sqliteTable(
	'loan',
	{
		id: integer('id').primaryKey(),
		ownerId: integer('owner_id').notNull(),
		/** credit-card | instalment | bnpl | informal */
		type: text('type').notNull(),
		name: text('name').notNull(),
		/** Who it is owed to. Optional. */
		lender: text('lender'),
		/** What is owed, as last entered or confirmed at a check-in. */
		balanceMinor: integer('balance_minor').notNull(),
		/** The date `balanceMinor` was true on. */
		balanceAsOf: text('balance_as_of').notNull(),
		/** The yearly rate (APR) in basis points. NULL means unknown, never a guess; 0 is a known 0%. */
		rateBp: integer('rate_bp'),
		/** The schedule item that carries this loan's payments. The item is never copied or changed. */
		scheduleItemId: integer('schedule_item_id'),
		/** A card's minimum payment: max(floor, balance x pct), capped at the balance. */
		minPctBp: integer('min_pct_bp'),
		minFloorMinor: integer('min_floor_minor'),
		createdAt: text('created_at').notNull().default(now),
		closedAt: text('closed_at')
	},
	(t) => [index('loan_owner').on(t.ownerId), index('loan_schedule_item').on(t.scheduleItemId)]
);

/** Every balance a loan has been given: when entered, and at each check-in that confirmed it. */
export const loanBalance = sqliteTable(
	'loan_balance',
	{
		id: integer('id').primaryKey(),
		loanId: integer('loan_id').notNull(),
		/** Set when the balance was confirmed at a check-in. */
		checkInId: integer('check_in_id'),
		asOf: text('as_of').notNull(),
		balanceMinor: integer('balance_minor').notNull(),
		/** entered | check-in */
		source: text('source').notNull()
	},
	(t) => [index('loan_balance_loan').on(t.loanId), index('loan_balance_check_in').on(t.checkInId)]
);
