/* TSK-342C1F "Paid early" forms belong to the home screen only: setup's all-set screen has no `paid` action. */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner } from '#lib/server/db/schema.ts';
import { buildHome } from '#lib/server/money/home.ts';
import { markPaidEarlyFromHome } from '#lib/server/money/homeMark.ts';
import { seedHousehold } from '#lib/server/money/seed.ts';
import { setBalance } from '#lib/server/money/store.ts';
import HomeNumber from './HomeNumber.svelte';

const T0 = new Date('2026-10-16T12:00:00Z');

describe('TSK-342C1F HomeNumber draws Paid early only when asked to', () => {
	it('has no paid form or help line without `marking` (setup), and has them with it (home)', async () => {
		const db = await freshDb();
		await db.insert(owner).values({ id: 1 });
		await seedHousehold(db, { production: false, now: T0, loans: false });
		await setBalance(db, 1, minor(150000), d('2026-10-02'), new Date('2026-10-02T09:00:00Z'));
		const first = await buildHome(db, 1, T0);
		if (first.state !== 'ready') throw new Error(first.state);
		await markPaidEarlyFromHome(
			db,
			1,
			{ itemId: '4', originalDate: '2026-10-28', paid: 'yes' },
			T0
		);
		const view = await buildHome(db, 1, T0);
		if (view.state !== 'ready') throw new Error(view.state);

		const plain = render(HomeNumber, { props: { view } }).body;
		expect(plain).not.toContain('?/paid');
		expect(plain).not.toContain('Paid early</button');
		expect(plain).not.toContain('Tap Paid early');
		expect(plain).toContain('Paid early on');

		const home = render(HomeNumber, { props: { view, marking: true } }).body;
		expect(home).toContain('action="?/paid"');
		expect(home).toContain('Tap Paid early');
		expect(home).toContain('Undo paid early');
	});
});
