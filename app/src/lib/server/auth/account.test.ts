import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { open, type Db } from '#lib/server/db/open.ts';
import { owner, recoveryCode, session } from '#lib/server/db/schema.ts';
import { changePassword, CHANGED_MEANWHILE, registerWithPassword } from './account.ts';
import { startPasswordSession } from './cookie.ts';
import {
	checkOwnerPassword,
	hashPassword,
	setPasswordHash,
	verifyOwnerPassword
} from './password.ts';
import { OWNER_ID } from './passkeys.ts';
import { createSession } from './session.ts';
import { stepUps } from './stepUp.ts';
import { cookieJar, testEvent } from './testEvent.ts';
import { sha256Hex } from './tokens.ts';

const OLD = 'the old passphrase here';
const NEW = 'a brand new passphrase';
const FAST = { N: 2 ** 10, r: 8, p: 1 };

let db: Db;
beforeEach(() => {
	db = open(':memory:');
});

describe('TSK-46617D first registration with a password, then closed', () => {
	it('creates owner 1 with a verifiable password and 10 recovery codes', async () => {
		const result = await registerWithPassword(db, NEW, NEW, 'setup-code');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.ownerId).toBe(OWNER_ID);
		expect(result.recoveryCodes).toHaveLength(10);
		expect(await checkOwnerPassword(db, OWNER_ID, NEW)).toBe(true);
		expect(await checkOwnerPassword(db, OWNER_ID, OLD)).toBe(false);
		expect(db.select().from(recoveryCode).all()).toHaveLength(10);
	});

	it('is refused, writing nothing, once an owner exists', async () => {
		await registerWithPassword(db, NEW, NEW);
		const second = await registerWithPassword(db, OLD, OLD);
		expect(second).toMatchObject({ ok: false, refusal: { status: 403 } });
		expect(db.select().from(owner).all()).toHaveLength(1);
		expect(await checkOwnerPassword(db, OWNER_ID, NEW)).toBe(true);
		expect(await checkOwnerPassword(db, OWNER_ID, OLD)).toBe(false);
		expect(db.select().from(recoveryCode).all()).toHaveLength(10);
	});

	it('lets only one of two racing registrations win', async () => {
		const results = await Promise.all([
			registerWithPassword(db, NEW, NEW),
			registerWithPassword(db, OLD, OLD)
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		expect(db.select().from(owner).all()).toHaveLength(1);
		expect(db.select().from(recoveryCode).all()).toHaveLength(10);
	});

	it('refuses a weak, mismatched or setup-code password and creates no owner', async () => {
		for (const [password, again, text] of [
			['short', 'short', 'at least 12'],
			[NEW, NEW + '!', 'not the same'],
			['my setup-code is long', 'my setup-code is long', 'setup code']
		]) {
			const result = await registerWithPassword(db, password, again, 'setup-code');
			expect(result).toMatchObject({ ok: false, refusal: { status: 400 } });
			if (!result.ok) expect(result.refusal.message).toContain(text);
		}
		expect(db.select().from(owner).all()).toHaveLength(0);
	});
});

describe('TSK-2F1582 changing the password', () => {
	let mine: string;
	let theirs: string;

	beforeEach(async () => {
		db.insert(owner).values({ id: OWNER_ID }).run();
		setPasswordHash(db, OWNER_ID, await hashPassword(OLD, FAST));
		mine = sha256Hex(createSession(db, OWNER_ID, 'this one').token);
		theirs = sha256Hex(createSession(db, OWNER_ID, 'a stolen one').token);
	});

	const attempt = (over: Partial<Parameters<typeof changePassword>[1]> = {}) =>
		changePassword(db, {
			sessionId: mine,
			current: OLD,
			password: NEW,
			again: NEW,
			stepUpOk: false,
			...over
		});

	it('works with the current password, and ends every other session but not this one', async () => {
		const result = await attempt();
		expect(result).toMatchObject({ ok: true, provedWithPassword: true, endedSessions: [theirs] });
		expect(
			db
				.select()
				.from(session)
				.all()
				.map((s) => s.id)
		).toEqual([mine]);
		expect(await checkOwnerPassword(db, OWNER_ID, NEW)).toBe(true);
		expect(await checkOwnerPassword(db, OWNER_ID, OLD)).toBe(false);
	});

	it('refuses a wrong current password, as a guess, and changes nothing', async () => {
		const result = await attempt({ current: 'not the old one', stepUpOk: true });
		expect(result).toMatchObject({ ok: false, refusal: { status: 400, guess: true } });
		expect(await checkOwnerPassword(db, OWNER_ID, OLD)).toBe(true);
		expect(db.select().from(session).all()).toHaveLength(2);
	});

	it('refuses with neither the current password nor a step-up', async () => {
		const result = await attempt({ current: '' });
		expect(result).toMatchObject({ ok: false, refusal: { status: 403, guess: false } });
		expect(await checkOwnerPassword(db, OWNER_ID, OLD)).toBe(true);
		expect(db.select().from(session).all()).toHaveLength(2);
	});

	it('works without the current password after a step-up or inside the recovery window', async () => {
		// Both reach here as stepUpOk: the store says yes for a fresh proof and for the 10 minutes.
		const result = await attempt({ current: '', stepUpOk: true });
		expect(result).toMatchObject({ ok: true, provedWithPassword: false, endedSessions: [theirs] });
		expect(await checkOwnerPassword(db, OWNER_ID, NEW)).toBe(true);
	});

	it('works for an owner who has no password yet, after a step-up', async () => {
		db.update(owner).set({ passwordHash: null }).run();
		expect((await attempt({ current: '' })).ok).toBe(false);
		expect((await attempt({ current: '', stepUpOk: true })).ok).toBe(true);
		expect(await checkOwnerPassword(db, OWNER_ID, NEW)).toBe(true);
	});

	it('applies the policy to the new password, and keeps the old one when it fails', async () => {
		for (const [password, again] of [
			['short', 'short'],
			['aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa'],
			[NEW, 'something else entirely']
		]) {
			const result = await attempt({ password, again });
			expect(result).toMatchObject({ ok: false, refusal: { status: 400, guess: false } });
		}
		const setupCode = await attempt({
			password: 'has setup-code in it',
			again: 'has setup-code in it',
			setupCode: 'setup-code'
		});
		expect(setupCode.ok).toBe(false);
		expect(await checkOwnerPassword(db, OWNER_ID, OLD)).toBe(true);
		expect(db.select().from(session).all()).toHaveLength(2);
	});
});

describe('TSK-2F1582 the change-password races', () => {
	let mine: string;
	let theirs: string;

	beforeEach(async () => {
		db.insert(owner).values({ id: OWNER_ID }).run();
		setPasswordHash(db, OWNER_ID, await hashPassword(OLD, FAST));
		mine = sha256Hex(createSession(db, OWNER_ID, 'this one').token);
		theirs = sha256Hex(createSession(db, OWNER_ID, 'another').token);
	});

	const change = (over: Partial<Parameters<typeof changePassword>[1]> = {}) =>
		changePassword(db, {
			sessionId: mine,
			current: '',
			password: NEW,
			again: NEW,
			stepUpOk: true,
			...over
		});

	it('a sign-in with the OLD password that finishes after the change starts no session', async () => {
		// The verification starts (and reads the old hash) before the change; the change then runs in full.
		const verifying = verifyOwnerPassword(db, OWNER_ID, OLD);
		expect((await change()).ok).toBe(true);
		const check = await verifying;
		expect(check.ok).toBe(true); // it did match the hash it read...

		const { cookies, jar } = cookieJar();
		const before = db.select().from(session).all().length;
		const started = startPasswordSession(
			db,
			testEvent({ cookies }),
			OWNER_ID,
			check.hash as string
		);
		// ...but that hash is gone, so no session, no cookie, no step-up.
		expect(started).toBe(false);
		expect(db.select().from(session).all()).toHaveLength(before);
		expect(jar.size).toBe(0);
		expect(stepUps.size()).toBe(0);
	});

	it('starts the session when the password did not change', async () => {
		const check = await verifyOwnerPassword(db, OWNER_ID, OLD);
		const { cookies, jar } = cookieJar();
		expect(startPasswordSession(db, testEvent({ cookies }), OWNER_ID, check.hash as string)).toBe(
			true
		);
		expect(jar.size).toBe(1);
		expect(db.select().from(session).all()).toHaveLength(3);
	});

	it('lets only one of two concurrent changes win, with a plain message for the other', async () => {
		const results = await Promise.all([
			change({ password: 'first brand new passphrase', again: 'first brand new passphrase' }),
			change({ password: 'second brand new phrase', again: 'second brand new phrase' })
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		const lost = results.find((r) => !r.ok)!;
		expect(lost).toMatchObject({ ok: false, refusal: { status: 409, message: CHANGED_MEANWHILE } });
		const winner = results[0].ok ? 'first brand new passphrase' : 'second brand new phrase';
		expect(await checkOwnerPassword(db, OWNER_ID, winner)).toBe(true);
	});

	it('refuses a change whose typed current password was replaced while it hashed', async () => {
		const slow = change({ current: OLD, stepUpOk: false });
		// The other change lands first by writing the row directly, as a finished change would.
		setPasswordHash(db, OWNER_ID, await hashPassword('someone got there first', FAST));
		expect(await slow).toMatchObject({ ok: false, refusal: { status: 409 } });
		expect(await checkOwnerPassword(db, OWNER_ID, 'someone got there first')).toBe(true);
		expect(db.select().from(session).all()).toHaveLength(2);
	});

	it('does nothing when the changing session is gone, and ends no other session', async () => {
		db.delete(session).where(eq(session.id, mine)).run();
		const result = await change();
		expect(result).toMatchObject({ ok: false, refusal: { status: 403 } });
		expect(await checkOwnerPassword(db, OWNER_ID, OLD)).toBe(true);
		expect(
			db
				.select()
				.from(session)
				.all()
				.map((s) => s.id)
		).toEqual([theirs]);
	});
});
