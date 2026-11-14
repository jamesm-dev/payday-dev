import { and, asc, eq } from 'drizzle-orm';
import { lockOwner } from '#lib/server/db/lock.ts';
import type { Db } from '#lib/server/db/open.ts';
import { owner, passkey } from '#lib/server/db/schema.ts';
import { insertRecoveryCodes } from './recovery.ts';
import { sessionExists } from './session.ts';

/** There is one owner and the row is always id 1 (ADR-0006). Passkeys are optional extras (ADR-0010). */
export const OWNER_ID = 1;

export class RegistrationClosedError extends Error {
	constructor() {
		super('Registration is closed: this Payday already has an owner.');
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

export const ownerExists = async (db: Db): Promise<boolean> =>
	(await db.select({ id: owner.id }).from(owner).where(eq(owner.id, OWNER_ID))).length > 0;

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
 * The first registration: creates the owner with their password hash and issues the recovery codes
 * in one transaction. Refuses, writing nothing, once an owner exists: the owner row's primary key
 * lets only one of two racing registrations insert it, and the other is refused. A passkey is added
 * afterwards, if the owner wants one.
 */
export function registerOwner(
	db: Db,
	passwordHash: string,
	now = new Date()
): Promise<{ ownerId: number; recoveryCodes: string[] }> {
	return db.transaction(async (tx) => {
		const created = await tx
			.insert(owner)
			.values({ id: OWNER_ID, passwordHash, createdAt: now.toISOString() })
			.onConflictDoNothing()
			.returning({ id: owner.id });
		if (created.length === 0) throw new RegistrationClosedError();
		return { ownerId: OWNER_ID, recoveryCodes: await insertRecoveryCodes(tx, OWNER_ID, now) };
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
 */
export function removePasskeyUnlessLast(
	db: Db,
	ownerId: number,
	id: string
): Promise<'removed' | 'not-found' | 'needs-password'> {
	return db.transaction(async (tx) => {
		// The owner lock makes two removals take turns, so each sees what the other left.
		await lockOwner(tx, ownerId);
		const [row] = await tx
			.select({ hash: owner.passwordHash })
			.from(owner)
			.where(eq(owner.id, ownerId));
		const passkeys = await listPasskeys(tx, ownerId);
		if (!row?.hash && passkeys.length <= 1) {
			return passkeys.some((p) => p.id === id) ? 'needs-password' : 'not-found';
		}
		return (await removePasskey(tx, ownerId, id)) ? 'removed' : 'not-found';
	});
}
