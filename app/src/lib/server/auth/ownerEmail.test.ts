import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import { EMAIL_TAKEN, getOwnerEmail, setOwnerEmail } from './ownerEmail.ts';

let db: Db;
let first: number;
let second: number;
beforeEach(async () => {
	db = await freshDb();
	[{ id: first }] = await db.insert(owner).values({}).returning({ id: owner.id });
	[{ id: second }] = await db
		.insert(owner)
		.values({ email: 'bo@example.com' })
		.returning({ id: owner.id });
});

describe('TSK-5ff868 TSK-55c7a4 adding and changing the email', () => {
	it('adds one, stored in lower case and trimmed', async () => {
		expect(await getOwnerEmail(db, first)).toBeNull();
		expect(await setOwnerEmail(db, first, '  Ana@Example.COM ')).toEqual({
			ok: true,
			email: 'ana@example.com'
		});
		expect(await getOwnerEmail(db, first)).toBe('ana@example.com');
	});

	it('changes it, and setting the same one again is fine', async () => {
		await setOwnerEmail(db, first, 'ana@example.com');
		expect(await setOwnerEmail(db, first, 'ANA@example.com')).toMatchObject({ ok: true });
		expect(await setOwnerEmail(db, first, 'ana2@example.com')).toMatchObject({ ok: true });
		expect(await getOwnerEmail(db, first)).toBe('ana2@example.com');
	});

	it("refuses another account's email, in any case, in plain words, changing nothing", async () => {
		expect(await setOwnerEmail(db, first, 'BO@example.com')).toEqual({
			ok: false,
			message: EMAIL_TAKEN
		});
		expect(await getOwnerEmail(db, first)).toBeNull();
		expect(await getOwnerEmail(db, second)).toBe('bo@example.com');
	});

	it('refuses an email that is not one, in plain words', async () => {
		for (const bad of ['', 'nobody', 'a@@b', 'x'.repeat(260) + '@example.com']) {
			expect((await setOwnerEmail(db, first, bad)).ok).toBe(false);
		}
		expect(await getOwnerEmail(db, first)).toBeNull();
	});

	it('the database still refuses a duplicate that slips past the check (two at once)', async () => {
		const results = await Promise.all([
			setOwnerEmail(db, first, 'same@example.com'),
			setOwnerEmail(db, second, 'same@example.com')
		]);
		expect(results.filter((r) => r.ok)).toHaveLength(1);
		const rows = await db.select().from(owner).where(eq(owner.email, 'same@example.com'));
		expect(rows).toHaveLength(1);
	});
});
