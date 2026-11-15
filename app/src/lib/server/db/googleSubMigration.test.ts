/**
 * TSK-b7d40a migration 0007 adds owner.google_sub and a unique index on it. It only adds: owner rows
 * come through unchanged, two owners cannot share a Google account, and any number can have none.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER, openDatabase, rowsOf } from './open.ts';

/** The migrations up to and including 0006: the folder as it stood before this phase. */
function cutAt0006(): string {
	const dir = mkdtempSync(join(tmpdir(), 'payday-0006-'));
	cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
	rmSync(join(dir, '0007_owner_google_sub.sql'));
	const journalFile = join(dir, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalFile, 'utf8'));
	journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 6);
	writeFileSync(journalFile, JSON.stringify(journal));
	return dir;
}

describe('TSK-b7d40a migration 0007 adds the Google account number', () => {
	it('keeps owner rows unchanged and leaves google_sub empty', async () => {
		const one = await openDatabase('memory://', { migrationsFolder: cutAt0006() });
		const read = async () =>
			rowsOf(
				await one.db.execute(
					sql`select id, email, created_at, backup_id, encode(webauthn_user_id, 'hex') as handle from payday.owner order by id`
				)
			);
		await one.db.execute(sql`insert into payday.owner (id, email) values (1, 'a@example.com')`);
		await one.db.execute(sql`insert into payday.owner (id) values (2)`);
		const before = await read();
		expect(before).toHaveLength(2);

		await migrate(one.db as never, { migrationsFolder: MIGRATIONS_FOLDER });

		expect(await read()).toEqual(before);
		const subs = rowsOf(await one.db.execute(sql`select google_sub from payday.owner`));
		expect(subs.every((r) => (r as { google_sub: unknown }).google_sub === null)).toBe(true);
	});

	it('refuses two owners with the same google_sub, but lets null repeat', async () => {
		const one = await openDatabase('memory://', {});
		const add = (id: number, email: string, sub: string | null) =>
			one.db.execute(
				sql`insert into payday.owner (id, email, google_sub) values (${id}, ${email}, ${sub})`
			);
		await add(1, 'a@example.com', 'sub-1');
		await expect(add(2, 'b@example.com', 'sub-1')).rejects.toThrow();
		await add(3, 'c@example.com', null);
		await add(4, 'd@example.com', null);
		await add(5, 'e@example.com', 'sub-2');
	});
});
