/* eslint-disable @typescript-eslint/no-explicit-any -- the app's modules are loaded through Vite at run time, so there are no types to name */
/**
 * Checks, before it goes live, that migration 0006 leaves a real backup's budget exactly as it was.
 * Run it by hand, on your own computer, with a backup file you downloaded from Settings > Backup:
 *
 * From app/ (it reads the migrations in app/drizzle):
 *
 *   node scripts/check-owner-migration.ts <path to payday-backup-....json>
 *
 * It restores the file into a throwaway in-memory database migrated only as far as 0005, notes every
 * row, applies 0006, and notes them again. Then it compares the figures the app computes (the
 * safe-to-spend number, the plan, loans, check-ins, marks, passkeys, the full export) with a second
 * throwaway database that was migrated to the end first. It never touches DATABASE_URL, .pglite or
 * a real database, and never writes anything outside the system's temp folder, which it empties.
 *
 * It prints only "matched" or "CHANGED" for each figure and how many rows each table holds. It
 * never prints a name, an amount, a date or any other part of your data. Exit 0 when everything
 * matched, 1 when something changed or the file would not restore, 2 when it could not run.
 *
 * Plain Node runs this file (type stripping). The app's own code uses TypeScript that stripping
 * cannot read, so it is loaded through Vite, which is already installed for the app.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const file = process.argv[2];
if (!file) {
	console.error('Usage, from app/: node scripts/check-owner-migration.ts <path to a backup file>');
	process.exit(2);
}
let text: string;
try {
	text = readFileSync(resolve(file), 'utf8');
} catch {
	console.error('Could not read that file.');
	process.exit(2);
}

const MIGRATIONS = resolve('drizzle');
const NOW = new Date();
const tmp = mkdtempSync(join(tmpdir(), 'payday-owner-check-'));
const server = await createServer({
	configFile: false,
	logLevel: 'silent',
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	optimizeDeps: { noDiscovery: true, include: [] }
});

let failed = false;
const report = (label: string, same: boolean, extra = '') => {
	if (!same) failed = true;
	console.log(`${same ? 'matched' : 'CHANGED'}  ${label}${extra}`);
};

try {
	const load = (path: string) => server.ssrLoadModule(path) as Promise<Record<string, any>>;
	const { openDatabase, rowsOf } = await load('/src/lib/server/db/open.ts');
	const { restoreBackup, exportBackup } = await load('/src/lib/server/money/fullBackup.ts');
	const { computeSafe } = await load('/src/lib/server/money/home.ts');
	const { listLoans } = await load('/src/lib/server/money/loans.ts');
	const { listFinished } = await load('/src/lib/server/money/checkin.ts');
	const { listPasskeys, addPasskey } = await load('/src/lib/server/auth/passkeys.ts');
	const { insertRecoveryCodes } = await load('/src/lib/server/auth/recovery.ts');
	const { paidMark } = await load('/src/lib/server/db/schema.ts');
	const { sql } = await import('drizzle-orm');
	const { migrate } = await import('drizzle-orm/pglite/migrator');

	// The migrations up to 0005, as they stood before this phase.
	const to0005 = join(tmp, 'migrations');
	cpSync(MIGRATIONS, to0005, { recursive: true });
	rmSync(join(to0005, '0006_owner_columns.sql'));
	const journalFile = join(to0005, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalFile, 'utf8'));
	journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 5);
	writeFileSync(journalFile, JSON.stringify(journal));

	const closers: Array<() => Promise<void>> = [];
	const open = async (migrationsFolder: string) => {
		const one = await openDatabase('memory://', { migrationsFolder });
		closers.push(one.close);
		return one.db;
	};

	/** Owner 1 as registerOwner makes it (raw SQL: the new columns may not exist yet), then the file. */
	const moveIn = async (db: any) => {
		await db.execute(sql`insert into payday.owner (id) values (1)`);
		const restored = await restoreBackup(db, 1, text);
		await addPasskey(db, 1, {
			id: 'check-passkey',
			publicKey: new Uint8Array([1, 2, 3]),
			counter: 0,
			nickname: 'Check'
		});
		await insertRecoveryCodes(db, 1, NOW);
		return restored;
	};

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
	const rawRows = async (db: any) => {
		const out: Record<string, { rows: string; count: number }> = {};
		for (const table of TABLES) {
			const [row] = rowsOf(
				await db.execute(
					sql.raw(
						`select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]')::text as rows, count(*)::int as n from payday.${table} t`
					)
				)
			) as Array<{ rows: string; n: number }>;
			out[table] = { rows: row.rows, count: row.n };
		}
		const [own] = rowsOf(
			await db.execute(
				sql`select to_jsonb(o)::text as row from (select id, password_hash, currency, time_zone, setup_step, reminder_time, last_backup_at, created_at from payday.owner) o`
			)
		) as Array<{ row: string }>;
		out.owner = { rows: own.row, count: 1 };
		return out;
	};

	const figures = async (db: any) => ({
		'safe-to-spend number and plan': await computeSafe(db, 1, NOW),
		loans: await listLoans(db, 1),
		'check-in history': await listFinished(db, 1),
		'paid marks': await db.select().from(paidMark),
		passkeys: (await listPasskeys(db, 1)).map((p: Record<string, unknown>) => ({
			...p,
			createdAt: undefined
		})),
		'full export': { ...(await exportBackup(db, 1, NOW)), exportedAt: '' }
	});

	const db = await open(to0005);
	let restored: { items: number; checkIns: number; loans: number; expenses: number };
	try {
		restored = await moveIn(db);
	} catch {
		console.error('The file would not restore. Is it a Payday backup (version 1 or 2)?');
		process.exitCode = 1;
		throw new Error('stop');
	}
	console.log(
		`restored: ${restored.items} schedule items, ${restored.checkIns} check-ins, ${restored.loans} loans, ${restored.expenses} expenses`
	);

	const rowsBefore = await rawRows(db);
	await migrate(db, { migrationsFolder: MIGRATIONS });
	const rowsAfter = await rawRows(db);
	for (const table of [...TABLES, 'owner']) {
		const b = rowsBefore[table]!;
		const a = rowsAfter[table]!;
		report(`table ${table}`, b.rows === a.rows, `  (${b.count} rows before, ${a.count} after)`);
	}

	// The reference database was migrated to the end first and restored the same way.
	const referenceDb = await open(MIGRATIONS);
	await moveIn(referenceDb);
	const expected = await figures(referenceDb);
	const after = await figures(db);
	for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
		report(`figure ${key}`, JSON.stringify(expected[key]) === JSON.stringify(after[key]));
	}

	const [mine] = rowsOf(
		await db.execute(
			sql`select (email is null) as no_email, (webauthn_user_id = convert_to('payday-owner', 'UTF8')) as handle, (backup_id is not null) as has_backup_id from payday.owner where id = 1`
		)
	) as Array<{ no_email: boolean; handle: boolean; has_backup_id: boolean }>;
	report('owner 1 keeps the passkey handle', mine?.handle === true);
	report('owner 1 has a backup id', mine?.has_backup_id === true);
	const [next] = rowsOf(
		await db.execute(
			sql`insert into payday.owner (email) values ('check@example.invalid') returning id`
		)
	) as Array<{ id: number }>;
	report('the next sign-up gets id 2', next?.id === 2);

	await Promise.all(closers.map((close) => close()));
	console.log(failed ? 'Something changed. Do not deploy.' : 'Everything matched.');
	process.exitCode = failed ? 1 : 0;
} catch {
	if (process.exitCode === undefined) {
		// The error text of a failed query can quote a value: print where, not what.
		console.error('The check could not run.');
		process.exitCode = 2;
	}
} finally {
	await server.close();
	rmSync(tmp, { recursive: true, force: true });
}
