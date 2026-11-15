import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db, type Opened } from '#lib/server/db/open.ts';
import { emptyAllTables } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import { REGISTRATION_LOCK, registerOwner } from './passkeys.ts';
import { signUp } from './signUp.ts';

/*
 * TSK-4da7e9: the setup code's "no accounts yet" and a sign-up's "an account exists" are decided
 * under ONE advisory lock, so a first registration and a sign-up that arrive together cannot both
 * be told yes. PGlite runs one statement at a time, so a test cannot make them truly race; what it
 * can show is the order of the statements and which lock each one takes.
 */
type Seen = { query: string; params: unknown[] };
const seen: Seen[] = [];
let opened: Opened;
let db: Db;

beforeAll(async () => {
	opened = await openDatabase('memory://', {
		logger: { logQuery: (query, params) => void seen.push({ query, params }) }
	});
	db = opened.db;
}, 120_000);
afterAll(() => opened.close());
beforeEach(async () => {
	await emptyAllTables(db);
});

const lockAt = (statements: Seen[]) =>
	statements.findIndex((s) => /pg_advisory_xact_lock/.test(s.query));

async function record(run: () => Promise<unknown>): Promise<Seen[]> {
	seen.length = 0;
	await run();
	return [...seen];
}

describe('TSK-4da7e9 the first registration takes the registration lock before it looks', () => {
	it('locks, then looks for an owner, then inserts one', async () => {
		const statements = await record(() => registerOwner(db, 'a-hash'));
		const lock = lockAt(statements);
		const select = statements.findIndex((s) => /from "payday"."owner"/.test(s.query));
		const insert = statements.findIndex((s) => /insert into "payday"."owner"/.test(s.query));
		expect(lock).toBeGreaterThan(-1);
		expect(select).toBeGreaterThan(lock);
		expect(insert).toBeGreaterThan(select);
		// Nothing but the transaction's own begin comes before the lock.
		expect(statements.slice(0, lock).every((s) => /^begin/i.test(s.query))).toBe(true);
	});

	it('is the same lock a sign-up takes', async () => {
		const first = await record(() => registerOwner(db, 'a-hash'));
		const signUpStatements = await record(() =>
			signUp(db, {
				email: 'second@example.test',
				password: 'river lamp orange 4821 quiet',
				again: 'river lamp orange 4821 quiet',
				address: '203.0.113.9'
			})
		);
		expect(await db.$count(owner)).toBe(2);
		const keyOf = (statements: Seen[]) => statements[lockAt(statements)]!.params;
		expect(keyOf(first)).toEqual([REGISTRATION_LOCK]);
		expect(keyOf(signUpStatements)).toEqual([REGISTRATION_LOCK]);
	});
});
