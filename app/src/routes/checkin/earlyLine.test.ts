/*
 * TSK-C00C8A. A payment paid early is shown on the payments step with "Yes, paid" chosen. When the
 * form comes back with an error, a chosen "No, it did not go out" must come back chosen: the page
 * may not quietly undo the owner's answer. A browser test cannot reach this line (a mark made now is
 * never early inside the update's window), so the page is rendered on the server with the data the
 * load and the failed action give it. Phone (due Oct 15) was paid on Oct 10; the update is Oct 16.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { owner } from '#lib/server/db/schema.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import {
	acknowledgeSpending,
	saveBalanceStep,
	savePay,
	startCheckIn
} from '#lib/server/money/checkin.ts';
import { presentCheckIn } from '#lib/server/money/checkinView.ts';
import { seedHousehold } from '#lib/server/money/seed.ts';
import { setBalance, setPaidMark } from '#lib/server/money/store.ts';
import Page from './+page.svelte';

const T0 = new Date('2026-10-16T12:00:00Z');
const KEY = '3|2026-10-15';

async function paymentsView() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T0, loans: false });
	await setBalance(db, 1, minor(150000), d('2026-10-02'), new Date('2026-10-02T12:00:00Z'));
	await setPaidMark(db, 1, 3, d('2026-10-15'), true, new Date('2026-10-10T09:00:00Z'));
	const row = await startCheckIn(db, 1, T0);
	await savePay(db, 1, row.id, { landed: true, amount: minor(185000) });
	await saveBalanceStep(db, 1, row.id, T0, minor(300000));
	await acknowledgeSpending(db, 1, row.id);
	const view = await presentCheckIn(db, 1, T0);
	if (!view || view.step !== 'payments') throw new Error('not at the payments step');
	return view;
}

/** The two radios of the early line, as [value, checked]. */
function radios(html: string): [string, boolean][] {
	const early = html.slice(html.indexOf('data-testid="payment-early"'));
	const fieldset = early.slice(0, early.indexOf('</fieldset>'));
	return [...fieldset.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map(([tag]) => [
		/value="(\w+)"/.exec(tag)![1],
		/\bchecked\b/.test(tag)
	]);
}

describe('TSK-C00C8A an early line keeps the answer the owner chose when the form comes back', () => {
	it('is "Yes, paid" to start with', async () => {
		const view = await paymentsView();
		expect(view.early).toHaveLength(1);
		const html = render(Page, { props: { data: { view }, form: null } as never }).body;
		expect(radios(html)).toEqual([
			['paid', true],
			['missed', false]
		]);
	});

	it('keeps "No, it did not go out" after an error elsewhere on the step', async () => {
		const view = await paymentsView();
		const form = {
			step: 'payments',
			values: { [KEY]: 'missed' },
			problems: { 'status:9|2026-10-20': 'Say if this one is paid.' }
		};
		const html = render(Page, { props: { data: { view }, form } as never }).body;
		expect(radios(html)).toEqual([
			['paid', false],
			['missed', true]
		]);
	});
});
