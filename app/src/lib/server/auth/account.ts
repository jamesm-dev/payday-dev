import { and, eq, sql } from 'drizzle-orm';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import {
	getPasswordHash,
	hashPassword,
	passwordProblem,
	PasswordBusyError,
	verifyOwnerPassword
} from './password.ts';
import {
	CLOSED_REGISTRATION,
	ownerExists,
	registerOwner,
	RegistrationClosedError
} from './passkeys.ts';
import { normaliseEmail } from './email.ts';
import { deleteOtherSessions, sessionExists } from './session.ts';

export type Refusal = {
	status: number;
	message: string;
	/** True when the attempt guessed at a secret, so it counts against the failure limits. */
	guess: boolean;
	/** The field the message is about, when it is one field's. */
	field?: 'email' | 'password';
};

const MISMATCH = 'The two passwords are not the same. Type the same one twice.';
export const CHANGED_MEANWHILE =
	'Your password just changed. Sign in again with the new one, then try again.';
const BUSY: Refusal = { status: 503, message: new PasswordBusyError().message, guess: false };

/** Checks a new password typed twice. Returns what to tell the owner, or null when it will do. */
export function newPasswordProblem(
	password: unknown,
	again: unknown,
	setupCode?: string
): string | null {
	const problem = passwordProblem(password, setupCode);
	if (problem) return problem;
	return password === again ? null : MISMATCH;
}

/**
 * The first registration: an email, and a new password typed twice, become the first owner's, in one
 * transaction that also issues the recovery codes. Refuses once an owner exists. Every account has
 * an email from the start, the first one too (the owner's request, 2026-11-16): nothing is sent to
 * it, it is only how they sign in. (The setup code and the per-IP limit are the caller's: they need
 * the request.)
 */
export async function registerWithPassword(
	db: Db,
	email: unknown,
	password: unknown,
	again: unknown,
	setupCode?: string,
	now = new Date()
): Promise<
	{ ok: true; ownerId: number; recoveryCodes: string[] } | { ok: false; refusal: Refusal }
> {
	const closed: Refusal = {
		status: 403,
		message: CLOSED_REGISTRATION,
		guess: false
	};
	// Cheap checks first, so a closed door never costs a hash.
	if (await ownerExists(db)) return { ok: false, refusal: closed };
	const address = normaliseEmail(email);
	if (!address.ok) {
		return {
			ok: false,
			refusal: { status: 400, message: address.message, guess: false, field: 'email' }
		};
	}
	const problem = newPasswordProblem(password, again, setupCode);
	if (problem) {
		return {
			ok: false,
			refusal: { status: 400, message: problem, guess: false, field: 'password' }
		};
	}
	try {
		const hash = await hashPassword(password as string);
		// Another registration may have landed while this one hashed: the transaction checks again.
		return { ok: true, ...(await registerOwner(db, hash, address.email, now)) };
	} catch (error) {
		if (error instanceof RegistrationClosedError) return { ok: false, refusal: closed };
		if (error instanceof PasswordBusyError) return { ok: false, refusal: BUSY };
		throw error;
	}
}

export type ChangePasswordInput = {
	ownerId: number;
	/** The session making the change: it stays signed in; every other one ends. */
	sessionId: string;
	/** What was typed as the current password; empty when the owner left it blank. */
	current: unknown;
	password: unknown;
	again: unknown;
	/**
	 * Whether this session may change the password without the old one: a fresh step-up, or a
	 * recovery-code sign-in's 10-minute window.
	 */
	stepUpOk: boolean;
	setupCode?: string;
};

export type ChangePasswordResult =
	| {
			ok: true;
			/** The sessions that were ended, so the caller can forget their step-up records. */
			endedSessions: string[];
			/** The old password was typed and was right: that is itself a fresh proof. */
			provedWithPassword: boolean;
	  }
	| { ok: false; refusal: Refusal };

/**
 * Sets a new password. Needs the current one, or a step-up (a password or passkey confirmation in
 * the last 5 minutes) or the recovery window. If the current password IS typed it must be right,
 * whatever else the session has. Ends every other session, so a stolen session cannot outlive the change.
 */
export async function changePassword(
	db: Db,
	input: ChangePasswordInput
): Promise<ChangePasswordResult> {
	const { ownerId } = input;
	const typedCurrent = typeof input.current === 'string' && input.current.length > 0;
	try {
		let provedWithPassword = false;
		// The stored hash this change is based on: the one the typed password was verified against,
		// or, with a step-up instead, the one in the row now. The write below only lands if the row
		// still holds exactly this, so two changes (or a change and a sign-in) cannot both win.
		let basedOn: string | null;
		if (typedCurrent) {
			const check = await verifyOwnerPassword(db, ownerId, input.current);
			if (!check.ok) {
				return {
					ok: false,
					refusal: { status: 400, message: 'Your current password is not right.', guess: true }
				};
			}
			basedOn = check.hash;
			provedWithPassword = true;
		} else if (!input.stepUpOk) {
			return {
				ok: false,
				refusal: {
					status: 403,
					message: 'Enter your current password, or confirm it is you first.',
					guess: false
				}
			};
		} else {
			basedOn = await getPasswordHash(db, ownerId);
		}

		const problem = newPasswordProblem(input.password, input.again, input.setupCode);
		if (problem) return { ok: false, refusal: { status: 400, message: problem, guess: false } };

		const hash = await hashPassword(input.password as string);

		// One transaction under the owner row lock (a sign-in takes the same one): check this session is
		// still signed in, write only over the hash this change was based on, then end the others.
		// Anything else rolls the whole thing back.
		const outcome = await db.transaction(
			async (tx): Promise<string[] | 'changed' | 'signed-out'> => {
				await lockOwner(tx, ownerId);
				if (!(await sessionExists(tx, input.sessionId))) return 'signed-out';
				const written = await tx
					.update(owner)
					.set({ passwordHash: hash })
					.where(
						and(eq(owner.id, ownerId), sql`${owner.passwordHash} IS NOT DISTINCT FROM ${basedOn}`)
					)
					.returning({ id: owner.id });
				if (written.length !== 1) return 'changed';
				return deleteOtherSessions(tx, ownerId, input.sessionId);
			}
		);
		if (outcome === 'changed') {
			return {
				ok: false,
				refusal: { status: 409, message: CHANGED_MEANWHILE, guess: false }
			};
		}
		if (outcome === 'signed-out') {
			return {
				ok: false,
				refusal: {
					status: 403,
					message: 'This device was signed out. Sign in again.',
					guess: false
				}
			};
		}
		return { ok: true, endedSessions: outcome, provedWithPassword };
	} catch (error) {
		if (error instanceof PasswordBusyError) return { ok: false, refusal: BUSY };
		throw error;
	}
}
