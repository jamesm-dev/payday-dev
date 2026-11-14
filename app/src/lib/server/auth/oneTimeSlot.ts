import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { oneTimeSlot } from '#lib/server/db/schema.ts';
import { sha256Hex } from './tokens.ts';

/**
 * A place to leave a value for exactly one later read, kept in the database (`one_time_slot`),
 * keyed by session. The new recovery codes go here between the POST that makes them and the GET
 * that shows them, so that a reload of the page shows nothing instead of re-sending the form and
 * silently replacing them again. On Netlify the two requests may run in different function
 * instances, so memory will not do.
 *
 * The value is a secret (recovery codes), so it is never stored as plaintext. It is sealed with
 * AES-256-GCM under a key derived (HKDF-SHA-256) from the session's raw cookie token. The database
 * holds only the SHA-256 of that token (it is the session id), which cannot be turned back into the
 * token, so a copy of the database, or a database operator, cannot open a slot; only the request
 * that carries the cookie can. The session id is bound in as the GCM associated data, so a sealed
 * value cannot be moved under another session's key. Reading deletes the row.
 */
export type OneTimeSlot<T> = {
	/** `token` is the session's raw cookie token: the key is made from it, and the row keyed by its hash. */
	put(db: Db, token: string, value: T, now?: number): Promise<void>;
	/** Returns the value and removes it. Undefined when empty, expired, or not sealed for this token. */
	take(db: Db, token: string, now?: number): Promise<T | undefined>;
	size(db: Db): Promise<number>;
};

const SALT = Buffer.from('payday one-time slot v1');
const INFO = Buffer.from('aes-256-gcm key');

const keyFor = (token: string) =>
	Buffer.from(hkdfSync('sha256', Buffer.from(token), SALT, INFO, 32));

/** Seals `value` for the session behind `token`: base64url of iv (12) + tag (16) + ciphertext. */
export function seal(token: string, value: unknown): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', keyFor(token), iv);
	cipher.setAAD(Buffer.from(sha256Hex(token)));
	const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** Opens what `seal` made for the same token; undefined for any other token or a damaged value. */
export function unseal<T>(token: string, sealed: string): T | undefined {
	try {
		const raw = Buffer.from(sealed, 'base64url');
		const decipher = createDecipheriv('aes-256-gcm', keyFor(token), raw.subarray(0, 12));
		decipher.setAAD(Buffer.from(sha256Hex(token)));
		decipher.setAuthTag(raw.subarray(12, 28));
		const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
		return JSON.parse(text.toString('utf8')) as T;
	} catch {
		return undefined;
	}
}

export function createOneTimeSlot<T>(ttlMs = 2 * 60 * 1000, maxKeys = 50): OneTimeSlot<T> {
	return {
		async put(db, token, value, now = Date.now()) {
			const sessionId = sha256Hex(token);
			const row = { sealed: seal(token, value), expiresAt: now + ttlMs };
			// Written only for a session that exists, and that stays while the row is written (`for key
			// share` blocks its deletion until this transaction ends): the row has a foreign key to the
			// session. For a session already gone this writes nothing.
			await db.execute(sql`
				insert into "payday"."one_time_slot" ("session_id", "sealed", "expires_at")
				select "id", ${row.sealed}, ${row.expiresAt}::bigint from "payday"."session"
				where "id" = ${sessionId} for key share
				on conflict ("session_id") do update
				set "sealed" = excluded."sealed", "expires_at" = excluded."expires_at"
			`);
			// Expired slots go, then the oldest past the cap: the table stays small however it is used.
			await db.delete(oneTimeSlot).where(
				sql`${oneTimeSlot.expiresAt} <= ${now}::bigint or ${oneTimeSlot.sessionId} in (
					select "session_id" from "payday"."one_time_slot"
					order by "expires_at" desc, "session_id" offset ${maxKeys}::int
				)`
			);
		},
		async take(db, token, now = Date.now()) {
			// One statement: the row is gone the moment it is read, so a second reader gets nothing.
			const [slot] = await db
				.delete(oneTimeSlot)
				.where(eq(oneTimeSlot.sessionId, sha256Hex(token)))
				.returning();
			return slot && slot.expiresAt > now ? unseal<T>(token, slot.sealed) : undefined;
		},
		size: async (db) => (await db.select().from(oneTimeSlot)).length
	};
}

/** The codes just made, per session. */
export const newRecoveryCodes = createOneTimeSlot<string[]>();
