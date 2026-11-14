/**
 * A database for tests: a real Postgres (PGlite, in this process, in memory), migrated with the
 * checked-in migrations. No Docker, no network.
 *
 * Starting PGlite and running the migrations costs a fraction of a second; a few hundred tests
 * cannot each afford one. So a test FILE migrates once, and `freshDb()` empties every table and
 * restarts every id between tests. Where a test needs a second database alongside the first (a
 * backup moving from one to another), `extraDb()` opens an independent one.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect } from 'vitest';
import { openDatabase, type Db, type Opened } from './open.ts';

let shared: Promise<Opened> | undefined;
const opened: Opened[] = [];

async function openOne(): Promise<Opened> {
	const one = await openDatabase('memory://');
	opened.push(one);
	return one;
}

let lastTest: string | undefined;

/**
 * This file's database, with no rows in it and every id starting again from 1. The first call in a
 * test gets the file's shared database; a second call in the same test gets an independent one (a
 * test that builds two households wants two databases, as `open(':memory:')` once gave it).
 */
export async function freshDb(): Promise<Db> {
	const test = expect.getState().currentTestName;
	if (test !== undefined && test === lastTest) return extraDb();
	lastTest = test;
	shared ??= openOne();
	const { db } = await shared;
	await emptyAllTables(db);
	return db;
}

/** A second, independent database (also empty), for a test that needs two at once. */
export async function extraDb(): Promise<Db> {
	return (await openOne()).db;
}

/** Empties every table of the `payday` schema and restarts its identity counters. */
export async function emptyAllTables(db: Db): Promise<void> {
	await db.execute(sql`
		do $$
		declare names text;
		begin
			select string_agg(format('%I.%I', schemaname, tablename), ', ') into names
				from pg_tables where schemaname = 'payday';
			execute 'truncate ' || names || ' restart identity cascade';
		end
		$$
	`);
}

// Start the file's database before its first test, not inside it: with every test file starting a
// PGlite at once the first one can take several seconds, which is not the test's time to spend.
beforeAll(async () => {
	await (shared ??= openOne());
}, 120_000);

// Let go of the in-memory databases when the test file is done.
afterAll(async () => {
	await Promise.all(opened.splice(0).map((one) => one.close()));
	shared = undefined;
});
