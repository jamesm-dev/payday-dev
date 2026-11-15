import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { rowsOf } from '#lib/server/db/open.ts';
import { owner, recoveryCode, session } from '#lib/server/db/schema.ts';
import { startSession } from '../cookie.ts';
import { addPasskey } from '../passkeys.ts';
import { createRateLimiter } from '../rateLimit.ts';
import { RECOVERY_CODE_COUNT } from '../recovery.ts';
import {
	createSignUpLimits,
	FULL_MESSAGE,
	MAX_ACCOUNTS,
	signUp,
	SIGN_UP_PER_SITE
} from '../signUp.ts';
import { loggedDatabase } from '../statementLog.ts';
import { stepUps } from '../stepUp.ts';
import { cookieJar, testEvent } from '../testEvent.ts';
import { sha256Hex } from '../tokens.ts';
import {
	confirmWithGoogle,
	connectGoogle,
	disconnectGoogle,
	EMAIL_EXISTS_MESSAGE,
	signInWithGoogle
} from './accounts.ts';

const logged = loggedDatabase();
const PASSWORD = 'river lamp orange 4821 quiet';
const HASH = 'scrypt$N=32768,r=8,p=3$c2FsdHNhbHRzYWx0$a2V5a2V5a2V5a2V5a2V5';

let n = 0;
const google = (over: Partial<{ sub: string; email: string }> = {}) => ({
	sub: `sub-${++n}`,
	email: `google-${n}@example.test`,
	...over
});
const address = () => `203.0.113.${(n % 200) + 1}`;

async function fillTo(count: number) {
	await logged.db.insert(owner).values(
		Array.from({ length: count }, (_, i) => ({
			email: `existing-${i}@example.test`,
			createdAt: new Date().toISOString()
		}))
	);
}

/** An account with a password (the hash is a stand-in: this file tests the database, not scrypt). */
const withPassword = async (email = 'has-password@example.test') => {
	const [row] = await logged.db
		.insert(owner)
		.values({ email, passwordHash: HASH, createdAt: new Date().toISOString() })
		.returning({ id: owner.id });
	return row!.id;
};

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

const ownerOf = async (id: number) =>
	(await logged.db.select().from(owner).where(eq(owner.id, id)))[0]!;

describe('TSK-d24c97 a newcomer from Google goes through the sign-up path', () => {
	it('makes an account with the email and the Google id, no password, and a full set of codes', async () => {
		await fillTo(1);
		const g = google({ email: '  New.Person@Example.TEST ' });
		const result = await signInWithGoogle(logged.db, g, address());
		expect(result).toMatchObject({ ok: true, created: true });
		if (!result.ok || !result.created) return;
		const row = await ownerOf(result.ownerId);
		expect(row.email).toBe('new.person@example.test');
		expect(row.googleSub).toBe(g.sub);
		expect(row.passwordHash).toBeNull();
		expect(row.setupStep).toBe('welcome');
		expect(result.recoveryCodes).toHaveLength(RECOVERY_CODE_COUNT);
		const stored = await logged.db
			.select()
			.from(recoveryCode)
			.where(eq(recoveryCode.ownerId, result.ownerId));
		expect(stored).toHaveLength(RECOVERY_CODE_COUNT);
		expect(JSON.stringify(stored)).not.toContain(result.recoveryCodes[0]!);
	});

	it('signs a known Google id in to the same account, writing nothing', async () => {
		await fillTo(1);
		const g = google();
		const first = await signInWithGoogle(logged.db, g, address());
		const before = await everything();
		const again = await signInWithGoogle(
			logged.db,
			{ ...g, email: 'changed@example.test' },
			address()
		);
		expect(first.ok && again.ok && again.ownerId === first.ownerId && !again.created).toBe(true);
		expect(await everything()).toBe(before);
	});

	it('still signs a known person in when sign-up is full', async () => {
		await fillTo(MAX_ACCOUNTS - 1);
		const g = google();
		const made = await signInWithGoogle(logged.db, g, address());
		expect(made.ok).toBe(true);
		const again = await signInWithGoogle(logged.db, g, address());
		expect(again).toMatchObject({ ok: true, created: false });
	});

	it('is closed while nobody has an account (the setup code makes the first)', async () => {
		const result = await signInWithGoogle(logged.db, google(), address());
		expect(result).toMatchObject({ ok: false, reason: 'closed' });
		expect(await logged.db.$count(owner)).toBe(0);
	});

	it('refuses the 101st in words, and no row in any table changes, the counters included', async () => {
		await fillTo(MAX_ACCOUNTS);
		const before = await everything();
		const result = await signInWithGoogle(logged.db, google(), address());
		expect(result).toMatchObject({ ok: false, reason: 'full', message: FULL_MESSAGE });
		expect(await everything()).toBe(before);
	});

	it('looks at "full" before any write, then takes the lock before the count and the insert', async () => {
		await fillTo(MAX_ACCOUNTS - 1);
		const seen = await logged.statements(() => signInWithGoogle(logged.db, google(), address()));
		const firstCount = seen.findIndex((q) => /count\(\*\)/.test(q));
		const firstStamp = seen.findIndex((q) => q.includes('"payday"."attempt_counter"'));
		expect(firstCount).toBeGreaterThan(-1);
		expect(firstCount).toBeLessThan(firstStamp);
		const lock = seen.findIndex((q) => q.includes('pg_advisory_xact_lock'));
		expect(lock).toBeGreaterThan(firstStamp);
		const count = seen.findIndex((q, i) => i > lock && /count\(\*\)/.test(q));
		expect(count).toBeGreaterThan(lock);
		const insert = seen.findIndex((q, i) => i > count && /insert into "payday"."owner"/.test(q));
		expect(insert).toBeGreaterThan(count);
	});

	it('two newcomers at 99 cannot both get in, and the loser gets its charge back', async () => {
		await fillTo(MAX_ACCOUNTS - 1);
		const results = await Promise.all([
			signInWithGoogle(logged.db, google(), '198.51.100.1'),
			signInWithGoogle(logged.db, google(), '198.51.100.2')
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(results.filter((r) => !r.ok && r.reason === 'full')).toHaveLength(1);
		expect(await logged.db.$count(owner)).toBe(MAX_ACCOUNTS);
		const rows = await logged.db.execute(
			sql`select cardinality(stamps) as n from payday.attempt_counter where scope = 'sign-up-address'`
		);
		expect(
			rowsOf<{ n: number }>(rows)
				.map((r) => Number(r.n))
				.sort()
		).toEqual([0, 1]);
	});

	it('two callbacks for the same new person at once make one account', async () => {
		await fillTo(1);
		const g = google();
		const results = await Promise.all([
			signInWithGoogle(logged.db, g, '198.51.100.1'),
			signInWithGoogle(logged.db, g, '198.51.100.2')
		]);
		expect(results.every((r) => r.ok)).toBe(true);
		expect(new Set(results.map((r) => r.ok && r.ownerId)).size).toBe(1);
		expect(await logged.db.$count(owner)).toBe(2);
	});

	it('uses the same per-address limit as email sign-up: 3 an hour, then refused', async () => {
		await fillTo(1);
		const t0 = new Date();
		const addr = '192.0.2.7';
		// One by email and two by Google use up the three.
		expect(
			(
				await signUp(
					logged.db,
					{ email: 'by-email@example.test', password: PASSWORD, again: PASSWORD, address: addr },
					t0
				)
			).ok
		).toBe(true);
		for (let i = 0; i < 2; i++) {
			expect((await signInWithGoogle(logged.db, google(), addr, t0)).ok).toBe(true);
		}
		const fourth = await signInWithGoogle(logged.db, google(), addr, t0);
		expect(fourth).toMatchObject({ ok: false, reason: 'limit', status: 429 });
		expect((await signInWithGoogle(logged.db, google(), '192.0.2.8', t0)).ok).toBe(true);
		expect(await logged.db.$count(owner)).toBe(5);
	});

	it('uses the same site-wide limit: 30 an hour whatever the address', async () => {
		await fillTo(1);
		const site = createRateLimiter('sign-up-site', SIGN_UP_PER_SITE, 60 * 60 * 1000, 1, 48);
		for (let i = 0; i < SIGN_UP_PER_SITE; i++) expect(await site.hit(logged.db, 'all')).toBe(true);
		const result = await signInWithGoogle(logged.db, google(), '192.0.2.99');
		expect(result).toMatchObject({ ok: false, reason: 'limit' });
		expect(await logged.db.$count(owner)).toBe(1);
	});

	it('uses the limits it is given', async () => {
		await fillTo(1);
		const limits = createSignUpLimits(1, 30);
		const t0 = new Date('2026-11-16T10:00:00Z');
		expect((await signInWithGoogle(logged.db, google(), '192.0.2.7', t0, limits)).ok).toBe(true);
		expect((await signInWithGoogle(logged.db, google(), '192.0.2.7', t0, limits)).ok).toBe(false);
	});

	it('refuses an empty account id or an unusable email, writing nothing', async () => {
		await fillTo(1);
		const before = await everything();
		expect(await signInWithGoogle(logged.db, google({ sub: '' }), address())).toMatchObject({
			ok: false,
			reason: 'invalid'
		});
		expect(await signInWithGoogle(logged.db, google({ email: 'nope' }), address())).toMatchObject({
			ok: false,
			reason: 'invalid'
		});
		expect(await everything()).toBe(before);
	});
});

describe('TSK-81af3b a Google email that matches an account is refused, never linked', () => {
	it('says how to connect from inside the account, in any letter case, and writes nothing', async () => {
		await fillTo(1);
		await logged.db.insert(owner).values({ email: 'mine@example.test' });
		const before = await everything();
		const result = await signInWithGoogle(
			logged.db,
			google({ email: 'Mine@Example.TEST' }),
			address()
		);
		expect(result).toMatchObject({
			ok: false,
			reason: 'email-exists',
			message:
				'An account with this email already exists. Sign in with your password, then connect Google in Settings › Security.'
		});
		expect(EMAIL_EXISTS_MESSAGE).toContain('Settings › Security');
		expect(await everything()).toBe(before);
	});

	it('does not link: the existing account keeps no Google id', async () => {
		await fillTo(1);
		const id = await withPassword('mine@example.test');
		await signInWithGoogle(logged.db, google({ email: 'mine@example.test' }), address());
		expect((await ownerOf(id)).googleSub).toBeNull();
	});
});

describe('TSK-b7d40a connect Google to an account', () => {
	it('connects, leaving the email alone, and a Google sign-in then opens that account', async () => {
		const id = await withPassword('mine@example.test');
		const g = google({ email: 'other-google-email@example.test' });
		expect(await connectGoogle(logged.db, id, g)).toBe('connected');
		const row = await ownerOf(id);
		expect(row.googleSub).toBe(g.sub);
		expect(row.email).toBe('mine@example.test');
		expect(await signInWithGoogle(logged.db, g, address())).toMatchObject({
			ok: true,
			created: false,
			ownerId: id
		});
	});

	it('connecting the same Google account again changes nothing', async () => {
		const id = await withPassword();
		const g = google();
		await connectGoogle(logged.db, id, g);
		expect(await connectGoogle(logged.db, id, g)).toBe('connected');
	});

	it('refuses a Google account that is on another person, changing neither', async () => {
		const a = await withPassword('a@example.test');
		const b = await withPassword('b@example.test');
		const g = google();
		await connectGoogle(logged.db, a, g);
		expect(await connectGoogle(logged.db, b, g)).toBe('sub-taken');
		expect((await ownerOf(a)).googleSub).toBe(g.sub);
		expect((await ownerOf(b)).googleSub).toBeNull();
	});

	it('refuses a different Google account until the first is disconnected', async () => {
		const id = await withPassword();
		const first = google();
		const second = google();
		await connectGoogle(logged.db, id, first);
		expect(await connectGoogle(logged.db, id, second)).toBe('other-google');
		expect((await ownerOf(id)).googleSub).toBe(first.sub);
		expect(await disconnectGoogle(logged.db, id, 'keep')).toBe('disconnected');
		expect(await connectGoogle(logged.db, id, second)).toBe('connected');
	});

	it('two accounts racing for one Google id: exactly one gets it', async () => {
		const a = await withPassword('a@example.test');
		const b = await withPassword('b@example.test');
		const g = google();
		const results = await Promise.all([
			connectGoogle(logged.db, a, g),
			connectGoogle(logged.db, b, g)
		]);
		expect(results.filter((r) => r === 'connected')).toHaveLength(1);
		expect(results.filter((r) => r === 'sub-taken')).toHaveLength(1);
	});

	it('takes the owner lock before it reads or writes, and stops for a deleted account', async () => {
		const id = await withPassword();
		const seen = await logged.statements(() => connectGoogle(logged.db, id, google()));
		const lock = seen.findIndex((q) => /for update/i.test(q));
		const update = seen.findIndex((q) => /update "payday"."owner"/i.test(q));
		expect(lock).toBeGreaterThan(-1);
		expect(update).toBeGreaterThan(lock);
		await expect(connectGoogle(logged.db, 9999, google())).rejects.toMatchObject({ status: 401 });
	});
});

describe('TSK-b7d40a disconnect Google, never the last way in', () => {
	it('is refused for a Google-only account, which keeps its Google id', async () => {
		await fillTo(1);
		const g = google();
		const made = await signInWithGoogle(logged.db, g, address());
		if (!made.ok) throw new Error('setup failed');
		expect(await disconnectGoogle(logged.db, made.ownerId, 'keep')).toBe('last-way-in');
		expect((await ownerOf(made.ownerId)).googleSub).toBe(g.sub);
	});

	it('is allowed once a password exists', async () => {
		await fillTo(1);
		const made = await signInWithGoogle(logged.db, google(), address());
		if (!made.ok) throw new Error('setup failed');
		await logged.db.update(owner).set({ passwordHash: HASH }).where(eq(owner.id, made.ownerId));
		expect(await disconnectGoogle(logged.db, made.ownerId, 'keep')).toBe('disconnected');
		expect((await ownerOf(made.ownerId)).googleSub).toBeNull();
	});

	it('is allowed once a passkey exists', async () => {
		await fillTo(1);
		const made = await signInWithGoogle(logged.db, google(), address());
		if (!made.ok) throw new Error('setup failed');
		await addPasskey(logged.db, made.ownerId, {
			id: 'cred-g',
			publicKey: new Uint8Array([1]),
			counter: 0,
			nickname: 'Phone'
		});
		expect(await disconnectGoogle(logged.db, made.ownerId, 'keep')).toBe('disconnected');
	});

	it('says so when Google is not connected, and stops for a deleted account', async () => {
		const id = await withPassword();
		expect(await disconnectGoogle(logged.db, id, 'keep')).toBe('not-connected');
		await expect(disconnectGoogle(logged.db, 9999, 'keep')).rejects.toMatchObject({ status: 401 });
	});

	it('TSK-6f0e5d ends every other session of that person and keeps the current one', async () => {
		const id = await withPassword();
		await connectGoogle(logged.db, id, google());
		const [other] = await logged.db
			.insert(owner)
			.values({ email: 'bystander@example.test' })
			.returning({ id: owner.id });
		const open = async (ownerId: number) => {
			const person = cookieJar();
			await startSession(logged.db, testEvent({ cookies: person.cookies }), ownerId, 'password');
			return sha256Hex(person.jar.get('session')!);
		};
		const mine = await open(id);
		const elsewhere = await open(id);
		const theirs = await open(other!.id);
		expect(await disconnectGoogle(logged.db, id, mine)).toBe('disconnected');
		const left = (await logged.db.select({ id: session.id }).from(session)).map((r) => r.id);
		expect(left).toContain(mine);
		expect(left).toContain(theirs);
		expect(left).not.toContain(elsewhere);
	});

	it('TSK-6f0e5d a refused disconnect ends no session', async () => {
		await fillTo(1);
		const made = await signInWithGoogle(logged.db, google(), address());
		if (!made.ok) throw new Error('setup failed');
		const person = cookieJar();
		await startSession(logged.db, testEvent({ cookies: person.cookies }), made.ownerId, 'google');
		await startSession(
			logged.db,
			testEvent({ cookies: cookieJar().cookies }),
			made.ownerId,
			'google'
		);
		const before = (await logged.db.select({ id: session.id }).from(session)).length;
		expect(
			await disconnectGoogle(logged.db, made.ownerId, sha256Hex(person.jar.get('session')!))
		).toBe('last-way-in');
		expect((await logged.db.select({ id: session.id }).from(session)).length).toBe(before);
	});

	it('takes the owner lock first', async () => {
		const id = await withPassword();
		await connectGoogle(logged.db, id, google());
		const seen = await logged.statements(() => disconnectGoogle(logged.db, id, 'keep'));
		const lock = seen.findIndex((q) => /for update/i.test(q));
		const update = seen.findIndex((q) => /update "payday"."owner"/i.test(q));
		expect(lock).toBeGreaterThan(-1);
		expect(update).toBeGreaterThan(lock);
	});
});

describe('TSK-b7d40a confirm with Google', () => {
	it('is true only for the connected Google id', async () => {
		const id = await withPassword();
		const other = await withPassword('other@example.test');
		const g = google();
		expect(await confirmWithGoogle(logged.db, id, g.sub)).toBe(false);
		await connectGoogle(logged.db, id, g);
		expect(await confirmWithGoogle(logged.db, id, g.sub)).toBe(true);
		expect(await confirmWithGoogle(logged.db, id, 'someone-else')).toBe(false);
		expect(await confirmWithGoogle(logged.db, id, '')).toBe(false);
		// Another person's account never confirms with this id.
		expect(await confirmWithGoogle(logged.db, other, g.sub)).toBe(false);
	});
});

describe('TSK-d24c97 a Google sign-in counts as a confirmation, like a password sign-in', () => {
	it('starts a session marked as asserted, with a cookie', async () => {
		await fillTo(1);
		const made = await signInWithGoogle(logged.db, google(), address());
		if (!made.ok) throw new Error('setup failed');
		const { cookies, jar } = cookieJar();
		await startSession(logged.db, testEvent({ cookies }), made.ownerId, 'google');
		const token = jar.get('session')!;
		expect(token).toBeTruthy();
		const id = sha256Hex(token);
		expect(await stepUps.hasAssertion(logged.db, id)).toBe(true);
		expect(await stepUps.allows(logged.db, id, 'disconnect-google')).toBe(true);
		expect((await logged.db.select().from(session).where(eq(session.id, id)))[0]).toBeTruthy();
	});
});
