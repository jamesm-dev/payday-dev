import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema.ts';
import { isSupabaseHost, SUPABASE_ROOT_2021_CA } from './supabaseRootCa.ts';

/**
 * The one database type the app sees. Both drivers (postgres-js in production, PGlite in
 * development and tests) are a `PgDatabase`, and so is a transaction handle, so a function that
 * takes a `Db` runs the same on all three.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** An open database and the way to let go of it. */
export type Opened = { db: Db; close: () => Promise<void> };

export const MIGRATIONS_FOLDER = 'drizzle';

/** The custom migration that takes the public data API's roles away from the app's schema. */
const REVOKE_MIGRATION = '0001_revoke_public_api.sql';

/** The checked-in revoke block: idempotent, and a no-op where `anon` and `authenticated` do not exist. */
const revokeSql = (folder: string) => readFileSync(join(folder, REVOKE_MIGRATION), 'utf8');

/**
 * Runs the revoke block again. Supabase grants every new table to `anon` and `authenticated` by
 * default, so a table a LATER migration adds would start out readable by them; applying the revoke
 * after every migration run closes that. `db:migrate` and the in-process open both call it.
 */
export async function revokePublicApi(db: Db, migrationsFolder = MIGRATIONS_FOLDER) {
	await db.execute(sql.raw(revokeSql(migrationsFolder)));
}

export type PostgresSsl = false | 'require' | 'prefer' | { rejectUnauthorized: true; ca?: string };

export type PostgresConnection = {
	url: string;
	options: {
		ssl: PostgresSsl;
		prepare: false;
		max: number;
		idle_timeout: number;
		connect_timeout: number;
	};
};

/**
 * What postgres-js needs for a `postgres://` address. Pure, so the mapping is testable.
 *
 * - TLS: an explicit `sslmode` in the URL is honoured; with none, `require` (postgres-js 3.4.9
 *   would otherwise connect in clear text). `disable`, `allow` and `prefer` are refused unless
 *   `allowInsecure` (development only), because they let the connection fall back to no TLS.
 * - `verify-ca` and `verify-full` verify the server's certificate against the system roots, or
 *   against `caCert` when one is given.
 * - CA: `caCert` (the text of a CA certificate, read once from `DATABASE_CA_CERT_PATH`) turns
 *   `require`, or no sslmode, into a verified connection against that CA. A Supabase host with no
 *   `caCert` gets Supabase's own root (`supabaseRootCa.ts`), so production is verified by default.
 * - Pooling for serverless: each function instance holds ONE connection (`max: 1`), lets it go
 *   after 20 idle seconds, and gives up connecting after 10, so many short-lived instances do not
 *   exhaust the database's connections. `prepare: false` because Supabase's transaction pooler
 *   does not support prepared statements.
 */
export function postgresConnection(
	rawUrl: string,
	{ allowInsecure = false, caCert }: { allowInsecure?: boolean; caCert?: string } = {}
): PostgresConnection {
	const url = new URL(rawUrl);
	const mode = url.searchParams.get('sslmode')?.toLowerCase() ?? null;
	// Handled here, so the driver's own reading of the parameter cannot disagree.
	url.searchParams.delete('sslmode');
	caCert ??= isSupabaseHost(url.hostname) ? SUPABASE_ROOT_2021_CA : undefined;

	let ssl: PostgresSsl;
	switch (mode) {
		case 'disable':
		case 'allow':
		case 'prefer':
			if (!allowInsecure) {
				throw new Error(
					`DATABASE_URL asks for sslmode=${mode}, which can fall back to an unencrypted connection. ` +
						'Use sslmode=require (or verify-full), or leave sslmode out: it defaults to require.'
				);
			}
			ssl = mode === 'disable' ? false : 'prefer';
			break;
		case 'verify-ca':
		case 'verify-full':
			ssl = { rejectUnauthorized: true, ...(caCert ? { ca: caCert } : {}) };
			break;
		case null:
		case 'require':
		case 'no-verify':
			ssl = caCert ? { rejectUnauthorized: true, ca: caCert } : 'require';
			break;
		default:
			throw new Error(`DATABASE_URL has an sslmode this app does not know: ${mode}.`);
	}

	return {
		url: url.toString(),
		options: { ssl, prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 }
	};
}

export type OpenOptions = {
	migrationsFolder?: string;
	/** Development only: lets a `postgres://` address ask for no TLS. */
	allowInsecure?: boolean;
	/** Path of a CA certificate to verify the server against (`DATABASE_CA_CERT_PATH`). */
	caCertPath?: string;
	/** Tests only: told of every statement an in-process database runs, in order. */
	logger?: { logQuery: (query: string, params: unknown[]) => void };
};

const readCa = (path: string | undefined) => (path ? readFileSync(path, 'utf8') : undefined);

/** `postgres://` and `postgresql://` name a real server: Supabase in production. */
export const isPostgresUrl = (url: string) => /^postgres(ql)?:\/\//i.test(url);

/**
 * Opens the database named by `url` (the `DATABASE_URL`):
 *
 * - `postgres://` or `postgresql://`: a real Postgres server through postgres-js. Nothing is
 *   migrated here (ADR-0015): the deploy's build runs `pnpm db:migrate`, and a request never does.
 * - `memory://`: an in-process PGlite that lives and dies with the process, migrated now.
 * - anything else: PGlite keeping its files in that directory, migrated now.
 *
 * PGlite is loaded only on the last two paths, through a dynamic import, so a production bundle
 * that only ever sees a `postgres://` URL never loads its WebAssembly.
 */
export async function openDatabase(url: string, opts: OpenOptions = {}): Promise<Opened> {
	const migrationsFolder = opts.migrationsFolder ?? MIGRATIONS_FOLDER;
	if (isPostgresUrl(url)) {
		const connection = postgresConnection(url, {
			allowInsecure: opts.allowInsecure,
			caCert: readCa(opts.caCertPath)
		});
		const client = postgres(connection.url, { ...connection.options, onnotice: () => {} });
		return { db: drizzlePostgres(client, { schema }), close: () => client.end() };
	}

	if (/\.(db|sqlite3?)$/i.test(url)) {
		throw new Error(
			`DATABASE_URL "${url}" looks like a SQLite file. Payday now keeps its data in Postgres: use ` +
				'a postgres:// address, memory://, or leave it empty in development for a local database. ' +
				'The SQLite file is left untouched.'
		);
	}

	const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
		import('@electric-sql/pglite'),
		import('drizzle-orm/pglite'),
		import('drizzle-orm/pglite/migrator')
	]);
	const inMemory = url === 'memory://' || url === ':memory:';
	// PGlite is one process's database: a second process on the same directory would corrupt it.
	const unlock = inMemory ? () => {} : lockDirectory(url);
	try {
		const client = new PGlite(inMemory ? undefined : url);
		await client.waitReady;
		const db = drizzle(client, { schema, logger: opts.logger });
		await migrate(db, { migrationsFolder });
		await client.exec(revokeSql(migrationsFolder));
		return {
			db,
			close: async () => {
				await client.close();
				unlock();
			}
		};
	} catch (error) {
		unlock();
		throw error;
	}
}

/**
 * Takes `<dir>.lock` for this process, or throws if another live process holds it. A lock left by
 * a process that has gone is taken over.
 */
function lockDirectory(dir: string): () => void {
	const file = `${dir}.lock`;
	if (existsSync(file)) {
		const pid = Number(readFileSync(file, 'utf8'));
		if (pid !== process.pid && Number.isInteger(pid) && pid > 0 && alive(pid)) {
			throw new Error(
				`The local database "${dir}" is in use by another process (pid ${pid}). Stop it first ` +
					'(for example `pnpm dev`): a local database belongs to one process at a time.'
			);
		}
	}
	writeFileSync(file, String(process.pid));
	const release = () => rmSync(file, { force: true });
	process.once('exit', release);
	return release;
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/** The first rows of a raw `db.execute` result, whichever driver ran it (PGlite wraps them in `rows`). */
export function rowsOf<T>(result: unknown): T[] {
	const rows = (result as { rows?: unknown }).rows;
	return (Array.isArray(rows) ? rows : (result as T[])) as T[];
}

/**
 * Runs the checked-in migrations on a postgres-js connection. Used by `pnpm db:migrate`, which the
 * deploy's build calls; never by a request.
 */
export async function migratePostgresUrl(url: string, opts: OpenOptions = {}) {
	const migrationsFolder = opts.migrationsFolder ?? MIGRATIONS_FOLDER;
	const connection = postgresConnection(url, {
		allowInsecure: opts.allowInsecure,
		caCert: readCa(opts.caCertPath)
	});
	const client = postgres(connection.url, { ...connection.options, onnotice: () => {} });
	try {
		await migratePostgres(drizzlePostgres(client, { schema }), { migrationsFolder });
		// Every migration run, not only a new one: see revokePublicApi.
		await client.unsafe(revokeSql(migrationsFolder));
	} finally {
		await client.end();
	}
}
