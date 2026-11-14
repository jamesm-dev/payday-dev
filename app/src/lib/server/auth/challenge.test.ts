import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { CHALLENGE_TTL_MS, createChallengeStore } from './challenge.ts';
import { loggedDatabase } from './statementLog.ts';

const T0 = new Date('2026-11-01T08:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);

let db: Db;
beforeEach(async () => {
	db = await freshDb();
});

describe('TSK-D7D015 challenges are single use and short lived', () => {
	it('can be consumed once, and only for the purpose it was made for', async () => {
		const store = createChallengeStore();
		const id = await store.save(db, 'authenticate', 'abc', T0);
		expect(await store.consume(db, id, 'register', T0)).toBeNull();
		// The wrong-purpose attempt used it up as well.
		expect(await store.consume(db, id, 'authenticate', T0)).toBeNull();

		const again = await store.save(db, 'authenticate', 'abc', T0);
		expect(await store.consume(db, again, 'authenticate', T0)).toBe('abc');
		expect(await store.consume(db, again, 'authenticate', T0)).toBeNull();
	});

	it('is valid for 5 minutes and not a moment longer', async () => {
		const store = createChallengeStore();
		const ok = await store.save(db, 'register', 'c1', T0);
		expect(await store.consume(db, ok, 'register', after(CHALLENGE_TTL_MS - 1))).toBe('c1');

		const late = await store.save(db, 'register', 'c2', T0);
		expect(await store.consume(db, late, 'register', after(CHALLENGE_TTL_MS))).toBeNull();
		expect(await store.consume(db, 'unknown', 'register', T0)).toBeNull();
	});

	it('can be bound to a session, and is refused to any other', async () => {
		const store = createChallengeStore();
		const id = await store.save(db, 'step-up', 'c', T0, 'session-a');
		expect(await store.consume(db, id, 'step-up', T0, 'session-b')).toBeNull();
		const mine = await store.save(db, 'step-up', 'c', T0, 'session-a');
		expect(await store.consume(db, mine, 'step-up', T0, 'session-a')).toBe('c');
		// An unbound challenge is not answerable by a session either.
		const open = await store.save(db, 'step-up', 'c', T0);
		expect(await store.consume(db, open, 'step-up', T0, 'session-a')).toBeNull();
	});
});

describe('TSK-D7D015 the challenge store cannot be grown without bound', () => {
	it('holds at most the cap, evicting the oldest first', async () => {
		const store = createChallengeStore(3);
		const ids: string[] = [];
		for (const i of [0, 1, 2, 3, 4])
			ids.push(await store.save(db, 'authenticate', `c${i}`, after(i)));
		expect(await store.size(db)).toBe(3);
		expect(await store.consume(db, ids[0], 'authenticate', after(5))).toBeNull();
		expect(await store.consume(db, ids[1], 'authenticate', after(5))).toBeNull();
		expect(await store.consume(db, ids[4], 'authenticate', after(5))).toBe('c4');
	});

	it('TSK-6DF544 drops expired entries as new ones arrive', async () => {
		const store = createChallengeStore(200);
		for (let i = 0; i < 50; i++) await store.save(db, 'authenticate', 'x', T0);
		expect(await store.size(db)).toBe(50);
		await store.save(db, 'authenticate', 'y', after(CHALLENGE_TTL_MS + 1));
		expect(await store.size(db)).toBe(1);
	});

	it('TSK-6DF544 an expired challenge is never read as current, cleaned up or not', async () => {
		const store = createChallengeStore();
		const id = await store.save(db, 'register', 'c', T0);
		expect(await store.size(db)).toBe(1);
		expect(await store.consume(db, id, 'register', after(CHALLENGE_TTL_MS + 60_000))).toBeNull();
		expect(await store.size(db)).toBe(0);
	});
});

describe('TSK-5569A1 a challenge saved by one function instance is answered by another', () => {
	it('is single use across instances', async () => {
		const asker = createChallengeStore();
		const answerer = createChallengeStore();
		const other = createChallengeStore();
		const id = await asker.save(db, 'authenticate', 'abc', T0);
		expect(await answerer.consume(db, id, 'authenticate', T0)).toBe('abc');
		expect(await other.consume(db, id, 'authenticate', T0)).toBeNull();
	});

	it('answered twice at once, it is given to exactly one', async () => {
		const store = createChallengeStore();
		const id = await store.save(db, 'authenticate', 'abc', T0);
		const got = await Promise.all(
			Array.from({ length: 6 }, () => store.consume(db, id, 'authenticate', T0))
		);
		expect(got.filter((c) => c === 'abc')).toHaveLength(1);
	});
});

describe('TSK-5569A1 consuming a challenge is one statement', () => {
	const logged = loggedDatabase();

	it('is a single DELETE … RETURNING, so two readers cannot both get it', async () => {
		const store = createChallengeStore();
		const id = await store.save(logged.db, 'authenticate', 'abc', T0);
		const seen = await logged.statements(() => store.consume(logged.db, id, 'authenticate', T0));
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatch(/^delete from "payday"\."auth_challenge" where .*returning/is);
	});
});
