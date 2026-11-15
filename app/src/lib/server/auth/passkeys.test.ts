import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner, passkey, recoveryCode } from '#lib/server/db/schema.ts';
import {
	addPasskey,
	cleanNickname,
	hasPasskeys,
	insertOwner,
	listPasskeys,
	ownerExists,
	registerOwner,
	RegistrationClosedError,
	removePasskey,
	removePasskeyUnlessLast,
	renamePasskey,
	type NewPasskey
} from './passkeys.ts';
import { ownerRow } from '#lib/server/db/testing.ts';

/** The first person in a fresh test database. */
const OWNER_ID = 1;

const key = (id: string, nickname = 'iPhone'): NewPasskey => ({
	id,
	publicKey: new Uint8Array([1, 2, 3, 4]),
	counter: 0,
	transports: ['internal'],
	nickname
});

/** A stand-in for a stored hash: this file tests the database, not scrypt. */
const HASH = 'scrypt$N=32768,r=8,p=3$c2FsdHNhbHRzYWx0$a2V5a2V5a2V5a2V5a2V5';

let db: Db;
beforeEach(async () => {
	db = await freshDb();
});

describe('TSK-46617D the first registration creates the owner, then registration is closed', () => {
	it('creates owner 1 with the password hash and issues 10 recovery codes, and no passkey', async () => {
		expect(await ownerExists(db)).toBe(false);
		const result = await registerOwner(db, HASH);

		expect(result.ownerId).toBe(OWNER_ID);
		expect(result.recoveryCodes).toHaveLength(10);
		expect(await ownerExists(db)).toBe(true);
		expect((await db.select().from(owner))[0]?.passwordHash).toBe(HASH);
		expect(await listPasskeys(db, OWNER_ID)).toHaveLength(0);
		expect(await db.select().from(recoveryCode)).toHaveLength(10);
	});

	it('refuses a second registration once an owner exists, and writes nothing', async () => {
		await registerOwner(db, HASH);
		await expect(registerOwner(db, 'another-hash')).rejects.toThrow(RegistrationClosedError);

		expect(await db.select().from(owner)).toHaveLength(1);
		expect((await db.select().from(owner))[0]?.passwordHash).toBe(HASH);
		expect(await db.select().from(recoveryCode)).toHaveLength(10);
	});

	it('TSK-4da7e9 refuses once anyone has an account, whatever their id, and lets two racing registrations make one', async () => {
		await db.insert(owner).values(ownerRow(7));
		await expect(registerOwner(db, HASH)).rejects.toThrow(RegistrationClosedError);
		expect(await db.select().from(owner)).toHaveLength(1);
	});

	it('TSK-4da7e9 lets exactly one of two simultaneous first registrations in', async () => {
		const results = await Promise.allSettled([registerOwner(db, HASH), registerOwner(db, HASH)]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
		expect(refused.reason).toBeInstanceOf(RegistrationClosedError);
		expect(await db.select().from(owner)).toHaveLength(1);
		expect(await db.select().from(recoveryCode)).toHaveLength(10);
	});

	it('refuses even an owner who registered before passwords existed (no password set)', async () => {
		await db.insert(owner).values({ id: OWNER_ID });
		await expect(registerOwner(db, HASH)).rejects.toThrow(RegistrationClosedError);
		expect((await db.select().from(owner))[0]?.passwordHash).toBeNull();
	});
});

describe('TSK-D7D015 passkeys are optional: added, renamed and removed, even the last', () => {
	beforeEach(async () => {
		await registerOwner(db, HASH);
	});

	it('adds passkeys with their own nicknames', async () => {
		expect(await hasPasskeys(db, OWNER_ID)).toBe(false);
		await addPasskey(db, OWNER_ID, key('cred-1', 'iPhone'));
		await addPasskey(db, OWNER_ID, key('cred-2', 'Laptop'));
		expect(await hasPasskeys(db, OWNER_ID)).toBe(true);
		expect((await listPasskeys(db, OWNER_ID)).map((p) => p.nickname)).toEqual(['iPhone', 'Laptop']);
	});

	it('renames a passkey, with a bounded nickname', async () => {
		await addPasskey(db, OWNER_ID, key('cred-1'));
		expect(await renamePasskey(db, OWNER_ID, 'cred-1', '  Pixel   7  ')).toBe(true);
		expect((await listPasskeys(db, OWNER_ID))[0].nickname).toBe('Pixel 7');
		expect(cleanNickname('x'.repeat(100))).toHaveLength(40);
		expect(cleanNickname('   ')).toBe('This device');
		expect(await renamePasskey(db, OWNER_ID, 'nope', 'x')).toBe(false);
	});

	it('removes the last passkey too: the password always remains', async () => {
		await addPasskey(db, OWNER_ID, key('cred-1'));
		await addPasskey(db, OWNER_ID, key('cred-2'));
		expect(await removePasskey(db, OWNER_ID, 'cred-1')).toBe(true);
		expect(await removePasskey(db, OWNER_ID, 'cred-2')).toBe(true);
		expect(await db.select().from(passkey)).toHaveLength(0);
		expect(await hasPasskeys(db, OWNER_ID)).toBe(false);
		expect((await db.select().from(owner))[0]?.passwordHash).toBe(HASH);
		expect(await removePasskey(db, OWNER_ID, 'cred-2')).toBe(false);
	});
});

describe('TSK-b7d40a Google counts as a way in only while it is switched on', () => {
	beforeEach(async () => {
		await registerOwner(db, HASH);
		await db.update(owner).set({ passwordHash: null, googleSub: 'sub-1' });
		await addPasskey(db, OWNER_ID, key('cred-1'));
	});

	it('keeps the last passkey when Google is off, even with Google connected', async () => {
		expect(await removePasskeyUnlessLast(db, OWNER_ID, 'cred-1')).toBe('needs-password');
		expect(await removePasskeyUnlessLast(db, OWNER_ID, 'cred-1', false)).toBe('needs-password');
		expect(await listPasskeys(db, OWNER_ID)).toHaveLength(1);
	});

	it('removes the last passkey when Google is on and connected', async () => {
		expect(await removePasskeyUnlessLast(db, OWNER_ID, 'cred-1', true)).toBe('removed');
	});

	it('keeps the last passkey when Google is on but not connected', async () => {
		await db.update(owner).set({ googleSub: null });
		expect(await removePasskeyUnlessLast(db, OWNER_ID, 'cred-1', true)).toBe('needs-password');
	});
});

describe('TSK-d24c97 an owner with no password needs a Google account instead', () => {
	it('inserts a Google owner with a null hash, and refuses a null hash with no Google id', async () => {
		const made = await db.transaction((tx) =>
			insertOwner(tx, null, 'g@example.test', new Date(), 'sub-1')
		);
		const [row] = await db.select().from(owner).where(eq(owner.id, made.ownerId));
		expect(row).toMatchObject({ passwordHash: null, googleSub: 'sub-1', email: 'g@example.test' });
		expect(made.recoveryCodes).toHaveLength(10);
		await expect(insertOwner(db, null, 'x@example.test')).rejects.toThrow();
		expect(await db.select().from(owner)).toHaveLength(1);
	});
});

describe('TSK-2F1582 an owner with no password keeps the last passkey', () => {
	beforeEach(async () => {
		await registerOwner(db, HASH);
	});

	it('refuses to remove the last passkey while there is no password, and removes it once there is', async () => {
		await db.update(owner).set({ passwordHash: null });
		await addPasskey(db, OWNER_ID, key('cred-1'));
		expect(await removePasskeyUnlessLast(db, OWNER_ID, 'cred-1')).toBe('needs-password');
		expect(await listPasskeys(db, OWNER_ID)).toHaveLength(1);
		expect(await removePasskeyUnlessLast(db, OWNER_ID, 'nope')).toBe('not-found');

		// With two, one may go; the other is then the last.
		await addPasskey(db, OWNER_ID, key('cred-2'));
		expect(await removePasskeyUnlessLast(db, OWNER_ID, 'cred-1')).toBe('removed');
		expect(await removePasskeyUnlessLast(db, OWNER_ID, 'cred-2')).toBe('needs-password');

		await db.update(owner).set({ passwordHash: HASH });
		expect(await removePasskeyUnlessLast(db, OWNER_ID, 'cred-2')).toBe('removed');
		expect(await listPasskeys(db, OWNER_ID)).toHaveLength(0);
	});
});
