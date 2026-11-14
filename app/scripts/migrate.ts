/**
 * Applies the checked-in migrations in drizzle/ to the Postgres at DATABASE_MIGRATION_URL (the
 * Supabase session pooler), or at DATABASE_URL when that is not set.
 *
 *   pnpm db:migrate
 *
 * The deploy's build runs this before the new version goes live (ADR-0015): a failed migration
 * exits non-zero and fails the deploy, so the old version keeps serving. A request never migrates.
 * It only ever runs migrations that are checked in; `drizzle-kit push` stays forbidden.
 *
 * Plain Node runs this file as it is (type stripping), so imports carry their .ts extension.
 */
import { chooseMigrationUrl } from '#lib/server/db/migrationUrl.ts';
import { migratePostgresUrl } from '#lib/server/db/open.ts';

const target = chooseMigrationUrl(process.env);

if (!target.ok) {
	console.error(target.message);
	process.exit(1);
}

try {
	console.log(`Migrating the database named by ${target.source}...`);
	await migratePostgresUrl(target.url, {
		// Only an explicit development run may ask for a connection without TLS.
		allowInsecure: process.env.NODE_ENV === 'development',
		caCertPath: process.env.DATABASE_CA_CERT_PATH || undefined
	});
	console.log('Migrations applied.');
} catch (error) {
	console.error('Migration failed:', error instanceof Error ? error.message : error);
	process.exit(1);
}
