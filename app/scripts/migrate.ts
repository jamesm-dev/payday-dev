/**
 * Applies the checked-in migrations in drizzle/ to the Postgres at DATABASE_URL.
 *
 *   pnpm db:migrate
 *
 * The deploy's build runs this before the new version goes live (ADR-0015): a failed migration
 * exits non-zero and fails the deploy, so the old version keeps serving. A request never migrates.
 * It only ever runs migrations that are checked in; `drizzle-kit push` stays forbidden.
 *
 * Plain Node runs this file as it is (type stripping), so imports carry their .ts extension.
 */
import { isPostgresUrl, migratePostgresUrl } from '#lib/server/db/open.ts';

const url = process.env.DATABASE_URL;

if (!url || !isPostgresUrl(url)) {
	console.error(
		'Refusing to migrate: DATABASE_URL must be a postgres:// or postgresql:// address. ' +
			'(Local and test databases migrate themselves when they open.)'
	);
	process.exit(1);
}

try {
	await migratePostgresUrl(url, {
		// Only an explicit development run may ask for a connection without TLS.
		allowInsecure: process.env.NODE_ENV === 'development',
		caCertPath: process.env.DATABASE_CA_CERT_PATH || undefined
	});
	console.log('Migrations applied.');
} catch (error) {
	console.error('Migration failed:', error instanceof Error ? error.message : error);
	process.exit(1);
}
