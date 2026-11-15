/**
 * TSK-ea2432 migration 0006 gives every person their own row: an email, a passkey handle, a backup
 * id, and the counter that hands out the next id. It only adds, so a database that already holds the
 * owner's budget must come out of it with that budget untouched.
 *
 * The test migrates a database to 0005 (a copy of the migrations folder cut off after 0005), puts a
 * fictional household in it as owner 1 the way registerOwner does (id named by hand), applies 0006 on
 * top, and compares.
 *
 * The app's code reads the owner row whole, so it cannot run against a database that lacks the new
 * columns. So "before" is the raw rows of every table, and the figures the app computes (safe to
 * spend, plan, loans, check-ins, marks, passkeys, the export) are compared with a database that was
 * migrated to the end first and restored the same way.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addPasskey, listPasskeys } from '#lib/server/auth/passkeys.ts';
import { beginRegistration, relyingPartyFrom } from '#lib/server/auth/webauthn.ts';
import { insertRecoveryCodes } from '#lib/server/auth/recovery.ts';
import { listFinished } from '#lib/server/money/checkin.ts';
import { exportBackup, restoreBackup } from '#lib/server/money/fullBackup.ts';
import { computeSafe } from '#lib/server/money/home.ts';
import { listLoans } from '#lib/server/money/loans.ts';
import { MIGRATIONS_FOLDER, openDatabase, rowsOf, type Db, type Opened } from './open.ts';
import { owner, paidMark } from './schema.ts';

const NOW = new Date('2026-10-31T12:00:00Z');
const FIXTURE = readFileSync(join(import.meta.dirname, 'fixtures', 'backup-v2.json'), 'utf8');

let to0005: string;
const opened: Opened[] = [];

/** The migrations up to and including 0005: the folder as it stood before this phase. */
function cutAt0005(): string {
	const dir = mkdtempSync(join(tmpdir(), 'payday-0005-'));
	cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
	rmSync(join(dir, '0006_owner_columns.sql'));
	const journalFile = join(dir, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalFile, 'utf8'));
	journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 5);
	writeFileSync(journalFile, JSON.stringify(journal));
	return dir;
}

async function open(folder?: string): Promise<Db> {
	const one = await openDatabase('memory://', folder ? { migrationsFolder: folder } : {});
	opened.push(one);
	return one.db;
}

/** Applies every migration the folder has that the database has not run: here, only 0006. */
const applyRest = (db: Db) => migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });

/** Owner 1 as registerOwner makes it, in either schema: raw SQL, because the new columns may not exist yet. */
const registerByHand = (db: Db) => db.execute(sql`insert into payday.owner (id) values (1)`);

/** Owner 1, the fictional household from the version 2 backup file, a passkey and recovery codes. */
async function moveIn(db: Db) {
	await registerByHand(db);
	await restoreBackup(db, 1, FIXTURE);
	await addPasskey(db, 1, {
		id: 'cred-fiction',
		publicKey: new Uint8Array([1, 2, 3]),
		counter: 4,
		transports: ['internal'],
		nickname: 'Phone'
	});
	await insertRecoveryCodes(db, 1, NOW);
}

const TABLES = [
	'account',
	'check_in',
	'expense',
	'loan',
	'loan_balance',
	'occurrence_override',
	'paid_mark',
	'passkey',
	'payment_confirmation',
	'recovery_code',
	'schedule_item',
	'session'
];

/** Every row of every table the migration does not mean to touch, as text, in a fixed order. */
async function rawRows(db: Db): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const table of TABLES) {
		const rows = rowsOf<{ rows: string }>(
			await db.execute(
				sql.raw(
					`select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]')::text as rows from payday.${table} t`
				)
			)
		);
		out[table] = rows[0]!.rows;
	}
	// The owner row's own columns; the new ones are the point of the migration.
	out.owner = rowsOf<{ row: string }>(
		await db.execute(
			sql`select to_jsonb(o)::text as row from (select id, password_hash, currency, time_zone, setup_step, reminder_time, last_backup_at, created_at from payday.owner) o`
		)
	)[0]!.row;
	return out;
}

/** What the app computes for owner 1. */
async function figures(db: Db) {
	return {
		safe: await computeSafe(db, 1, NOW),
		loans: await listLoans(db, 1),
		checkIns: await listFinished(db, 1),
		marks: await db.select().from(paidMark),
		// Passkeys without the moment they were added, and recovery codes by count: the hashes are random.
		passkeys: (await listPasskeys(db, 1)).map((p) => ({ ...p, createdAt: undefined })),
		recoveryCodes: rowsOf<{ n: number }>(
			await db.execute(sql`select count(*)::int as n from payday.recovery_code where owner_id = 1`)
		)[0]!.n,
		// The backup id is random per database (it says whose a file is), so like the time it is blanked.
		exported: { ...(await exportBackup(db, 1, NOW)), exportedAt: '', backupId: '' }
	};
}

beforeAll(() => {
	to0005 = cutAt0005();
});

afterAll(async () => {
	await Promise.all(opened.map((o) => o.close()));
	rmSync(to0005, { recursive: true, force: true });
});

describe('TSK-ea2432 migration 0006 on a database that holds a budget', () => {
	it('leaves the number, plan, loans, check-ins, marks, passkeys and export as they were', async () => {
		const reference = await open();
		await moveIn(reference);
		const expected = await figures(reference);
		// The household is real enough to mean something.
		expect(expected.loans.length).toBeGreaterThan(0);
		expect(expected.checkIns.length).toBeGreaterThan(0);
		expect(expected.marks.length).toBeGreaterThan(0);
		expect(expected.passkeys).toHaveLength(1);
		expect(expected.safe.state).toBe('ready');

		const db = await open(to0005);
		const columns = rowsOf<{ column_name: string }>(
			await db.execute(
				sql`select column_name from information_schema.columns where table_schema = 'payday' and table_name = 'owner'`
			)
		);
		expect(columns.map((c) => c.column_name)).not.toContain('email');
		await moveIn(db);
		const rowsAt0005 = await rawRows(db);
		await applyRest(db);

		// Not one existing row changed, and the app computes what it computes on a database migrated to the end first.
		expect(await rawRows(db)).toEqual(rowsAt0005);
		const after = await figures(db);
		expect(after).toEqual(expected);
		expect(after.exported).toEqual(expected.exported);
	});

	it('gives owner 1 the passkey handle webauthn.ts has always used, and a backup id of their own', async () => {
		const db = await open(to0005);
		await moveIn(db);
		await applyRest(db);
		const [row] = rowsOf<{ handle: string; backup_id: string; email: string | null }>(
			await db.execute(
				sql`select encode(webauthn_user_id, 'hex') as handle, backup_id, email from payday.owner where id = 1`
			)
		);
		const handle = Buffer.from(new TextEncoder().encode('payday-owner')).toString('hex');
		expect(row!.handle).toBe(handle);
		expect(row!.backup_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
		);
		expect(row!.email).toBeNull();
		// That handle is the one the passkey code sends: ask it for owner 1's registration options.
		const { options } = await beginRegistration(
			db,
			relyingPartyFrom(new URL('https://payday.example/')),
			'add-passkey',
			1
		);
		expect(Buffer.from(options.user.id, 'base64url')).toEqual(
			Buffer.from(new TextEncoder().encode('payday-owner'))
		);
	});

	it('hands the next sign-up id 2, not the id 1 that registerOwner wrote by hand', async () => {
		const db = await open(to0005);
		await moveIn(db);
		await applyRest(db);
		const [second] = await db
			.insert(owner)
			.values({ email: 'ana@example.com' })
			.returning({ id: owner.id });
		expect(second!.id).toBe(2);
		const [third] = await db
			.insert(owner)
			.values({ email: 'ben@example.com' })
			.returning({ id: owner.id });
		expect(third!.id).toBe(3);
	});

	it('gives each new person their own random handle and backup id', async () => {
		const db = await open(to0005);
		await moveIn(db);
		await applyRest(db);
		await db.insert(owner).values([{ email: 'ana@example.com' }, { email: 'ben@example.com' }]);
		const rows = rowsOf<{ handle: string; backup_id: string }>(
			await db.execute(
				sql`select encode(webauthn_user_id, 'hex') as handle, backup_id from payday.owner order by id`
			)
		);
		expect(new Set(rows.map((r) => r.handle)).size).toBe(3);
		expect(new Set(rows.map((r) => r.backup_id)).size).toBe(3);
		expect(rows[1]!.handle).toMatch(/^[0-9a-f]{32}$/);
	});

	it('runs on an empty database without moving the counter, so the first row is id 1', async () => {
		const db = await open(to0005);
		await applyRest(db);
		const [first] = await db
			.insert(owner)
			.values({ email: 'ana@example.com' })
			.returning({ id: owner.id });
		expect(first!.id).toBe(1);
	});
});

describe('TSK-ea2432 the owner constraints', () => {
	async function fresh(): Promise<Db> {
		const db = await open();
		await db.insert(owner).values({});
		return db;
	}

	it('refuses the same email in a different case', async () => {
		const db = await fresh();
		await db.insert(owner).values({ email: 'Ana@Example.com' });
		await expect(db.insert(owner).values({ email: 'ana@example.COM' })).rejects.toThrow();
		await db.insert(owner).values({ email: 'ben@example.com' });
	});

	it('allows only one owner with no email', async () => {
		const db = await fresh();
		await expect(db.insert(owner).values({})).rejects.toThrow();
		await db.insert(owner).values({ email: 'ana@example.com' });
		await expect(db.insert(owner).values({ email: null })).rejects.toThrow();
	});

	it('refuses a second owner with the same passkey handle or backup id', async () => {
		const db = await fresh();
		await expect(
			db.execute(
				sql`insert into payday.owner (email, webauthn_user_id) select 'a@b.co', webauthn_user_id from payday.owner`
			)
		).rejects.toThrow();
		await expect(
			db.execute(
				sql`insert into payday.owner (email, backup_id) select 'a@b.co', backup_id from payday.owner`
			)
		).rejects.toThrow();
	});

	it('indexes account(owner_id) and recovery_code(owner_id)', async () => {
		const db = await fresh();
		const names = rowsOf<{ indexname: string }>(
			await db.execute(sql`select indexname from pg_indexes where schemaname = 'payday'`)
		).map((r) => r.indexname);
		expect(names).toEqual(expect.arrayContaining(['account_owner', 'recovery_code_owner']));
	});
});
