import { and, asc, eq, sql } from 'drizzle-orm';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import { owner, passkey } from '#lib/server/db/schema.ts';
import { insertRecoveryCodes } from './recovery.ts';
import { sessionExists } from './session.ts';

/** What a first registration is told once anyone has an account. */
export const CLOSED_REGISTRATION =
	'Registration is closed. This Payday is already set up: sign in, or create a free account.';

export class RegistrationClosedError extends Error {
	constructor() {
		super(CLOSED_REGISTRATION);
	}
}

export type NewPasskey = {
	id: string;
	publicKey: Uint8Array;
	counter: number;
	transports?: string[];
	deviceType?: string;
	backedUp?: boolean;
	nickname: string;
};

/** Whether anyone has an account. The setup-code first registration is open only while this is false. */
export const ownerExists = async (db: Db): Promise<boolean> =>
	(await db.select({ id: owner.id }).from(owner).limit(1)).length > 0;

/** Whether any passkey exists, so the sign-in page can offer the device button before anyone is named. */
export const anyPasskeyExists = async (db: Db): Promise<boolean> =>
	(await db.select({ id: passkey.id }).from(passkey).limit(1)).length > 0;

/**
 * An arbitrary constant: the transaction-level advisory lock that every way of making an account
 * takes first, the setup-code first registration (here) and sign-up (signUp.ts) alike. Because it is
 * the same lock, "no account exists yet" cannot change between the first registration's check and its
 * insert, however many sign-ups run at the same moment.
 */
export const REGISTRATION_LOCK = 7_300_901;

/** A name the owner recognises: trimmed, bounded, never empty. */
export function cleanNickname(raw: unknown, fallback = 'This device'): string {
	const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
	return text || fallback;
}

async function insertPasskey(db: Db, ownerId: number, p: NewPasskey, now: Date) {
	await db.insert(passkey).values({
		id: p.id,
		ownerId,
		publicKey: Buffer.from(p.publicKey),
		counter: p.counter,
		transports: p.transports ? JSON.stringify(p.transports) : null,
		deviceType: p.deviceType ?? null,
		backedUp: p.backedUp ?? false,
		nickname: cleanNickname(p.nickname),
		createdAt: now.toISOString()
	});
}

/**
 * Creates an owner with their password hash (and an email, when they have one) and issues their
 * recovery codes. The caller owns the transaction and the lock that decides whether the door is
 * open: the first registration (below) and sign-up (signUp.ts) each take their own.
 * The id comes from the table's counter, never from the caller.
 * A Google account has no password: it passes a null hash AND its Google account id. A null hash
 * without one is refused, so no account is ever made with no way in at all.
 */
export async function insertOwner(
	db: Db,
	passwordHash: string | null,
	email: string | null,
	now = new Date(),
	googleSub: string | null = null
): Promise<{ ownerId: number; recoveryCodes: string[] }> {
	if (passwordHash === null && !googleSub) {
		throw new Error('An account needs a password or a Google account.');
	}
	const [created] = await db
		.insert(owner)
		.values({ passwordHash, email, googleSub, createdAt: now.toISOString() })
		.returning({ id: owner.id });
	const ownerId = created!.id;
	return { ownerId, recoveryCodes: await insertRecoveryCodes(db, ownerId, now) };
}

/**
 * The first registration: creates the first owner with their password hash and issues the recovery
 * codes in one transaction. Refuses, writing nothing, once any owner exists. Two racing registrations
 * take turns on a transaction-level advisory lock (it works through a transaction pooler), and the
 * second finds the first one's row and is refused. A passkey is added afterwards, if the owner wants one.
 */
export function registerOwner(
	db: Db,
	passwordHash: string,
	email: string,
	now = new Date()
): Promise<{ ownerId: number; recoveryCodes: string[] }> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${REGISTRATION_LOCK}::bigint)`);
		if (await ownerExists(tx)) throw new RegistrationClosedError();
		return insertOwner(tx, passwordHash, email, now);
	});
}

export async function addPasskey(
	db: Db,
	ownerId: number,
	p: NewPasskey,
	now = new Date()
): Promise<void> {
	await insertPasskey(db, ownerId, p, now);
}

/**
 * Adds a passkey only if the session asking is still signed in, checked under the owner row lock a
 * password change also takes, so a session ended meanwhile adds nothing. False when it had ended.
 */
export function addPasskeyForSession(
	db: Db,
	ownerId: number,
	sessionId: string,
	p: NewPasskey,
	now = new Date()
): Promise<boolean> {
	return db.transaction(async (tx) => {
		await lockOwner(tx, ownerId);
		if (!(await sessionExists(tx, sessionId))) return false;
		await insertPasskey(tx, ownerId, p, now);
		return true;
	});
}

export const listPasskeys = async (db: Db, ownerId: number) =>
	db
		.select()
		.from(passkey)
		.where(eq(passkey.ownerId, ownerId))
		.orderBy(asc(passkey.createdAt), asc(passkey.id));

export const findPasskey = async (db: Db, id: string) =>
	(await db.select().from(passkey).where(eq(passkey.id, id)))[0];

export async function recordPasskeyUse(
	db: Db,
	id: string,
	counter: number,
	now = new Date()
): Promise<void> {
	await db
		.update(passkey)
		.set({ counter, lastUsedAt: now.toISOString() })
		.where(eq(passkey.id, id));
}

export async function renamePasskey(
	db: Db,
	ownerId: number,
	id: string,
	nickname: unknown
): Promise<boolean> {
	const renamed = await db
		.update(passkey)
		.set({ nickname: cleanNickname(nickname) })
		.where(and(eq(passkey.id, id), eq(passkey.ownerId, ownerId)))
		.returning({ id: passkey.id });
	return renamed.length > 0;
}

export const hasPasskeys = async (db: Db, ownerId: number): Promise<boolean> =>
	(await db.select({ id: passkey.id }).from(passkey).where(eq(passkey.ownerId, ownerId))).length >
	0;

/** Removes one passkey, even the last: the password always remains (ADR-0010). */
export async function removePasskey(db: Db, ownerId: number, id: string): Promise<boolean> {
	const removed = await db
		.delete(passkey)
		.where(and(eq(passkey.id, id), eq(passkey.ownerId, ownerId)))
		.returning({ id: passkey.id });
	return removed.length > 0;
}

/**
 * Removes a passkey, but never the owner's last way in: with no password set, the last passkey stays.
 * (An owner created before migration 0006 has no password until they set one.) One transaction.
 * A connected Google account is a way in only while Google is switched on: the caller passes
 * `googleOn` (`googleConfig() !== null`), so this reads no environment and stays testable. Off by
 * default: with Google off, the password and the passkeys are all that count.
 */
export function removePasskeyUnlessLast(
	db: Db,
	ownerId: number,
	id: string,
	googleOn = false
): Promise<'removed' | 'not-found' | 'needs-password'> {
	return db.transaction(async (tx) => {
		// The owner lock makes two removals take turns, so each sees what the other left.
		await lockOwner(tx, ownerId);
		const [row] = await tx
			.select({ hash: owner.passwordHash, sub: owner.googleSub })
			.from(owner)
			.where(eq(owner.id, ownerId));
		const passkeys = await listPasskeys(tx, ownerId);
		const googleWayIn = googleOn && !!row?.sub;
		if (!row?.hash && !googleWayIn && passkeys.length <= 1) {
			return passkeys.some((p) => p.id === id) ? 'needs-password' : 'not-found';
		}
		return (await removePasskey(tx, ownerId, id)) ? 'removed' : 'not-found';
	});
}
