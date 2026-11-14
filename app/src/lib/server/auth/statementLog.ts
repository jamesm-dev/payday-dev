/**
 * Test-only: an in-memory database that records every statement it is sent. PGlite runs one
 * statement at a time, so a test cannot make two requests truly race; what it CAN show is that a
 * check-and-count is ONE statement (or a row lock before the read), which is what makes the race
 * impossible on a real Postgres. The same approach as db/lockOrder.test.ts.
 */
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { openDatabase, type Db, type Opened } from '#lib/server/db/open.ts';
import { emptyAllTables } from '#lib/server/db/testing.ts';

export function loggedDatabase() {
	const queries: string[] = [];
	const state = {} as { opened: Opened; db: Db };

	beforeAll(async () => {
		state.opened = await openDatabase('memory://', {
			logger: { logQuery: (query) => void queries.push(query) }
		});
		state.db = state.opened.db;
	}, 120_000);
	afterAll(() => state.opened.close());
	beforeEach(async () => {
		await emptyAllTables(state.db);
	});

	return {
		get db() {
			return state.db;
		},
		/** The statements `run` sends, in order. */
		async statements(run: () => Promise<unknown>): Promise<string[]> {
			queries.length = 0;
			await run();
			return [...queries];
		}
	};
}
