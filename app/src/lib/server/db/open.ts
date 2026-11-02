import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.ts';

export type Db = ReturnType<typeof open>;

/**
 * Opens the database and brings its schema up to date.
 *
 * Migrations run here, at server start, rather than in a deploy step: on Fly.io the release
 * command runs on a temporary machine without the volume, so it would migrate the wrong file.
 */
export function open(url: string, migrationsFolder = 'drizzle') {
	const client = new Database(url);
	// Litestream replicates from the write-ahead log, so WAL mode is required, not a tuning choice.
	client.pragma('journal_mode = WAL');
	client.pragma('busy_timeout = 5000');
	client.pragma('foreign_keys = ON');

	const db = drizzle(client, { schema });
	migrate(db, { migrationsFolder });
	return db;
}
