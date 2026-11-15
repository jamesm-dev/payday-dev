import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import { accountKeyOf, findSignInOwner, signInIdentity } from './signInLookup.ts';

let db: Db;
beforeEach(async () => {
	db = await freshDb();
});

describe('TSK-55c7a4 the sign-in form finds who it is asking for', () => {
	it('reads the email in any case, with spaces, to the same account key', () => {
		const a = signInIdentity('  Ana@Example.COM ');
		expect(a).toMatchObject({ email: 'ana@example.com', blank: false });
		expect(a.key).toBe(signInIdentity('ana@example.com').key);
		expect(a.key).toBe(accountKeyOf('ana@example.com'));
		expect(a.key).not.toContain('ana'); // the address itself is never a counter key
	});

	it('treats an empty field as blank, and an invalid one as no account', () => {
		expect(signInIdentity('')).toMatchObject({ blank: true, email: null, key: 'blank' });
		expect(signInIdentity('   ')).toMatchObject({ blank: true });
		expect(signInIdentity(null)).toMatchObject({ blank: true });
		expect(signInIdentity('not an email')).toMatchObject({ blank: false, email: null });
		expect(signInIdentity('not an email').key).not.toBe('blank');
	});

	it('finds the owner by email, ignoring case', async () => {
		const [ana] = await db.insert(owner).values({ email: 'ana@example.com' }).returning();
		expect(await findSignInOwner(db, signInIdentity('ANA@example.com'))).toBe(ana.id);
		expect(await findSignInOwner(db, signInIdentity('bo@example.com'))).toBeNull();
		expect(await findSignInOwner(db, signInIdentity('not an email'))).toBeNull();
	});

	it('a blank email is the one owner without an email, until they add one', async () => {
		const [first] = await db.insert(owner).values({}).returning();
		await db.insert(owner).values({ email: 'ana@example.com' });
		expect(await findSignInOwner(db, signInIdentity(''))).toBe(first.id);
		await db.update(owner).set({ email: 'first@example.com' }).where(eq(owner.id, first.id));
		expect(await findSignInOwner(db, signInIdentity(''))).toBeNull();
	});
});
