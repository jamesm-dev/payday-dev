import { sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { newPasswordProblem } from './account.ts';
import { normaliseEmail } from './email.ts';
import { hashPassword, PasswordBusyError } from './password.ts';
import { insertOwner, REGISTRATION_LOCK } from './passkeys.ts';
import {
	createRateLimiter,
	createSlotLimiter,
	type RateLimiter,
	type SlotLimiter
} from './rateLimit.ts';
import { beginAttempt } from './signInAttempt.ts';

/*
 * Sign-up (ADR-0026): an email and a password make a new account with an empty budget. Nothing is
 * sent and the address is not checked. This door is open to strangers, so it has three guards:
 *
 *  - the account cap: at most MAX_ACCOUNTS people. "Full" is looked at FIRST, before any limiter
 *    writes a stamp, so a visitor turned away for fullness leaves nothing behind. It is looked at
 *    again inside the insert's transaction, under an advisory lock, because two sign-ups at 99
 *    would otherwise both count 99 and both get in;
 *  - the limits: 3 new accounts an hour per address, 30 an hour for the whole site;
 *  - the hash queue: sign-up hashes a password, so it takes a place like a sign-in does.
 *
 * The email is never logged: this file does not log at all.
 */

/** Accounts stop here for now. A constant in code on purpose (decision 3 of Phase 9). */
export const MAX_ACCOUNTS = 100;
export const SIGN_UP_PER_ADDRESS = 3;
export const SIGN_UP_PER_SITE = 30;
export const SIGN_UP_WINDOW_MS = 60 * 60 * 1000;

export const FULL_MESSAGE =
	'Sign-up is full for now. If you already have an account, you can sign in.';
export const TAKEN_MESSAGE = 'An account with this email already exists. Sign in instead.';
export const LIMIT_MESSAGE = 'Too many new accounts were made just now. Please try again later.';
export const CLOSED_MESSAGE = 'Sign-up is not open yet.';

/** How many accounts exist. */
export async function countAccounts(db: Db): Promise<number> {
	const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(owner);
	return row!.n;
}

/** Whether a new person may still sign up. A read only: it writes nothing. */
export async function signUpOpen(db: Db): Promise<boolean> {
	return (await countAccounts(db)) < MAX_ACCOUNTS;
}

export type SignUpLimits = { limiter: RateLimiter; slots: SlotLimiter };

/**
 * One limiter made of two: a new account is charged to its address AND to the whole site, and the
 * first charge is given back if the second is refused. A refund gives back both.
 */
function bothLimits(perAddress: RateLimiter, site: RateLimiter): RateLimiter {
	const SITE = 'all';
	return {
		isLimited: async (db, key, now) =>
			(await perAddress.isLimited(db, key, now)) || (await site.isLimited(db, SITE, now)),
		recordFailure: async (db, key, now) => {
			await perAddress.recordFailure(db, key, now);
			await site.recordFailure(db, SITE, now);
		},
		async hit(db, key, now) {
			if (!(await perAddress.hit(db, key, now))) return false;
			if (await site.hit(db, SITE, now)) return true;
			await perAddress.refund(db, key);
			return false;
		},
		refund: async (db, key) => {
			await perAddress.refund(db, key);
			await site.refund(db, SITE);
		},
		sweep: async (db, now) => {
			await perAddress.sweep(db, now);
			await site.sweep(db, now);
		},
		size: async (db) => (await perAddress.size(db)) + (await site.size(db))
	};
}

/** The sign-up limits. IPv6 addresses are keyed by their /48, as the sign-in limits are. */
export function createSignUpLimits(
	perAddress = SIGN_UP_PER_ADDRESS,
	perSite = SIGN_UP_PER_SITE
): SignUpLimits {
	return {
		limiter: bothLimits(
			createRateLimiter('sign-up-address', perAddress, SIGN_UP_WINDOW_MS, 5000, 48),
			createRateLimiter('sign-up-site', perSite, SIGN_UP_WINDOW_MS, 1, 48)
		),
		slots: createSlotLimiter('sign-up-slots')
	};
}

export const signUpLimits = createSignUpLimits();

export type SignUpInput = {
	email: unknown;
	password: unknown;
	again: unknown;
	/** The client address, as `clientKey` gives it. */
	address: string;
};

export type SignUpRefusal = {
	ok: false;
	reason: 'full' | 'closed' | 'invalid' | 'taken' | 'limit' | 'busy';
	status: number;
	message: string;
	/** The input the message belongs to. */
	field: 'email' | 'password' | 'form';
};

export type SignUpResult = { ok: true; ownerId: number; recoveryCodes: string[] } | SignUpRefusal;

const refuse = (
	reason: SignUpRefusal['reason'],
	status: number,
	message: string,
	field: SignUpRefusal['field'] = 'form'
): SignUpRefusal => ({ ok: false, reason, status, message, field });

const FULL = refuse('full', 403, FULL_MESSAGE);

async function emailTaken(db: Db, email: string): Promise<boolean> {
	const found = await db
		.select({ id: owner.id })
		.from(owner)
		.where(sql`lower(${owner.email}) = ${email}`)
		.limit(1);
	return found.length > 0;
}

/** Whether the database refused a row because a unique index already holds it (SQLSTATE 23505). */
function isUniqueViolation(error: unknown): boolean {
	for (let e = error as { code?: unknown; cause?: unknown } | undefined, n = 0; e && n < 5; n++) {
		if (e.code === '23505') return true;
		e = e.cause as typeof e;
	}
	return false;
}

/**
 * Creates an account, or says in plain words why not. In this order:
 *  1. Full? Then stop: nothing is written, no limiter stamp.
 *  2. The email and the password, checked without the database.
 *  3. The limits and a place in the hash queue (the attempt is charged now, as at sign-in).
 *  4. Is the email taken? Then stop before the hash.
 *  5. Hash the password.
 *  6. One transaction: advisory lock, count the accounts, check the email, insert the owner and the
 *     recovery codes. The lock makes two sign-ups at 99 take turns, so the second counts 100.
 * A refusal at step 6 for fullness gives the charge back; a taken email keeps it.
 */
export async function signUp(
	db: Db,
	input: SignUpInput,
	now = new Date(),
	limits: SignUpLimits = signUpLimits
): Promise<SignUpResult> {
	if (!(await signUpOpen(db))) return FULL;

	const email = normaliseEmail(input.email);
	if (!email.ok) return refuse('invalid', 400, email.message, 'email');
	const problem = newPasswordProblem(input.password, input.again);
	if (problem) return refuse('invalid', 400, problem, 'password');

	const attempt = await beginAttempt(db, input.address, limits.limiter, limits.slots);
	if (!attempt.ok) {
		return attempt.reason === 'busy'
			? refuse('busy', 503, new PasswordBusyError().message)
			: refuse('limit', 429, LIMIT_MESSAGE);
	}

	// `done(true)` gives the charge back; `done(false)` keeps it. Only a new account, or a guess at
	// which emails exist, costs the address one of its three.
	let giveBack = false;
	try {
		if (await emailTaken(db, email.email)) return refuse('taken', 409, TAKEN_MESSAGE, 'email');
		const hash = await hashPassword(input.password as string);
		const outcome = await db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(${REGISTRATION_LOCK}::bigint)`);
			const accounts = await countAccounts(tx);
			// Nobody has registered yet: the first account goes through the setup code, not here.
			if (accounts === 0) return 'closed' as const;
			if (accounts >= MAX_ACCOUNTS) return 'full' as const;
			if (await emailTaken(tx, email.email)) return 'taken' as const;
			return insertOwner(tx, hash, email.email, now);
		});
		if (outcome === 'closed') {
			giveBack = true;
			return refuse('closed', 403, CLOSED_MESSAGE);
		}
		if (outcome === 'full') {
			giveBack = true;
			return FULL;
		}
		if (outcome === 'taken') return refuse('taken', 409, TAKEN_MESSAGE, 'email');
		return { ok: true, ...outcome };
	} catch (error) {
		if (error instanceof PasswordBusyError) {
			giveBack = true;
			return refuse('busy', 503, error.message);
		}
		// Settings may have given someone this email between the check and the insert.
		if (isUniqueViolation(error)) return refuse('taken', 409, TAKEN_MESSAGE, 'email');
		throw error;
	} finally {
		await attempt.done(giveBack);
	}
}
