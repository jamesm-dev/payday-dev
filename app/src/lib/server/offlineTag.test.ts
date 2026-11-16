import { describe, expect, it } from 'vitest';
import { owner } from '#lib/server/db/schema.ts';
import { freshDb, ownerRow } from '#lib/server/db/testing.ts';
import { layoutOwner, tagOf } from './offlineTag.ts';

describe('TSK-faf834 whose the offline copy is', () => {
	it('is a fixed tag from the random backup id, never the account number', async () => {
		const db = await freshDb();
		await db.insert(owner).values(ownerRow(2));
		const [row] = await db.select().from(owner);
		const { setUp, ownerTag } = await layoutOwner(db, 2);
		expect(setUp).toBe(false);
		expect(ownerTag).toBe(tagOf(row!.backupId));
		expect(ownerTag).toMatch(/^[0-9a-f]{32}$/);
		expect(tagOf(row!.backupId)).toBe(ownerTag);
		expect(tagOf('another')).not.toBe(ownerTag);
	});

	it('signs out a stale cookie for an account that is gone', async () => {
		const db = await freshDb();
		await expect(layoutOwner(db, 99)).rejects.toMatchObject({ status: 401 });
	});
});
