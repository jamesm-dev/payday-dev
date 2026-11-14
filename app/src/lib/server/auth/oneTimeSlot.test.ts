import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { oneTimeSlot, session } from '#lib/server/db/schema.ts';
import { createSession, deleteAllSessions, deleteSession } from './session.ts';
import { createOneTimeSlot, seal, unseal } from './oneTimeSlot.ts';
import { loggedDatabase } from './statementLog.ts';
import { newToken, sha256Hex } from './tokens.ts';

let db: Db;
beforeEach(async () => {
	db = await freshDb();
});

/** A real session (the slot has a foreign key to it) and the raw token its cookie would hold. */
const open = async (database: Db = db) => (await createSession(database, 1, 'vitest')).token;

describe('TSK-2F1582 new recovery codes are shown once', () => {
	it('gives the value to the first read and nothing to the second', async () => {
		const slot = createOneTimeSlot<string[]>(1000);
		const s = await open();
		await slot.put(db, s, ['A', 'B'], 0);
		expect(await slot.take(db, s, 1)).toEqual(['A', 'B']);
		expect(await slot.take(db, s, 2)).toBeUndefined();
	});

	it('is per session and expires', async () => {
		const slot = createOneTimeSlot<string[]>(1000);
		const s = await open();
		await slot.put(db, s, ['A'], 0);
		expect(await slot.take(db, await open(), 1)).toBeUndefined();
		expect(await slot.take(db, s, 1000)).toBeUndefined();
	});

	it('keeps only the latest value for a session, and is bounded', async () => {
		const slot = createOneTimeSlot<number>(1000, 2);
		const s = await open();
		await slot.put(db, s, 1, 0);
		await slot.put(db, s, 2, 1);
		expect(await slot.take(db, s, 2)).toBe(2);
		for (let i = 0; i < 3; i++) await slot.put(db, await open(), 1, 3);
		expect(await slot.size(db)).toBe(2);
	});
});

describe('TSK-0D8D10 the recovery codes are sealed, never stored as plaintext', () => {
	const codes = ['ABCD-EFGH-JKLM', 'NPQR-STUV-WXYZ'];

	it('stores nothing readable: the row holds neither the codes nor the token', async () => {
		const slot = createOneTimeSlot<string[]>();
		const token = await open();
		await slot.put(db, token, codes, 0);
		const [row] = await db.select().from(oneTimeSlot);
		expect(row.sessionId).toBe(sha256Hex(token)); // keyed by the session id, as the session table is
		for (const code of codes) expect(row.sealed).not.toContain(code);
		expect(Buffer.from(row.sealed, 'base64url').toString('utf8')).not.toContain(codes[0]);
		expect(row.sealed).not.toContain(token);
	});

	it('is sealed afresh each time: the same codes never give the same stored value', () => {
		const token = newToken();
		expect(seal(token, codes)).not.toBe(seal(token, codes));
	});

	it('cannot be opened with another session token, nor from the stored hash alone', async () => {
		const slot = createOneTimeSlot<string[]>();
		const token = await open();
		await slot.put(db, token, codes, 0);
		const [row] = await db.select().from(oneTimeSlot);
		expect(unseal(newToken(), row.sealed)).toBeUndefined();
		// All the database holds is the hash of the token: it is not the key.
		expect(unseal(row.sessionId, row.sealed)).toBeUndefined();
		expect(unseal(token, row.sealed)).toEqual(codes);
	});

	it('cannot be moved under another session: a sealed value is bound to its own session id', async () => {
		const slot = createOneTimeSlot<string[]>();
		const mine = await open();
		const theirs = await open();
		await slot.put(db, mine, codes, 0);
		const [row] = await db.select().from(oneTimeSlot);
		await db
			.update(oneTimeSlot)
			.set({ sessionId: sha256Hex(theirs) })
			.where(eq(oneTimeSlot.sessionId, row.sessionId));
		expect(await slot.take(db, theirs, 1)).toBeUndefined();
	});

	it('is gone after one read, and a read by another session takes nothing from it', async () => {
		const slot = createOneTimeSlot<string[]>();
		const token = await open();
		await slot.put(db, token, codes, 0);
		expect(await slot.take(db, await open(), 1)).toBeUndefined();
		expect(await slot.size(db)).toBe(1);
		expect(await slot.take(db, token, 1)).toEqual(codes);
		expect(await slot.size(db)).toBe(0);
		expect(await slot.take(db, token, 2)).toBeUndefined();
	});

	it('expires after two minutes, and an expired one is deleted on read and never returned', async () => {
		const slot = createOneTimeSlot<string[]>();
		const token = await open();
		await slot.put(db, token, codes, 0);
		expect(await slot.take(db, token, 2 * 60 * 1000)).toBeUndefined();
		expect(await slot.size(db)).toBe(0);
	});

	it('TSK-6DF544 clears expired slots when another is written', async () => {
		const slot = createOneTimeSlot<string[]>(1000);
		for (let i = 0; i < 3; i++) await slot.put(db, await open(), ['x'], 0);
		expect(await slot.size(db)).toBe(3);
		await slot.put(db, await open(), ['x'], 5000);
		expect(await slot.size(db)).toBe(1);
	});
});

describe('TSK-0D8D10 the sealed codes go with their session', () => {
	it('are deleted when the session is signed out, signed out everywhere, or ended', async () => {
		const slot = createOneTimeSlot<string[]>();
		const a = await open();
		const b = await open();
		const c = await open();
		for (const t of [a, b, c]) await slot.put(db, t, ['X'], 0);
		await deleteSession(db, a);
		expect(await slot.size(db)).toBe(2);
		await db.delete(session).where(eq(session.id, sha256Hex(b)));
		expect(await slot.size(db)).toBe(1);
		await deleteAllSessions(db, 1);
		expect(await slot.size(db)).toBe(0);
	});

	it('writes nothing for a session that is already gone', async () => {
		const slot = createOneTimeSlot<string[]>();
		const gone = await open();
		await deleteSession(db, gone);
		await slot.put(db, gone, ['X'], 0);
		expect(await slot.size(db)).toBe(0);
	});
});

describe('TSK-0D8D10 the sealed codes go with their session', () => {
	it('are deleted when the session is signed out, signed out everywhere, or ended', async () => {
		const slot = createOneTimeSlot<string[]>();
		const a = await open();
		const b = await open();
		const c = await open();
		for (const t of [a, b, c]) await slot.put(db, t, ['X'], 0);
		await deleteSession(db, a);
		expect(await slot.size(db)).toBe(2);
		await db.delete(session).where(eq(session.id, sha256Hex(b)));
		expect(await slot.size(db)).toBe(1);
		await deleteAllSessions(db, 1);
		expect(await slot.size(db)).toBe(0);
	});

	it('writes nothing for a session that is already gone', async () => {
		const slot = createOneTimeSlot<string[]>();
		const gone = await open();
		await deleteSession(db, gone);
		await slot.put(db, gone, ['X'], 0);
		expect(await slot.size(db)).toBe(0);
	});
});

describe('TSK-0D8D10 a slot is read by whichever function instance gets the next request', () => {
	it('is put by one instance, taken by another, and only once', async () => {
		const writer = createOneTimeSlot<string[]>();
		const reader = createOneTimeSlot<string[]>();
		const other = createOneTimeSlot<string[]>();
		const token = await open();
		await writer.put(db, token, ['A'], 0);
		expect(await reader.take(db, token, 1)).toEqual(['A']);
		expect(await other.take(db, token, 2)).toBeUndefined();
	});

	it('read twice at once, it is given to exactly one', async () => {
		const slot = createOneTimeSlot<string[]>();
		const token = await open();
		await slot.put(db, token, ['A'], 0);
		const got = await Promise.all(Array.from({ length: 6 }, () => slot.take(db, token, 1)));
		expect(got.filter(Boolean)).toHaveLength(1);
	});
});

describe('TSK-0D8D10 reading a slot is one statement', () => {
	const logged = loggedDatabase();

	it('is a single DELETE … RETURNING', async () => {
		const slot = createOneTimeSlot<string[]>();
		const token = await open(logged.db);
		await slot.put(logged.db, token, ['A'], 0);
		const seen = await logged.statements(() => slot.take(logged.db, token, 1));
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatch(/^delete from "payday"\."one_time_slot" where .*returning/is);
	});
});
