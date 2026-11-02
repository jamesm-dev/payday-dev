import { dev } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import { open, type Db } from './open';

let db: Db | undefined;

/** The one connection for this process, opened and migrated on first use. */
export function getDb(): Db {
	// A fresh clone runs `pnpm dev` with no .env. Production gets no default: a guessed path would
	// put the data somewhere a deploy erases.
	const url = DATABASE_URL ?? (dev ? 'local.db' : undefined);
	if (!url) throw new Error('DATABASE_URL is not set: refusing to guess where data lives');
	db ??= open(url);
	return db;
}
