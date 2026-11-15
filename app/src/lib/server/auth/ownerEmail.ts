import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { normaliseEmail } from './email.ts';
import { createRateLimiter } from './rateLimit.ts';

/** The address this person signs in with, or null while they have not added one. */
export async function getOwnerEmail(db: Db, ownerId: number): Promise<string | null> {
	const [row] = await db.select({ email: owner.email }).from(owner).where(eq(owner.id, ownerId));
	return row?.email ?? null;
}

export const EMAIL_TAKEN =
	'That email address is already used by another account. Use a different one.';

/**
 * Email changes are limited three ways, and every try that reaches the lookup is charged to all of
 * them. The charge is KEPT when the answer is "taken" (and when it works), so "that email is already
 * used" cannot be asked over and over to list who has an account:
 *  - 3 an hour per ACCOUNT, however many addresses the person comes from: this is the one that stops
 *    a person checking emails one after another from their own account;
 *  - a higher ceiling per internet address (15, five people's worth), so a shared address (many phones behind one) is
 *    never blocked by what other people there did, while one machine with many accounts is still held;
 *  - 30 an hour for the whole site, as sign-up has.
 * The per-account counter is keyed by the account number and is removed when the account is deleted
 * (deleteAccount.ts).
 */
export const EMAIL_CHANGES_PER_ACCOUNT = 3;
export const EMAIL_CHANGES_PER_ADDRESS = 15;
export const EMAIL_CHANGES_PER_SITE = 30;
const HOUR = 60 * 60 * 1000;
export const EMAIL_CHANGE_ACCOUNT_SCOPE = 'email-change-account';
const perAccount = createRateLimiter(
	EMAIL_CHANGE_ACCOUNT_SCOPE,
	EMAIL_CHANGES_PER_ACCOUNT,
	HOUR,
	5000
);
const perAddress = createRateLimiter(
	'email-change-address',
	EMAIL_CHANGES_PER_ADDRESS,
	HOUR,
	5000,
	48
);
const perSite = createRateLimiter('email-change-site', EMAIL_CHANGES_PER_SITE, HOUR, 1, 48);

export const EMAIL_CHANGE_LIMIT =
	'You have tried to change your email too many times. Please wait an hour, then try again.';

/** Charges one email change. False (nothing kept) when any of the three limits is already reached. */
export async function chargeEmailChange(
	db: Db,
	ownerId: number,
	address: string,
	now = Date.now()
): Promise<boolean> {
	const account = String(ownerId);
	if (!(await perAccount.hit(db, account, now))) return false;
	if (!(await perAddress.hit(db, address, now))) {
		await perAccount.refund(db, account);
		return false;
	}
	if (!(await perSite.hit(db, 'all', now))) {
		await perAccount.refund(db, account);
		await perAddress.refund(db, address);
		return false;
	}
	return true;
}

export type SetEmailResult = { ok: true; email: string } | { ok: false; message: string };

const isUniqueViolation = (error: unknown): boolean => {
	let e: unknown = error;
	for (let depth = 0; e && depth < 4; depth++) {
		if ((e as { code?: string }).code === '23505') return true;
		e = (e as { cause?: unknown }).cause;
	}
	return false;
};

/**
 * Adds or changes the address, after the caller has made sure it is the person (their password or a
 * fresh confirmation). Stored lower case and trimmed; one address belongs to one account, in any
 * case. No email is ever sent or checked (ADR-0022).
 */
export async function setOwnerEmail(
	db: Db,
	ownerId: number,
	raw: unknown
): Promise<SetEmailResult> {
	const checked = normaliseEmail(raw);
	if (!checked.ok) return checked;
	const [taken] = await db
		.select({ id: owner.id })
		.from(owner)
		.where(and(eq(owner.email, checked.email), ne(owner.id, ownerId)))
		.limit(1);
	if (taken) return { ok: false, message: EMAIL_TAKEN };
	try {
		const updated = await db
			.update(owner)
			.set({ email: checked.email })
			.where(eq(owner.id, ownerId))
			.returning({ id: owner.id });
		if (updated.length === 0) return { ok: false, message: 'This account no longer exists.' };
	} catch (error) {
		// Two people adding the same address at once: the database's unique index decides.
		if (isUniqueViolation(error)) return { ok: false, message: EMAIL_TAKEN };
		throw error;
	}
	return { ok: true, email: checked.email };
}
