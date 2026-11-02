import { beforeEach, describe, expect, it } from 'vitest';
import { open, type Db } from '#lib/server/db/open.ts';
import { owner, passkey, recoveryCode } from '#lib/server/db/schema.ts';
import {
	addPasskey,
	cleanNickname,
	hasPasskeys,
	listPasskeys,
	OWNER_ID,
	ownerExists,
	registerOwner,
	RegistrationClosedError,
	removePasskey,
	removePasskeyUnlessLast,
	renamePasskey,
	type NewPasskey
} from './passkeys.ts';

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
beforeEach(() => {
	db = open(':memory:');
});

describe('TSK-46617D the first registration creates the owner, then registration is closed', () => {
	it('creates owner 1 with the password hash and issues 10 recovery codes, and no passkey', () => {
		expect(ownerExists(db)).toBe(false);
		const result = registerOwner(db, HASH);

		expect(result.ownerId).toBe(OWNER_ID);
		expect(result.recoveryCodes).toHaveLength(10);
		expect(ownerExists(db)).toBe(true);
		expect(db.select().from(owner).get()?.passwordHash).toBe(HASH);
		expect(listPasskeys(db, OWNER_ID)).toHaveLength(0);
		expect(db.select().from(recoveryCode).all()).toHaveLength(10);
	});

	it('refuses a second registration once an owner exists, and writes nothing', () => {
		registerOwner(db, HASH);
		expect(() => registerOwner(db, 'another-hash')).toThrow(RegistrationClosedError);

		expect(db.select().from(owner).all()).toHaveLength(1);
		expect(db.select().from(owner).get()?.passwordHash).toBe(HASH);
		expect(db.select().from(recoveryCode).all()).toHaveLength(10);
	});

	it('refuses even an owner who registered before passwords existed (no password set)', () => {
		db.insert(owner).values({ id: OWNER_ID }).run();
		expect(() => registerOwner(db, HASH)).toThrow(RegistrationClosedError);
		expect(db.select().from(owner).get()?.passwordHash).toBeNull();
	});
});

describe('TSK-D7D015 passkeys are optional: added, renamed and removed, even the last', () => {
	beforeEach(() => {
		registerOwner(db, HASH);
	});

	it('adds passkeys with their own nicknames', () => {
		expect(hasPasskeys(db, OWNER_ID)).toBe(false);
		addPasskey(db, OWNER_ID, key('cred-1', 'iPhone'));
		addPasskey(db, OWNER_ID, key('cred-2', 'Laptop'));
		expect(hasPasskeys(db, OWNER_ID)).toBe(true);
		expect(listPasskeys(db, OWNER_ID).map((p) => p.nickname)).toEqual(['iPhone', 'Laptop']);
	});

	it('renames a passkey, with a bounded nickname', () => {
		addPasskey(db, OWNER_ID, key('cred-1'));
		expect(renamePasskey(db, OWNER_ID, 'cred-1', '  Pixel   7  ')).toBe(true);
		expect(listPasskeys(db, OWNER_ID)[0].nickname).toBe('Pixel 7');
		expect(cleanNickname('x'.repeat(100))).toHaveLength(40);
		expect(cleanNickname('   ')).toBe('This device');
		expect(renamePasskey(db, OWNER_ID, 'nope', 'x')).toBe(false);
	});

	it('removes the last passkey too: the password always remains', () => {
		addPasskey(db, OWNER_ID, key('cred-1'));
		addPasskey(db, OWNER_ID, key('cred-2'));
		expect(removePasskey(db, OWNER_ID, 'cred-1')).toBe(true);
		expect(removePasskey(db, OWNER_ID, 'cred-2')).toBe(true);
		expect(db.select().from(passkey).all()).toHaveLength(0);
		expect(hasPasskeys(db, OWNER_ID)).toBe(false);
		expect(db.select().from(owner).get()?.passwordHash).toBe(HASH);
		expect(removePasskey(db, OWNER_ID, 'cred-2')).toBe(false);
	});
});

describe('TSK-2F1582 an owner with no password keeps the last passkey', () => {
	beforeEach(() => {
		registerOwner(db, HASH);
	});

	it('refuses to remove the last passkey while there is no password, and removes it once there is', () => {
		db.update(owner).set({ passwordHash: null }).run();
		addPasskey(db, OWNER_ID, key('cred-1'));
		expect(removePasskeyUnlessLast(db, OWNER_ID, 'cred-1')).toBe('needs-password');
		expect(listPasskeys(db, OWNER_ID)).toHaveLength(1);
		expect(removePasskeyUnlessLast(db, OWNER_ID, 'nope')).toBe('not-found');

		// With two, one may go; the other is then the last.
		addPasskey(db, OWNER_ID, key('cred-2'));
		expect(removePasskeyUnlessLast(db, OWNER_ID, 'cred-1')).toBe('removed');
		expect(removePasskeyUnlessLast(db, OWNER_ID, 'cred-2')).toBe('needs-password');

		db.update(owner).set({ passwordHash: HASH }).run();
		expect(removePasskeyUnlessLast(db, OWNER_ID, 'cred-2')).toBe('removed');
		expect(listPasskeys(db, OWNER_ID)).toHaveLength(0);
	});
});
