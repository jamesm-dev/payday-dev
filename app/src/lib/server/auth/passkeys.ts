import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { owner, passkey } from '#lib/server/db/schema.ts';
import { insertRecoveryCodes } from './recovery.ts';

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

export const ownerExists = (db: Db): boolean =>
	db.select({ id: owner.id }).from(owner).where(eq(owner.id, OWNER_ID)).get() !== undefined;

/** A name the owner recognises: trimmed, bounded, never empty. */
export function cleanNickname(raw: unknown, fallback = 'This device'): string {
	const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
	return text || fallback;
}

function insertPasskey(db: Db, ownerId: number, p: NewPasskey, now: Date) {
	db.insert(passkey)
		.values({
			id: p.id,
			ownerId,
			publicKey: Buffer.from(p.publicKey),
			counter: p.counter,
			transports: p.transports ? JSON.stringify(p.transports) : null,
			deviceType: p.deviceType ?? null,
			backedUp: p.backedUp ?? false,
			nickname: cleanNickname(p.nickname),
			createdAt: now.toISOString()
		})
		.run();
}

/**
 * The first registration: creates the owner with their password hash and issues the recovery codes
 * in one transaction. Refuses, writing nothing, once an owner exists (the check and the insert are
 * one transaction, so two racing registrations cannot both win). A passkey is added afterwards, if
 * the owner wants one.
 */
export function registerOwner(
	db: Db,
	passwordHash: string,
	now = new Date()
): { ownerId: number; recoveryCodes: string[] } {
	return db.transaction(() => {
		if (ownerExists(db)) throw new RegistrationClosedError();
		db.insert(owner).values({ id: OWNER_ID, passwordHash, createdAt: now.toISOString() }).run();
		return { ownerId: OWNER_ID, recoveryCodes: insertRecoveryCodes(db, OWNER_ID, now) };
	});
}

export function addPasskey(db: Db, ownerId: number, p: NewPasskey, now = new Date()): void {
	insertPasskey(db, ownerId, p, now);
}

export const listPasskeys = (db: Db, ownerId: number) =>
	db
		.select()
		.from(passkey)
		.where(eq(passkey.ownerId, ownerId))
		.orderBy(asc(passkey.createdAt), asc(passkey.id))
		.all();

export const findPasskey = (db: Db, id: string) =>
	db.select().from(passkey).where(eq(passkey.id, id)).get();

export function recordPasskeyUse(db: Db, id: string, counter: number, now = new Date()): void {
	db.update(passkey)
		.set({ counter, lastUsedAt: now.toISOString() })
		.where(eq(passkey.id, id))
		.run();
}

export function renamePasskey(db: Db, ownerId: number, id: string, nickname: unknown): boolean {
	const result = db
		.update(passkey)
		.set({ nickname: cleanNickname(nickname) })
		.where(and(eq(passkey.id, id), eq(passkey.ownerId, ownerId)))
		.run();
	return result.changes > 0;
}

export const hasPasskeys = (db: Db, ownerId: number): boolean =>
	db.select({ id: passkey.id }).from(passkey).where(eq(passkey.ownerId, ownerId)).get() !==
	undefined;

/** Removes one passkey, even the last: the password always remains (ADR-0010). */
export function removePasskey(db: Db, ownerId: number, id: string): boolean {
	const result = db
		.delete(passkey)
		.where(and(eq(passkey.id, id), eq(passkey.ownerId, ownerId)))
		.run();
	return result.changes > 0;
}

/**
 * Removes a passkey, but never the owner's last way in: with no password set, the last passkey stays.
 * (An owner created before migration 0006 has no password until they set one.) One transaction.
 */
export function removePasskeyUnlessLast(
	db: Db,
	ownerId: number,
	id: string
): 'removed' | 'not-found' | 'needs-password' {
	return db.transaction(() => {
		const row = db
			.select({ hash: owner.passwordHash })
			.from(owner)
			.where(eq(owner.id, ownerId))
			.get();
		if (!row?.hash && listPasskeys(db, ownerId).length <= 1) {
			const exists = listPasskeys(db, ownerId).some((p) => p.id === id);
			return exists ? 'needs-password' : 'not-found';
		}
		return removePasskey(db, ownerId, id) ? 'removed' : 'not-found';
	});
}
