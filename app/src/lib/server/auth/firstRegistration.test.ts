import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';

vi.mock('$app/env', () => ({ dev: false }));
vi.mock('$app/env/private', () => ({ OWNER_SETUP_CODE: 'the-real-code' }));

import { refuseFirstRegistration } from './firstRegistration.ts';

let db: Db;
beforeEach(async () => {
	db = await freshDb();
});

describe('TSK-E31665 the setup-code limit is charged before the code is checked', () => {
	it('lets only ten of twelve parallel wrong codes be checked; the rest get the 429', async () => {
		const results = await Promise.all(
			Array.from({ length: 12 }, () => refuseFirstRegistration(db, 'wrong code', '198.51.100.1'))
		);
		expect(results.filter((r) => r?.status === 403)).toHaveLength(10); // checked, and wrong
		const limited = results.filter((r) => r?.status === 429);
		expect(limited).toHaveLength(2);
		expect(limited[0]!.message).toBe('Too many tries. Wait a minute, then try again.');
	});

	it('does not charge the right code, nor a missing one', async () => {
		for (let i = 0; i < 15; i++) {
			expect(await refuseFirstRegistration(db, 'the-real-code', '198.51.100.2')).toBeNull();
		}
		for (let i = 0; i < 15; i++) {
			expect((await refuseFirstRegistration(db, '', '198.51.100.3'))?.status).toBe(403);
		}
	});

	it('counts only wrong codes, so a right one still works after a few wrong ones', async () => {
		for (let i = 0; i < 3; i++) await refuseFirstRegistration(db, 'nope', '198.51.100.4');
		expect(await refuseFirstRegistration(db, 'the-real-code', '198.51.100.4')).toBeNull();
	});
});
