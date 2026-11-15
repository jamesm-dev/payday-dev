import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { rowsOf } from '#lib/server/db/open.ts';
import { owner, recoveryCode } from '#lib/server/db/schema.ts';
import { RECOVERY_CODE_COUNT } from './recovery.ts';
import { verifyOwnerPassword } from './password.ts';
import { createRateLimiter } from './rateLimit.ts';
import { hashQueue } from './signInAttempt.ts';
import {
	createSignUpLimits,
	FULL_MESSAGE,
	LIMIT_MESSAGE,
	MAX_ACCOUNTS,
	signUp,
	signUpOpen,
	SIGN_UP_PER_ADDRESS,
	SIGN_UP_PER_SITE,
	TAKEN_MESSAGE
} from './signUp.ts';
import { loggedDatabase } from './statementLog.ts';
import { MAX_CONCURRENT, MAX_WAITING } from './password.ts';

const logged = loggedDatabase();
const PASSWORD = 'river lamp orange 4821 quiet';

let n = 0;
const person = (address = `203.0.113.${(n % 200) + 1}`) => ({
	email: `person-${++n}@example.test`,
	password: PASSWORD,
	again: PASSWORD,
	address
});

/** Owners made directly, with no hash: just rows that count toward the cap. */
async function fillTo(count: number) {
	await logged.db.insert(owner).values(
		Array.from({ length: count }, (_, i) => ({
			email: `existing-${i}@example.test`,
			createdAt: new Date().toISOString()
		}))
	);
}

/** Every row of every table in the payday schema, as one comparable string. */
async function everything(): Promise<string> {
	const out: string[] = [];
	const names = await logged.db.execute(
		sql`select tablename from pg_tables where schemaname = 'payday' order by tablename`
	);
	for (const { tablename } of rowsOf<{ tablename: string }>(names)) {
		const rows = await logged.db.execute(
			sql.raw(`select * from "payday"."${tablename}" order by 1::text`)
		);
		out.push(`${tablename}: ${JSON.stringify(rowsOf(rows))}`);
	}
	return out.join('\n');
}

describe('TSK-a9d999 sign up with an email and a password', () => {
	it('makes an account with an empty budget, the email in lower case, and the password hashed', async () => {
		await fillTo(1);
		const input = { ...person(), email: '  New.Person@Example.TEST ' };
		const result = await signUp(logged.db, input);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const [row] = await logged.db.select().from(owner).where(eq(owner.id, result.ownerId));
		expect(row!.email).toBe('new.person@example.test');
		expect(row!.setupStep).toBe('welcome');
		expect(row!.currency).toBeNull();
		expect(row!.timeZone).toBeNull();
		expect(row!.passwordHash).toMatch(/^scrypt\$/);
		expect(row!.passwordHash).not.toContain(PASSWORD);
		expect((await verifyOwnerPassword(logged.db, result.ownerId, PASSWORD)).ok).toBe(true);
	});

	it('refuses an email that is taken, in any case, in plain words', async () => {
		await fillTo(1);
		expect((await signUp(logged.db, { ...person(), email: 'Same@Example.test' })).ok).toBe(true);
		const again = await signUp(logged.db, { ...person(), email: 'sAME@example.TEST' });
		expect(again).toMatchObject({ ok: false, reason: 'taken', message: TAKEN_MESSAGE });
		expect(TAKEN_MESSAGE).toContain('Sign in instead');
		expect(await logged.db.$count(owner)).toBe(2);
	});

	it('refuses a bad email, a short password or two different ones, and stores and counts nothing', async () => {
		await fillTo(1);
		const before = await everything();
		const mistakes = [
			{ ...person(), email: 'no-at-sign' },
			{ ...person(), password: 'short', again: 'short' },
			{ ...person(), again: 'something else entirely 99' },
			{ ...person(), password: 'password1234', again: 'password1234' }
		];
		for (const mistake of mistakes) {
			const result = await signUp(logged.db, mistake);
			expect(result).toMatchObject({ ok: false, reason: 'invalid', status: 400 });
		}
		expect(await everything()).toBe(before);
	});

	it('reuses the owner password message when the two passwords differ', async () => {
		await fillTo(1);
		const result = await signUp(logged.db, { ...person(), again: 'not the same 12345' });
		expect(result).toMatchObject({
			ok: false,
			message: 'The two passwords are not the same. Type the same one twice.',
			field: 'password'
		});
	});
});

describe('TSK-01b260 the recovery codes come with the account', () => {
	it('issues a full set, stored only as hashes', async () => {
		await fillTo(1);
		const result = await signUp(logged.db, person());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
		const stored = await logged.db
			.select()
			.from(recoveryCode)
			.where(eq(recoveryCode.ownerId, result.ownerId));
		expect(stored).toHaveLength(RECOVERY_CODE_COUNT);
		expect(JSON.stringify(stored)).not.toContain(result.recoveryCodes[0]!);
	});
});

describe('TSK-29100a accounts stop at 100', () => {
	it('is open at 99 and closed at 100', async () => {
		expect(MAX_ACCOUNTS).toBe(100);
		await fillTo(99);
		expect(await signUpOpen(logged.db)).toBe(true);
		expect((await signUp(logged.db, person())).ok).toBe(true);
		expect(await signUpOpen(logged.db)).toBe(false);
	});

	it('the 101st is told it is full, and no row in any table changes, the counters included', async () => {
		await fillTo(MAX_ACCOUNTS);
		const before = await everything();
		const result = await signUp(logged.db, person());
		expect(result).toMatchObject({ ok: false, reason: 'full', message: FULL_MESSAGE });
		expect(await everything()).toBe(before);
		const stamps = await logged.db.execute(
			sql`select count(*)::int as n from payday.attempt_counter`
		);
		expect(rowsOf<{ n: number }>(stamps)[0]!.n).toBe(0);
	});

	it('takes the lock, then counts, then inserts', async () => {
		await fillTo(MAX_ACCOUNTS - 1);
		const seen = await logged.statements(() => signUp(logged.db, person()));
		const lock = seen.findIndex((q) => q.includes('pg_advisory_xact_lock'));
		expect(lock).toBeGreaterThan(-1);
		const count = seen.findIndex((q, i) => i > lock && /count\(\*\)/.test(q));
		expect(count).toBeGreaterThan(lock);
		const insert = seen.findIndex((q, i) => i > count && /insert into "payday"."owner"/.test(q));
		expect(insert).toBeGreaterThan(count);
		// And "full" was looked at before the first limiter write.
		const firstCount = seen.findIndex((q) => /count\(\*\)/.test(q));
		const firstStamp = seen.findIndex((q) => q.includes('"payday"."attempt_counter"'));
		expect(firstCount).toBeLessThan(firstStamp);
	});

	it('two sign-ups at 99 cannot both get in', async () => {
		await fillTo(MAX_ACCOUNTS - 1);
		const results = await Promise.all([
			signUp(logged.db, person('198.51.100.1')),
			signUp(logged.db, person('198.51.100.2'))
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.filter((r) => !r.ok && r.reason === 'full')).toHaveLength(1);
		expect(await logged.db.$count(owner)).toBe(MAX_ACCOUNTS);
	});

	it('gives the charge back when the transaction finds it full', async () => {
		await fillTo(MAX_ACCOUNTS - 1);
		const [a, b] = await Promise.all([
			signUp(logged.db, person('198.51.100.1')),
			signUp(logged.db, person('198.51.100.2'))
		]);
		const loser = a.ok ? b : a;
		expect(loser).toMatchObject({ reason: 'full' });
		// The loser's address is back at zero: its stamp was refunded.
		const rows = await logged.db.execute(
			sql`select key, cardinality(stamps) as n from payday.attempt_counter where scope = 'sign-up-address' order by key`
		);
		const counts = Object.fromEntries(
			rowsOf<{ key: string; n: number }>(rows).map((r) => [r.key, Number(r.n)])
		);
		expect(Object.values(counts).sort()).toEqual([0, 1]);
	});

	it('refuses to open the door while nobody has registered (the setup code does that)', async () => {
		const result = await signUp(logged.db, person());
		expect(result).toMatchObject({ ok: false, reason: 'closed' });
		expect(await logged.db.$count(owner)).toBe(0);
	});
});

describe('TSK-be6817 sign-up is limited', () => {
	it('allows 3 an hour from one address and refuses the 4th, in plain words', async () => {
		expect(SIGN_UP_PER_ADDRESS).toBe(3);
		await fillTo(1);
		const t0 = new Date();
		for (let i = 0; i < 3; i++) {
			expect((await signUp(logged.db, person('192.0.2.7'), t0)).ok).toBe(true);
		}
		const fourth = await signUp(logged.db, person('192.0.2.7'), t0);
		expect(fourth).toMatchObject({
			ok: false,
			reason: 'limit',
			status: 429,
			message: LIMIT_MESSAGE
		});
		expect(LIMIT_MESSAGE).toContain('try again later');
		// Another address is not affected.
		expect((await signUp(logged.db, person('192.0.2.8'), t0)).ok).toBe(true);
		expect(await logged.db.$count(owner)).toBe(5);
	});

	it('counts an IPv6 address by its prefix, not by the exact address', async () => {
		await fillTo(1);
		for (let i = 0; i < 3; i++) {
			expect((await signUp(logged.db, person(`2001:db8:1:2::${i + 1}`))).ok).toBe(true);
		}
		const result = await signUp(logged.db, person('2001:db8:1:2:ffff::9'));
		expect(result).toMatchObject({ ok: false, reason: 'limit' });
	});

	it('allows 30 an hour for the whole site, whatever the address', async () => {
		expect(SIGN_UP_PER_SITE).toBe(30);
		await fillTo(1);
		// Thirty accounts' worth of the site-wide count, without thirty hashes.
		const site = createRateLimiter('sign-up-site', SIGN_UP_PER_SITE, 60 * 60 * 1000, 1, 48);
		for (let i = 0; i < SIGN_UP_PER_SITE; i++) expect(await site.hit(logged.db, 'all')).toBe(true);
		const result = await signUp(logged.db, person('192.0.2.99'));
		expect(result).toMatchObject({ ok: false, reason: 'limit', message: LIMIT_MESSAGE });
		// The address that was refused does not lose one of its own three.
		const rows = await logged.db.execute(
			sql`select cardinality(stamps) as n from payday.attempt_counter where scope = 'sign-up-address'`
		);
		expect(Number(rowsOf<{ n: number }>(rows)[0]?.n ?? 0)).toBe(0);
		expect(await logged.db.$count(owner)).toBe(1);
	});

	it('uses the limits it is given', async () => {
		await fillTo(1);
		const limits = createSignUpLimits(1, 30);
		const t0 = new Date('2026-11-16T10:00:00Z');
		expect((await signUp(logged.db, person('192.0.2.7'), t0, limits)).ok).toBe(true);
		expect((await signUp(logged.db, person('192.0.2.7'), t0, limits)).ok).toBe(false);
	});

	it('takes a place in the hash queue, and gives it back', async () => {
		await fillTo(1);
		// Every place taken (as 18 sign-ins waiting would): the sign-up is turned away, busy.
		const held = [];
		for (let i = 0; i < MAX_CONCURRENT + MAX_WAITING; i++) {
			held.push(await hashQueue.acquire(logged.db, 'x'));
		}
		expect(held.every((r) => r !== null)).toBe(true);
		const busy = await signUp(logged.db, person());
		expect(busy).toMatchObject({ ok: false, reason: 'busy', status: 503 });
		expect(await logged.db.$count(owner)).toBe(1);
		// A refusal for being busy is not a try: it gave its address charge back.
		const rows = await logged.db.execute(
			sql`select cardinality(stamps) as n from payday.attempt_counter where scope = 'sign-up-address'`
		);
		expect(Number(rowsOf<{ n: number }>(rows)[0]?.n ?? 0)).toBe(0);
		for (const release of held) await release!();

		// With room again it goes through, and leaves its place free afterwards.
		expect((await signUp(logged.db, person())).ok).toBe(true);
		const again = [];
		for (let i = 0; i < MAX_CONCURRENT + MAX_WAITING; i++) {
			again.push(await hashQueue.acquire(logged.db, 'x'));
		}
		expect(again.every((r) => r !== null)).toBe(true);
	});
});
