import { and, eq, ne } from 'drizzle-orm';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import { owner, passkey } from '#lib/server/db/schema.ts';
import { normaliseEmail } from '../email.ts';
import {
	emailTaken,
	FULL_MESSAGE,
	isUniqueViolation,
	signUpFull,
	signUpGuarded,
	signUpLimits,
	type SignUpLimits
} from '../signUp.ts';

/*
 * Google accounts (ADR-0028): sign up, sign in, connect, disconnect and confirm, as server logic.
 * Every function takes the verified `{ sub, email }` from Google's ID token (google/oidc.ts checks
 * it); here it is only input. Nothing is logged: the account id and the email stay out of logs.
 *
 * No linking by email. Payday does not check emails, so a matching email proves nothing: an
 * unknown Google account whose email matches an existing account is refused, and the person is
 * told how to connect Google from inside the account instead.
 */

/** What Google tells us about a person: its stable account number and their email. */
export type GoogleIdentity = { sub: string; email: string };

export const EMAIL_EXISTS_MESSAGE =
	'An account with this email already exists. Sign in with your password, then connect Google in Settings › Security.';
const BAD_GOOGLE_MESSAGE = 'Google did not give an account to sign in with. Please try again.';

export type GoogleRefusal = {
	ok: false;
	reason: 'full' | 'closed' | 'invalid' | 'email-exists' | 'limit' | 'busy';
	status: number;
	message: string;
};

export type GoogleSignIn =
	| { ok: true; created: false; ownerId: number }
	| { ok: true; created: true; ownerId: number; recoveryCodes: string[] }
	| GoogleRefusal;

const refuse = (
	reason: GoogleRefusal['reason'],
	status: number,
	message: string
): GoogleRefusal => ({
	ok: false,
	reason,
	status,
	message
});

async function ownerIdBySub(db: Db, sub: string): Promise<number | null> {
	const [row] = await db.select({ id: owner.id }).from(owner).where(eq(owner.googleSub, sub));
	return row?.id ?? null;
}

/**
 * Signs in with Google, or makes a new account. In this order, writing nothing until the last step:
 *  1. A known account id: that owner signs in (even when sign-up is full).
 *  2. An email that matches an existing account: refused, nothing written.
 *  3. Full? Then stop: no limiter stamp.
 *  4. A newcomer goes through the SAME sign-up function email sign-up uses (`signUpGuarded`): the
 *     same per-address and site-wide limits, the registration lock taken before the count, closed
 *     with no accounts, refused at 100, the recovery codes made. The email and the Google account
 *     id are stored, with no password. The codes come back for the caller's one-time slot.
 * The caller starts the session (cookie.ts, method 'google') and keeps the codes for one showing.
 */
export async function signInWithGoogle(
	db: Db,
	google: GoogleIdentity,
	address: string,
	now = new Date(),
	limits: SignUpLimits = signUpLimits
): Promise<GoogleSignIn> {
	if (!google.sub) return refuse('invalid', 400, BAD_GOOGLE_MESSAGE);

	const known = await ownerIdBySub(db, google.sub);
	if (known !== null) return { ok: true, created: false, ownerId: known };

	const email = normaliseEmail(google.email);
	if (!email.ok) return refuse('invalid', 400, BAD_GOOGLE_MESSAGE);
	if (await emailTaken(db, email.email)) return refuse('email-exists', 409, EMAIL_EXISTS_MESSAGE);

	if (await signUpFull(db)) return refuse('full', 403, FULL_MESSAGE);

	const result = await signUpGuarded(
		db,
		{ email: email.email, address, hash: null, googleSub: google.sub },
		now,
		limits
	);
	if (result.ok)
		return {
			ok: true,
			created: true,
			ownerId: result.ownerId,
			recoveryCodes: result.recoveryCodes
		};
	if (result.reason === 'taken') {
		// Two callbacks for the same new person at once: the second finds the first's account.
		const again = await ownerIdBySub(db, google.sub);
		if (again !== null) return { ok: true, created: false, ownerId: again };
		return refuse('email-exists', 409, EMAIL_EXISTS_MESSAGE);
	}
	return refuse(result.reason, result.status, result.message);
}

export type ConnectResult = 'connected' | 'sub-taken' | 'other-google';

/**
 * Connects a Google account to the signed-in account. Under the owner lock. Refused when that Google
 * account already belongs to another person, and when this account already has a different one
 * (disconnect first). Connecting the same one again changes nothing. The account's email is never
 * changed. The caller checks the step-up first.
 */
export function connectGoogle(
	db: Db,
	ownerId: number,
	google: GoogleIdentity
): Promise<ConnectResult> {
	return db
		.transaction(async (tx) => {
			await lockOwner(tx, ownerId);
			const [me] = await tx
				.select({ sub: owner.googleSub })
				.from(owner)
				.where(eq(owner.id, ownerId));
			if (me?.sub)
				return me.sub === google.sub ? ('connected' as const) : ('other-google' as const);
			if (!google.sub) return 'sub-taken' as const;
			const [other] = await tx
				.select({ id: owner.id })
				.from(owner)
				.where(and(eq(owner.googleSub, google.sub), ne(owner.id, ownerId)));
			if (other) return 'sub-taken' as const;
			await tx.update(owner).set({ googleSub: google.sub }).where(eq(owner.id, ownerId));
			return 'connected' as const;
		})
		.catch((error: unknown) => {
			// The unique index is the last word if two connects race for the same account id.
			if (isUniqueViolation(error)) return 'sub-taken' as const;
			throw error;
		});
}

export type DisconnectResult = 'disconnected' | 'last-way-in' | 'not-connected';

/**
 * Disconnects Google, under the owner lock, but never the last way in: a password or at least one
 * passkey must remain. (Recovery codes are a way back, not a way in.) The caller checks the step-up.
 */
export function disconnectGoogle(db: Db, ownerId: number): Promise<DisconnectResult> {
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		const [me] = await tx
			.select({ sub: owner.googleSub, hash: owner.passwordHash })
			.from(owner)
			.where(eq(owner.id, ownerId));
		if (!me?.sub) return 'not-connected';
		const keys = await tx
			.select({ id: passkey.id })
			.from(passkey)
			.where(eq(passkey.ownerId, ownerId))
			.limit(1);
		if (!me.hash && keys.length === 0) return 'last-way-in';
		await tx.update(owner).set({ googleSub: null }).where(eq(owner.id, ownerId));
		return 'disconnected';
	});
}

/**
 * Whether the account's connected Google account id is exactly `sub`: the check behind "Confirm
 * with Google". False when none is connected or the id is empty. The caller then records it with
 * `stepUps.markGoogleConfirmation`, a weaker, shorter proof than a password (ADR-0028).
 */
export async function confirmWithGoogle(db: Db, ownerId: number, sub: string): Promise<boolean> {
	if (!sub) return false;
	const [me] = await db.select({ sub: owner.googleSub }).from(owner).where(eq(owner.id, ownerId));
	return me?.sub === sub;
}
