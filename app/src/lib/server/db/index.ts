import { dev } from '$app/env';
import { DATABASE_CA_CERT_PATH, DATABASE_URL } from '$app/env/private';
import { openDatabase, type Db, type Opened } from './open.ts';

/** Where a fresh clone's data lives when `pnpm dev` runs with no DATABASE_URL (git-ignored). */
export const DEV_DATABASE = '.pglite';

// On globalThis so the dev server's module reloads reuse the one open database: a second PGlite on
// the same directory would corrupt it.
const holder = globalThis as { __paydayDb?: Promise<Opened> };

/** The one connection for this process, opened on first use (and migrated, when it is in-process). */
export function getDb(): Promise<Db> {
	// A fresh clone runs `pnpm dev` with no .env. Production gets no default: a guessed address
	// would put the data somewhere nobody chose.
	const url = DATABASE_URL ?? (dev ? DEV_DATABASE : undefined);
	if (!url)
		return Promise.reject(new Error('DATABASE_URL is not set: refusing to guess where data lives'));
	holder.__paydayDb ??= openDatabase(url, {
		allowInsecure: dev,
		caCertPath: DATABASE_CA_CERT_PATH
	}).catch((error) => {
		// Let the next call try again rather than caching a failure for the life of the process.
		holder.__paydayDb = undefined;
		throw error;
	});
	return holder.__paydayDb.then((opened) => opened.db);
}
