import { beforeEach, describe, expect, it } from 'vitest';
import { open, type Db } from '#lib/server/db/open.ts';
import { owner, session } from '#lib/server/db/schema.ts';
import {
	ABSOLUTE_MS,
	checkSession,
	createSession,
	deleteAllSessions,
	deleteExpiredSessions,
	deleteSession,
	IDLE_MS,
	REFRESH_EVERY_MS
} from './session.ts';
import { sha256Hex } from './tokens.ts';

const T0 = new Date('2026-11-01T08:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;

let db: Db;
beforeEach(() => {
	db = open(':memory:');
	db.insert(owner).values({ id: 1 }).run();
});

describe('TSK-2F1582 sessions live on the server', () => {
	it('stores the SHA-256 of the token, never the token', () => {
		const { token } = createSession(db, 1, 'test agent', T0);
		expect(Buffer.from(token, 'base64url')).toHaveLength(32);

		const rows = db.select().from(session).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(sha256Hex(token));
		expect(rows[0].id).not.toContain(token);
	});

	it('finds a session by its token and rejects an unknown one', () => {
		const { token } = createSession(db, 1, null, T0);
		expect(checkSession(db, token, after(1000))?.ownerId).toBe(1);
		expect(checkSession(db, 'not-a-token', after(1000))).toBeNull();
		// The stored hash is not itself a valid token.
		expect(checkSession(db, sha256Hex(token), after(1000))).toBeNull();
	});

	it('expires after 14 days idle, and deletes the expired session', () => {
		const { token } = createSession(db, 1, null, T0);
		expect(checkSession(db, token, after(IDLE_MS - 1000))).not.toBeNull();
		expect(checkSession(db, token, after(IDLE_MS + 1000))).not.toBeNull();
		// Last used at 14 days + 1s: 14 more days of silence ends it.
		expect(checkSession(db, token, after(2 * IDLE_MS + 2000))).toBeNull();
		expect(db.select().from(session).all()).toHaveLength(0);
	});

	it('rejects a session whose idle expiry has passed without any use', () => {
		const { token } = createSession(db, 1, null, T0);
		expect(checkSession(db, token, after(IDLE_MS + 1000))).toBeNull();
		expect(db.select().from(session).all()).toHaveLength(0);
	});

	it('slides the expiry forward, but at most once an hour', () => {
		const { token } = createSession(db, 1, null, T0);

		const soon = checkSession(db, token, after(REFRESH_EVERY_MS - 1000));
		expect(soon?.refreshedUntil).toBeNull();

		const later = checkSession(db, token, after(REFRESH_EVERY_MS + 1000));
		expect(later?.refreshedUntil).toBe(after(REFRESH_EVERY_MS + 1000 + IDLE_MS).toISOString());

		const row = db.select().from(session).get()!;
		expect(row.lastSeenAt).toBe(after(REFRESH_EVERY_MS + 1000).toISOString());
		expect(row.expiresAt).toBe(later?.refreshedUntil);
	});

	it('never lives past 90 days, however often it is used', () => {
		const { token } = createSession(db, 1, null, T0);
		// Used every 10 days: always inside the idle window.
		for (let day = 10; day < 90; day += 10) {
			expect(checkSession(db, token, after(day * DAY))).not.toBeNull();
		}
		// The expiry never goes past the cap.
		const row = db.select().from(session).get()!;
		expect(Date.parse(row.expiresAt)).toBeLessThanOrEqual(T0.getTime() + ABSOLUTE_MS);

		expect(checkSession(db, token, after(ABSOLUTE_MS + 1000))).toBeNull();
		expect(db.select().from(session).all()).toHaveLength(0);
	});

	it('signing out deletes the session; signing out everywhere deletes them all', () => {
		const a = createSession(db, 1, null, T0);
		const b = createSession(db, 1, null, T0);
		const c = createSession(db, 1, null, T0);

		deleteSession(db, a.token);
		expect(checkSession(db, a.token, after(1000))).toBeNull();
		expect(checkSession(db, b.token, after(1000))).not.toBeNull();

		deleteAllSessions(db, 1);
		expect(checkSession(db, b.token, after(1000))).toBeNull();
		expect(checkSession(db, c.token, after(1000))).toBeNull();
		expect(db.select().from(session).all()).toHaveLength(0);
	});

	it('housekeeping removes expired sessions and keeps live ones', () => {
		createSession(db, 1, null, T0);
		const live = createSession(db, 1, null, after(10 * DAY));
		deleteExpiredSessions(db, after(IDLE_MS + 1000));
		const left = db.select({ id: session.id }).from(session).all();
		expect(left.map((r) => r.id)).toEqual([sha256Hex(live.token)]);
	});
});
