/**
 * Loads the fictional demo household into the database at DATABASE_URL (default .pglite, the
 * development database).
 *
 *   pnpm seed            refuses if the account already has a schedule
 *   pnpm seed --force    adds the household anyway
 *
 * The development database belongs to one process at a time: stop `pnpm dev` first (register and
 * sign in beforehand, since the seed needs an owner), then start it again afterwards. A postgres://
 * DATABASE_URL has no such limit, but must already be migrated (`pnpm db:migrate`).
 *
 * Plain Node runs this file as it is (type stripping), so imports carry their .ts extension. It
 * refuses to run in production: the household is fictional and real data must never come from here.
 */
import { openDatabase } from '#lib/server/db/open.ts';
import { SeedRefused, seedHousehold } from '#lib/server/money/seed.ts';

const url = process.env.DATABASE_URL || '.pglite';
const force = process.argv.includes('--force');
const production = process.env.NODE_ENV === 'production';

// Refuse before opening anything, so a refusal never creates or migrates a database file.
if (production) {
	console.error('Refusing to seed: NODE_ENV is production. The seed is fictional data.');
	process.exit(1);
}

const { db, close } = await openDatabase(url);
try {
	const done = await seedHousehold(db, { production, force });
	console.log(
		`Seeded ${done.items} items, ${done.overrides} overrides and ${done.loans} loans into ${url}.`
	);
} catch (error) {
	if (error instanceof SeedRefused) {
		console.error(error.message);
		process.exitCode = 1;
	} else {
		throw error;
	}
} finally {
	await close();
}
