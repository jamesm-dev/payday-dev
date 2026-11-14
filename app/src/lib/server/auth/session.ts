import { and, eq, lt, ne, or } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { session } from '#lib/server/db/schema.ts';
import { newToken, sha256Hex } from './tokens.ts';

/** The cookie's name over plain http (local development and the test server). */
export const SESSION_COOKIE = 'session';
/** Over https the `__Host-` prefix makes browsers refuse it unless Secure, Path=/ and no Domain. */
export const SECURE_SESSION_COOKIE = '__Host-session';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** A session ends after this long without use... */
export const IDLE_MS = 14 * DAY;
/** ...and never lives longer than this, however busy. */
export const ABSOLUTE_MS = 90 * DAY;
/** Using a session pushes its expiry out at most this often, so a read is not a write. */
export const REFRESH_EVERY_MS = HOUR;

const iso = (ms: number) => new Date(ms).toISOString();

/** Starts a session. The token goes in the cookie; only its hash is stored. */
export async function createSession(
	db: Db,
	ownerId: number,
	userAgent: string | null,
	now = new Date()
): Promise<{ token: string; expiresAt: string }> {
	const token = newToken();
	const expiresAt = iso(now.getTime() + IDLE_MS);
	await db.insert(session).values({
		id: sha256Hex(token),
		ownerId,
		createdAt: now.toISOString(),
		lastSeenAt: now.toISOString(),
		expiresAt,
		userAgent: userAgent?.slice(0, 300) ?? null
	});
	return { token, expiresAt };
}

export type SessionCheck = { ownerId: number; refreshedUntil: string | null } | null;

/**
 * Looks a token up. An expired session (idle or past the absolute cap) is rejected and deleted.
 * A live one has its expiry slid forward, at most once an hour, never past the absolute cap.
 */
export async function checkSession(db: Db, token: string, now = new Date()): Promise<SessionCheck> {
	const id = sha256Hex(token);
	const [row] = await db.select().from(session).where(eq(session.id, id));
	if (!row) return null;

	const t = now.getTime();
	const hardEnd = Date.parse(row.createdAt) + ABSOLUTE_MS;
	if (t >= Date.parse(row.expiresAt) || t >= hardEnd) {
		await db.delete(session).where(eq(session.id, id));
		return null;
	}

	if (t - Date.parse(row.lastSeenAt) < REFRESH_EVERY_MS) {
		return { ownerId: row.ownerId, refreshedUntil: null };
	}
	const expiresAt = iso(Math.min(t + IDLE_MS, hardEnd));
	await db
		.update(session)
		.set({ lastSeenAt: now.toISOString(), expiresAt })
		.where(eq(session.id, id));
	return { ownerId: row.ownerId, refreshedUntil: expiresAt };
}

export async function deleteSession(db: Db, token: string): Promise<void> {
	await db.delete(session).where(eq(session.id, sha256Hex(token)));
}

/** Whether a session row (by id, the hash of the cookie) still exists. */
export const sessionExists = async (db: Db, id: string): Promise<boolean> =>
	(await db.select({ id: session.id }).from(session).where(eq(session.id, id))).length > 0;

/** "Sign out everywhere". */
export async function deleteAllSessions(db: Db, ownerId: number): Promise<void> {
	await db.delete(session).where(eq(session.ownerId, ownerId));
}

/** Ends every session of the owner except `keepId`; returns the ids it ended. */
export async function deleteOtherSessions(
	db: Db,
	ownerId: number,
	keepId: string
): Promise<string[]> {
	const ended = await db
		.delete(session)
		.where(and(eq(session.ownerId, ownerId), ne(session.id, keepId)))
		.returning({ id: session.id });
	return ended.map((row) => row.id);
}

/** Housekeeping: drops every session that is past its idle expiry. */
export async function deleteExpiredSessions(db: Db, now = new Date()): Promise<void> {
	await db
		.delete(session)
		.where(
			or(
				lt(session.expiresAt, now.toISOString()),
				lt(session.createdAt, iso(now.getTime() - ABSOLUTE_MS))
			)
		);
}
