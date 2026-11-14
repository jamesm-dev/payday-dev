import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { is, sql } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { afterEach, describe, expect, it } from 'vitest';
import {
	hostedRefusal,
	isPostgresUrl,
	openDatabase,
	postgresConnection,
	revokePublicApi,
	rowsOf,
	type Db
} from './open.ts';
import * as schema from './schema.ts';
import { account, owner, scheduleItem } from './schema.ts';
import {
	isSupabaseHost,
	SUPABASE_ROOT_2021_CA,
	SUPABASE_ROOT_2021_CA_SHA256
} from './supabaseRootCa.ts';
import { extraDb, freshDb } from './testing.ts';

const rows = async <T>(db: Db, query: ReturnType<typeof sql>) => rowsOf<T>(await db.execute(query));

const appTables = Object.values(schema)
	.filter((v) => is(v, PgTable))
	.map((t) => getTableConfig(t as PgTable).name);

describe('TSK-670346 TSK-10C918 openDatabase migrates and reads Postgres', () => {
	let dir: string | undefined;
	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = undefined;
	});

	it('TSK-C9A0D3 migrates an empty in-memory database to every table, and nothing else', async () => {
		const db = await freshDb();
		expect(await db.select().from(owner)).toEqual([]);
		expect(await db.select().from(account)).toEqual([]);
		expect(await db.select().from(scheduleItem)).toEqual([]);
		const tables = await rows<{ tablename: string }>(
			db,
			sql`select tablename from pg_tables where schemaname = 'payday' order by tablename`
		);
		expect(tables.map((t) => t.tablename)).toEqual([...appTables].sort());
		expect(appTables).toHaveLength(16);
	});

	it('TSK-670346 keeps every money column a 64-bit integer, never a float or text', async () => {
		const db = await freshDb();
		const money = await rows<{ table_name: string; column_name: string; data_type: string }>(
			db,
			sql`select table_name, column_name, data_type from information_schema.columns
				where table_schema = 'payday' and column_name like '%\_minor' order by 1, 2`
		);
		expect(money.length).toBeGreaterThan(10);
		expect(new Set(money.map((c) => c.data_type))).toEqual(new Set(['bigint']));
	});

	it('TSK-10C918 reads a bigint back as a plain number and a date back as YYYY-MM-DD', async () => {
		const db = await freshDb();
		await db.insert(owner).values({ id: 1 });
		const [acct] = await db
			.insert(account)
			.values({
				ownerId: 1,
				name: 'Main',
				balanceMinor: 123_456_789_012,
				balanceAsOf: '2026-11-02'
			})
			.returning();
		expect(acct.balanceMinor).toBe(123_456_789_012);
		expect(acct.balanceAsOf).toBe('2026-11-02');
		expect(acct.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});

	it('runs the migrations once: reopening the same directory keeps its rows', async () => {
		dir = mkdtempSync(join(tmpdir(), 'payday-'));
		const path = join(dir, 'data');
		const first = await openDatabase(path);
		await first.db.insert(owner).values({ id: 1 });
		await first.close();
		const second = await openDatabase(path);
		expect(await second.db.select({ id: owner.id }).from(owner)).toEqual([{ id: 1 }]);
		await second.close();
	});

	it('keeps a second process off a directory that one already holds', async () => {
		dir = mkdtempSync(join(tmpdir(), 'payday-'));
		const path = join(dir, 'data');
		// A lock held by a live process other than this one: the parent of the test runner is one.
		writeFileSync(`${path}.lock`, String(process.ppid));
		await expect(openDatabase(path)).rejects.toThrow(/in use by another process/);
	});

	it('takes over a lock left by a process that has gone', async () => {
		dir = mkdtempSync(join(tmpdir(), 'payday-'));
		const path = join(dir, 'data');
		writeFileSync(`${path}.lock`, '2147483646');
		const opened = await openDatabase(path);
		expect(await opened.db.select().from(owner)).toEqual([]);
		await opened.close();
	});

	it('refuses a SQLite file name, and leaves the file alone', async () => {
		dir = mkdtempSync(join(tmpdir(), 'payday-'));
		const file = join(dir, 'local.db');
		writeFileSync(file, 'not touched');
		await expect(openDatabase(file)).rejects.toThrow(/looks like a SQLite file/);
	});

	it('tells a Postgres address from a local one', () => {
		expect(isPostgresUrl('postgres://u:p@host:5432/db')).toBe(true);
		expect(isPostgresUrl('postgresql://u:p@host/db')).toBe(true);
		expect(isPostgresUrl('memory://')).toBe(false);
		expect(isPostgresUrl('.pglite')).toBe(false);
	});
});

describe('TSK-E6C4D8 the app tables are out of reach of the public data API', () => {
	it('keeps every app table in the payday schema and none in public', async () => {
		const db = await freshDb();
		const where = await rows<{ schemaname: string; tablename: string }>(
			db,
			sql`select schemaname, tablename from pg_tables
				where tablename = any(${sql.raw(`array[${appTables.map((t) => `'${t}'`).join(',')}]`)})`
		);
		expect(where).toHaveLength(appTables.length);
		expect(where.every((t) => t.schemaname === 'payday')).toBe(true);
		const inPublic = await rows<{ tablename: string }>(
			db,
			sql`select tablename from pg_tables where schemaname = 'public'`
		);
		expect(inPublic).toEqual([]);
	});

	it('takes every grant on payday away from anon and authenticated when Supabase has those roles', async () => {
		// What Supabase does: both roles exist, and new objects are granted to them by default.
		const db = await extraDb();
		await db.execute(sql`drop schema payday cascade`);
		await db.execute(sql`drop schema drizzle cascade`);
		await db.execute(sql`create role anon nologin`);
		await db.execute(sql`create role authenticated nologin`);
		await db.execute(sql`alter default privileges grant all on tables to anon, authenticated`);
		await db.execute(sql`alter default privileges grant all on sequences to anon, authenticated`);
		await db.execute(sql`alter default privileges grant all on functions to anon, authenticated`);
		const { migrate } = await import('drizzle-orm/pglite/migrator');
		await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: 'drizzle' });

		for (const role of ['anon', 'authenticated']) {
			const [schemaUsage] = await rows<{ ok: boolean }>(
				db,
				sql`select has_schema_privilege(${role}, 'payday', 'USAGE') as ok`
			);
			expect(schemaUsage.ok, `${role} may use the schema`).toBe(false);
			for (const table of appTables) {
				for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
					const [granted] = await rows<{ ok: boolean }>(
						db,
						sql`select has_table_privilege(${role}, ${`payday."${table}"`}, ${privilege}) as ok`
					);
					expect(granted.ok, `${role} ${privilege} ${table}`).toBe(false);
				}
			}
		}
	});
});

describe('TSK-10C918 the Postgres connection options', () => {
	const url = 'postgres://u:p%40ss@db.example.com:6543/postgres';

	it('asks for TLS when the address says nothing, and keeps the pooler-safe settings', () => {
		const c = postgresConnection(url);
		expect(c.options).toEqual({
			ssl: 'require',
			prepare: false,
			max: 1,
			idle_timeout: 20,
			connect_timeout: 10
		});
		expect(c.url).toBe(url);
	});

	it('honours an explicit sslmode, and takes it out of the address it hands the driver', () => {
		expect(postgresConnection(`${url}?sslmode=require`).options.ssl).toBe('require');
		expect(postgresConnection(`${url}?sslmode=require`).url).toBe(url);
		expect(postgresConnection(`${url}?sslmode=verify-full`).options.ssl).toEqual({
			rejectUnauthorized: true
		});
		expect(postgresConnection(`${url}?sslmode=verify-ca`, { caCert: 'PEM' }).options.ssl).toEqual({
			rejectUnauthorized: true,
			ca: 'PEM'
		});
	});

	it('verifies a Supabase host against Supabase’s own root by default', () => {
		const supabase =
			'postgres://payday_app.ref:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres';
		const verified = { rejectUnauthorized: true, ca: SUPABASE_ROOT_2021_CA };
		expect(postgresConnection(supabase).options.ssl).toEqual(verified);
		expect(postgresConnection(`${supabase}?sslmode=verify-full`).options.ssl).toEqual(verified);
		expect(postgresConnection(supabase, { caCert: 'PEM' }).options.ssl).toEqual({
			rejectUnauthorized: true,
			ca: 'PEM'
		});
		expect(isSupabaseHost('db.abc.supabase.co')).toBe(true);
		expect(isSupabaseHost('supabase.com.example.org')).toBe(false);
	});

	it('bundles the Supabase root certificate it says it does', () => {
		const sha = new X509Certificate(SUPABASE_ROOT_2021_CA).fingerprint256;
		expect(sha).toBe(SUPABASE_ROOT_2021_CA_SHA256);
		expect(new X509Certificate(SUPABASE_ROOT_2021_CA).subject).toContain(
			'CN=Supabase Root 2021 CA'
		);
	});

	it('refuses an sslmode that can fall back to clear text, except in development', () => {
		for (const mode of ['disable', 'allow', 'prefer']) {
			expect(() => postgresConnection(`${url}?sslmode=${mode}`)).toThrow(/unencrypted/);
		}
		const dev = { allowInsecure: true };
		expect(postgresConnection(`${url}?sslmode=disable`, dev).options.ssl).toBe(false);
		expect(postgresConnection(`${url}?sslmode=prefer`, dev).options.ssl).toBe('prefer');
		expect(() => postgresConnection(`${url}?sslmode=bogus`)).toThrow(/does not know/);
	});

	it('CA hook: a certificate turns the default into a verified connection', () => {
		expect(postgresConnection(url, { caCert: 'PEM' }).options.ssl).toEqual({
			rejectUnauthorized: true,
			ca: 'PEM'
		});
	});
});

describe('TSK-E6C4D8 a table added later is closed to the public API too', () => {
	it('re-running the revoke takes anon and authenticated off a new payday table', async () => {
		const db = await extraDb();
		await db.execute(sql`create role anon nologin`);
		await db.execute(sql`create role authenticated nologin`);
		await db.execute(sql`alter default privileges grant all on tables to anon, authenticated`);
		await db.execute(sql`alter default privileges grant usage on schemas to anon, authenticated`);
		await db.execute(sql`create table payday.added_later (id integer primary key)`);
		const can = async (role: string) => {
			const [t] = await rows<{ ok: boolean }>(
				db,
				sql`select has_table_privilege(${role}, 'payday.added_later', 'SELECT') as ok`
			);
			return t.ok;
		};
		// The premise: Supabase's defaults DO hand the new table out.
		expect(await can('anon')).toBe(true);

		await revokePublicApi(db);

		for (const role of ['anon', 'authenticated']) {
			expect(await can(role), `${role} on the new table`).toBe(false);
			const [usage] = await rows<{ ok: boolean }>(
				db,
				sql`select has_schema_privilege(${role}, 'payday', 'USAGE') as ok`
			);
			expect(usage.ok, `${role} USAGE on payday`).toBe(false);
		}
	});
});

describe('TSK-7975B9 a hosted (production) build never falls back to a local database', () => {
	const secret = 'hunter2';

	it('refuses anything that is not a postgres address, and never repeats it', () => {
		for (const url of [
			'memory://',
			'.pglite',
			'./local.db',
			`mysql://u:${secret}@h/db`,
			'',
			'   '
		]) {
			const message = hostedRefusal(url, true);
			expect(message, url).toContain('postgres://');
			expect(message).not.toContain(secret);
		}
	});

	it('accepts postgres:// and postgresql://, with stray spaces around them', () => {
		expect(hostedRefusal('postgres://u:p@h:6543/db', true)).toBeNull();
		expect(hostedRefusal('  postgresql://u:p@h/db ', true)).toBeNull();
	});

	it('asks nothing of a build that is not hosted (development, tests)', () => {
		expect(hostedRefusal('memory://', false)).toBeNull();
		expect(hostedRefusal('.pglite', false)).toBeNull();
	});

	it('never puts the address in an error: not a valid URL, not a SQLite file name', async () => {
		let thrown: unknown;
		try {
			postgresConnection(`postgres://u:${secret}@[bad`);
		} catch (error) {
			thrown = error;
		}
		expect(String(thrown)).toContain('not a valid address');
		expect(String(thrown)).not.toContain(secret);
		await expect(openDatabase(`/tmp/${secret}.db`)).rejects.toThrow(/looks like a SQLite file/);
		await expect(openDatabase(`/tmp/${secret}.db`)).rejects.not.toThrow(new RegExp(secret));
	});
});
