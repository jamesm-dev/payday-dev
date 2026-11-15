import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import {
	chargeEmailChange,
	EMAIL_CHANGES_PER_ADDRESS,
	EMAIL_CHANGES_PER_ACCOUNT,
	EMAIL_CHANGES_PER_SITE,
	EMAIL_TAKEN,
	getOwnerEmail,
	setOwnerEmail
} from './ownerEmail.ts';

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

describe('TSK-be6817 email changes are limited per account, per address and for the site', () => {
	const NOW = 1_000_000;

	it('holds an account to 3 an hour from any number of addresses, then lets it try again', async () => {
		for (let i = 0; i < EMAIL_CHANGES_PER_ACCOUNT; i++) {
			expect(await chargeEmailChange(db, first, `10.0.0.${i}`, NOW)).toBe(true);
		}
		expect(await chargeEmailChange(db, first, '10.0.0.99', NOW)).toBe(false);
		expect(await chargeEmailChange(db, second, '10.0.0.99', NOW)).toBe(true);
		expect(await chargeEmailChange(db, first, '10.0.0.1', NOW + 60 * 60 * 1000 + 1)).toBe(true);
	});

	it('holds one address far higher, so a shared address is not blocked by a few people', async () => {
		// Three people each use their three on one shared address: nobody is turned away.
		const people = [first, second];
		const [{ id: third }] = await db
			.insert(owner)
			.values({ email: 'c@example.com' })
			.returning({ id: owner.id });
		for (const id of [...people, third]) {
			for (let i = 0; i < EMAIL_CHANGES_PER_ACCOUNT; i++) {
				expect(await chargeEmailChange(db, id, '192.0.2.1', NOW)).toBe(true);
			}
		}
	});

	it('refuses an address that many accounts use past its ceiling, and gives the account back its try', async () => {
		let made = 0;
		const next = async () => {
			const [{ id }] = await db
				.insert(owner)
				.values({ email: `p${made++}@example.com` })
				.returning({ id: owner.id });
			return id;
		};
		// 5 accounts x 3 = 15 from one address, the ceiling.
		for (let a = 0; a < EMAIL_CHANGES_PER_ADDRESS / EMAIL_CHANGES_PER_ACCOUNT; a++) {
			const id = await next();
			for (let i = 0; i < EMAIL_CHANGES_PER_ACCOUNT; i++) {
				expect(await chargeEmailChange(db, id, '192.0.2.2', NOW)).toBe(true);
			}
		}
		const late = await next();
		expect(await chargeEmailChange(db, late, '192.0.2.2', NOW)).toBe(false);
		// The refusal cost that account nothing: from another address it still has all three.
		for (let i = 0; i < EMAIL_CHANGES_PER_ACCOUNT; i++) {
			expect(await chargeEmailChange(db, late, '192.0.2.3', NOW)).toBe(true);
		}
	});

	it('holds the whole site to 30 an hour, whoever and wherever', async () => {
		for (let i = 0; i < EMAIL_CHANGES_PER_SITE; i++) {
			const [{ id }] = await db
				.insert(owner)
				.values({ email: `s${i}@example.com` })
				.returning({ id: owner.id });
			expect(await chargeEmailChange(db, id, `198.51.100.${i}`, NOW)).toBe(true);
		}
		expect(await chargeEmailChange(db, first, '203.0.113.200', NOW)).toBe(false);
		expect(await chargeEmailChange(db, first, '203.0.113.200', NOW + 60 * 60 * 1000 + 1)).toBe(
			true
		);
	});
});
