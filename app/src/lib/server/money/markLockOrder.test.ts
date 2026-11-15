/*
 * TSK-7642D5. "Paid early" and "Skip" on the same payment must not both save: the skip's check
 * reads the marks and then writes the skip, so both writers queue on the owner lock and each does
 * its reading and writing inside one transaction. PGlite runs one statement at a time, so a race
 * cannot show directly (see db/lockOrder.test.ts); what shows is the order of the statements: the
 * lock first, then every read of the marks and overrides, then the write.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { openDatabase, type Db, type Opened } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { emptyAllTables } from '#lib/server/db/testing.ts';
import { seedHousehold } from './seed.ts';
import { setBalance, setOverride, setPaidMark } from './store.ts';

const NOW = new Date('2026-10-16T12:00:00Z');
const queries: string[] = [];
let opened: Opened;
let db: Db;

beforeAll(async () => {
	opened = await openDatabase('memory://', {
		logger: { logQuery: (query) => void queries.push(query) }
	});
	db = opened.db;
	await emptyAllTables(db);
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: NOW, loans: false });
	await setBalance(db, 1, minor(150000), d('2026-10-02'), new Date('2026-10-02T12:00:00Z'));
}, 120_000);
afterAll(() => opened.close());

async function statements(run: () => Promise<unknown>): Promise<string[]> {
	queries.length = 0;
	await run();
	return [...queries];
}

const LOCK = /from "payday"\."owner".*for update/i;

function expectLockedFirst(seen: string[]) {
	const text = `\n${seen.join('\n')}`;
	const lock = seen.findIndex((q) => LOCK.test(q));
	expect(lock, `no owner lock in:${text}`).toBeGreaterThanOrEqual(0);
	const touching = seen.findIndex((q) =>
		/^(insert|update|delete)\b|from "payday"\."(paid_mark|occurrence_override|schedule_item)"/i.test(
			q
		)
	);
	expect(touching, `nothing touched the plan in:${text}`).toBeGreaterThanOrEqual(0);
	expect(lock, `locked late in:${text}`).toBeLessThan(touching);
}

describe('TSK-7642D5 marking paid and skipping queue on the owner lock', () => {
	it('"Paid early" locks before it reads or writes anything', async () => {
		expectLockedFirst(await statements(() => setPaidMark(db, 1, 2, d('2026-11-01'), true, NOW)));
	});

	it('"Skip" checks the marks and writes the skip under the same lock, in one transaction', async () => {
		const seen = await statements(() =>
			setOverride(db, 1, 3, { action: 'skip', originalDate: d('2026-11-15') })
		);
		expectLockedFirst(seen);
		const lock = seen.findIndex((q) => LOCK.test(q));
		const readMarks = seen.findIndex((q) => /from "payday"\."paid_mark"/i.test(q));
		const write = seen.findIndex((q) => /^insert into "payday"\."occurrence_override"/i.test(q));
		expect(readMarks).toBeGreaterThan(lock);
		expect(write).toBeGreaterThan(readMarks);
	});
});
