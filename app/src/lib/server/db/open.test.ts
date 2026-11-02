import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { open } from './open';
import { account, owner, scheduleItem } from './schema';

const tables = (db: ReturnType<typeof open>) =>
	db
		.all<{ name: string }>(sql`select name from sqlite_master where type = 'table' order by name`)
		.map((t) => t.name);

describe('TSK-213DCD open() migrates and reads SQLite', () => {
	let dir: string | undefined;
	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = undefined;
	});

	it('migrates an empty database to the Phase 1 tables, and drops the Phase 0 figure', () => {
		const db = open(':memory:');
		expect(db.select().from(owner).all()).toEqual([]);
		expect(db.select().from(account).all()).toEqual([]);
		expect(db.select().from(scheduleItem).all()).toEqual([]);
		expect(tables(db)).not.toContain('skeleton_figure');
		expect(tables(db)).toContain('schedule_item');
	});

	it('runs the migrations once: reopening the same file keeps its rows', () => {
		dir = mkdtempSync(join(tmpdir(), 'payday-'));
		const file = join(dir, 'test.db');
		const first = open(file);
		first.insert(owner).values({ id: 1 }).run();
		first.$client.close();
		const db = open(file);
		expect(db.select({ id: owner.id }).from(owner).all()).toEqual([{ id: 1 }]);
		db.$client.close();
	});

	it('puts a file database in WAL mode, which Litestream replicates from', () => {
		dir = mkdtempSync(join(tmpdir(), 'payday-'));
		const db = open(join(dir, 'test.db'));
		expect(db.get<{ journal_mode: string }>(sql`pragma journal_mode`)).toEqual({
			journal_mode: 'wal'
		});
		db.$client.close();
	});
});
