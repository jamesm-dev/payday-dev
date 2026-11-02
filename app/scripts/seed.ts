/**
 * Loads the fictional demo household into the database at DATABASE_URL (default local.db).
 *
 *   pnpm seed            refuses if the account already has a schedule
 *   pnpm seed --force    adds the household anyway
 *
 * Plain Node runs this file as it is (type stripping), so imports carry their .ts extension. It
 * refuses to run in production: the household is fictional and real data must never come from here.
 */
import { open } from '#lib/server/db/open.ts';
import { SeedRefused, seedHousehold } from '#lib/server/money/seed.ts';

const url = process.env.DATABASE_URL || 'local.db';
const force = process.argv.includes('--force');
const production = process.env.NODE_ENV === 'production';

// Refuse before opening anything, so a refusal never creates or migrates a database file.
if (production) {
	console.error('Refusing to seed: NODE_ENV is production. The seed is fictional data.');
	process.exit(1);
}

const db = open(url);
try {
	const done = seedHousehold(db, { production, force });
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
	db.$client.close();
}
