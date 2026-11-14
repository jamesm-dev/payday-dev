import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { expand, type Item } from '#lib/domain/schedule.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { owner, scheduleItem } from '#lib/server/db/schema.ts';
import {
	addItem,
	ensureAccount,
	getBalance,
	getItem,
	getOwner,
	itemToRow,
	listItems,
	listOverrides,
	loadPlan,
	overrideToRow,
	ownerToday,
	removeOverride,
	rowToItem,
	rowToOverride,
	saveRegion,
	setBalance,
	setItemEnd,
	setOverride,
	setSetupStep,
	updateItem
} from './store.ts';

async function fresh() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	return db;
}

const rent: Omit<Item, 'id'> = {
	kind: 'bill',
	name: 'Rent',
	amount: minor(120000),
	rule: { kind: 'monthly', day: 31 },
	startsOn: d('2026-01-01')
};

describe('TSK-55D1DC rows map to the domain and back', () => {
	const rules: Omit<Item, 'id'>['rule'][] = [
		{ kind: 'every14', anchor: d('2026-01-09') },
		{ kind: 'monthly', day: 29 },
		{ kind: 'quarterly', anchor: d('2026-01-31') },
		{ kind: 'yearly', anchor: d('2026-09-30') }
	];

	for (const rule of rules) {
		it(`round-trips a ${rule.kind} item through the database`, async () => {
			const db = await fresh();
			const saved = await addItem(db, 1, { ...rent, rule, endsOn: d('2027-01-01') });
			expect(saved).toMatchObject({ rule, amount: 120000, endsOn: '2027-01-01', name: 'Rent' });
			expect(await getItem(db, 1, Number(saved.id))).toEqual(saved);
			expect(await listItems(db, 1)).toEqual([saved]);
		});
	}

	it('stores money as the integer it is, and a monthly rule as a day, not an anchor', async () => {
		const db = await fresh();
		await addItem(db, 1, rent);
		const row = (await db.select().from(scheduleItem))[0]!;
		expect(row).toMatchObject({ amountMinor: 120000, ruleKind: 'monthly', ruleDay: 31 });
		expect(row.ruleAnchor).toBeNull();
		expect(itemToRow(rent).endsOn).toBeNull();
	});

	const base = {
		id: 1,
		accountId: 1,
		kind: 'bill',
		name: 'X',
		amountMinor: 100,
		ruleKind: 'monthly',
		ruleAnchor: null,
		ruleDay: 5,
		startsOn: '2026-01-01',
		endsOn: null,
		groupName: null,
		optional: false,
		createdAt: '',
		updatedAt: ''
	};

	it('refuses a row it cannot map, instead of guessing', () => {
		expect(rowToItem(base).rule).toEqual({ kind: 'monthly', day: 5 });
		expect(() => rowToItem({ ...base, kind: 'gift' })).toThrow(/kind/);
		expect(() => rowToItem({ ...base, ruleKind: 'weekly' })).toThrow(/rule/);
		expect(() => rowToItem({ ...base, ruleDay: 0 })).toThrow(/day/);
		expect(() => rowToItem({ ...base, ruleDay: 32 })).toThrow(/day/);
		expect(() => rowToItem({ ...base, ruleDay: null })).toThrow(/day/);
		expect(() => rowToItem({ ...base, ruleKind: 'yearly' })).toThrow(/anchor/);
		expect(() => rowToItem({ ...base, startsOn: '01/02/2026' })).toThrow();
		expect(() => rowToItem({ ...base, amountMinor: 1.5 })).toThrow();
		expect(() => rowToItem({ ...base, endsOn: '2025-12-31' })).toThrow(/before it starts/);
	});

	it('edits an item in place and keeps its id', async () => {
		const db = await fresh();
		const saved = await addItem(db, 1, rent);
		await updateItem(db, 1, Number(saved.id), {
			...rent,
			name: 'Rent and parking',
			amount: minor(125000)
		});
		expect(await listItems(db, 1)).toEqual([
			{ ...saved, name: 'Rent and parking', amount: 125000 }
		]);
	});

	it('ends an item without deleting it, refuses an end before the start, and can bring it back', async () => {
		const db = await fresh();
		const saved = await addItem(db, 1, rent);
		const id = Number(saved.id);
		expect(await setItemEnd(db, 1, id, d('2026-06-30'))).toBe(true);
		expect(await listItems(db, 1)).toHaveLength(1);
		expect((await getItem(db, 1, id))?.endsOn).toBe('2026-06-30');
		expect(expand(await listItems(db, 1), [], d('2026-01-01'), d('2026-12-31')).length).toBe(6);
		await expect(setItemEnd(db, 1, id, d('2025-12-31'))).rejects.toThrow(RangeError);
		await setItemEnd(db, 1, id, null);
		expect((await getItem(db, 1, id))?.endsOn).toBeUndefined();
		expect(await setItemEnd(db, 1, 999, null)).toBe(false);
	});
});

describe('TSK-92B79F an occurrence is skipped or changed without touching its rule', () => {
	it('maps override rows both ways', () => {
		expect(
			rowToOverride({
				id: 1,
				itemId: 7,
				originalDate: '2026-03-15',
				action: 'skip',
				newDate: null,
				newAmountMinor: null,
				createdAt: ''
			})
		).toEqual({ itemId: '7', originalDate: '2026-03-15', action: 'skip' });
		expect(
			rowToOverride({
				id: 2,
				itemId: 7,
				originalDate: '2026-05-28',
				action: 'change',
				newDate: '2026-05-26',
				newAmountMinor: 7250,
				createdAt: ''
			})
		).toEqual({
			itemId: '7',
			originalDate: '2026-05-28',
			action: 'change',
			date: '2026-05-26',
			amount: 7250
		});
		expect(() =>
			rowToOverride({
				id: 3,
				itemId: 7,
				originalDate: '2026-05-28',
				action: 'delete',
				newDate: null,
				newAmountMinor: null,
				createdAt: ''
			})
		).toThrow(/action/);
		expect(
			overrideToRow(7, { action: 'change', originalDate: d('2026-05-28'), amount: minor(5) })
		).toMatchObject({ newDate: null, newAmountMinor: 5 });
	});

	it('skip, change, replace and undo, and the engine sees each one', async () => {
		const db = await fresh();
		const item = await addItem(db, 1, rent);
		const id = Number(item.id);
		const dates = async () =>
			expand(
				await listItems(db, 1),
				await listOverrides(db, 1),
				d('2026-03-01'),
				d('2026-03-31')
			).map((o) => `${o.date} ${o.amount}`);
		expect(await dates()).toEqual(['2026-03-31 120000']);

		await setOverride(db, 1, id, { action: 'skip', originalDate: d('2026-03-31') });
		expect(await dates()).toEqual([]);

		await setOverride(db, 1, id, {
			action: 'change',
			originalDate: d('2026-03-31'),
			date: d('2026-03-28'),
			amount: minor(130000)
		});
		expect(await listOverrides(db, 1)).toHaveLength(1);
		expect(await dates()).toEqual(['2026-03-28 130000']);

		expect(await removeOverride(db, 1, id, d('2026-03-31'))).toBe(true);
		expect(await removeOverride(db, 1, id, d('2026-03-31'))).toBe(false);
		expect(await dates()).toEqual(['2026-03-31 120000']);
		// The rule itself was never touched.
		expect(await getItem(db, 1, id)).toEqual(item);
	});

	it('will not override an item that does not exist', async () => {
		const db = await fresh();
		await expect(
			setOverride(db, 1, 42, { action: 'skip', originalDate: d('2026-03-31') })
		).rejects.toThrow();
		expect(await removeOverride(db, 1, 42, d('2026-03-31'))).toBe(false);
	});
});

describe('TSK-4BCCC7 the owner, the account and the balance', () => {
	it('creates the one account once, with no balance until one is set', async () => {
		const db = await fresh();
		const a = await ensureAccount(db, 1);
		expect((await ensureAccount(db, 1)).id).toBe(a.id);
		expect(await getBalance(db, 1)).toBeNull();
		await setBalance(db, 1, minor(-5000), d('2026-10-31'));
		expect(await getBalance(db, 1)).toEqual({ amount: -5000, asOf: '2026-10-31' });
		await setBalance(db, 1, minor(230000), d('2026-11-01'));
		expect(await getBalance(db, 1)).toEqual({ amount: 230000, asOf: '2026-11-01' });
	});

	it('reads and writes currency, time zone and the setup step', async () => {
		const db = await fresh();
		expect(await getOwner(db, 1)).toEqual({ currency: null, timeZone: null, setupStep: 'welcome' });
		await saveRegion(db, 1, 'EUR', 'Europe/Berlin');
		await setSetupStep(db, 1, 'pay');
		expect(await getOwner(db, 1)).toEqual({
			currency: 'EUR',
			timeZone: 'Europe/Berlin',
			setupStep: 'pay'
		});
		await setSetupStep(db, 1, null);
		expect((await getOwner(db, 1)).setupStep).toBeNull();
		await expect(getOwner(db, 2)).rejects.toThrow();
	});

	it('refuses a setup step it does not know', async () => {
		const db = await fresh();
		await db.update(owner).set({ setupStep: 'bogus' }).where(eq(owner.id, 1));
		await expect(getOwner(db, 1)).rejects.toThrow(/setup step/);
	});

	it('works out today in the owner time zone, not the server zone', () => {
		const now = new Date('2026-11-01T02:30:00Z');
		expect(ownerToday({ currency: null, timeZone: 'America/New_York', setupStep: null }, now)).toBe(
			'2026-10-31'
		);
		expect(ownerToday({ currency: null, timeZone: 'Pacific/Auckland', setupStep: null }, now)).toBe(
			'2026-11-01'
		);
		expect(ownerToday({ currency: null, timeZone: null, setupStep: null }, now)).toBe('2026-11-01');
	});

	it('loads everything the number needs in one read', async () => {
		const db = await fresh();
		await saveRegion(db, 1, 'USD', 'UTC');
		const item = await addItem(db, 1, rent);
		await setBalance(db, 1, minor(100), d('2026-10-30'));
		await setOverride(db, 1, Number(item.id), { action: 'skip', originalDate: d('2026-03-31') });
		const plan = await loadPlan(db, 1, new Date('2026-10-31T12:00:00Z'));
		expect(plan.today).toBe('2026-10-31');
		expect(plan.balance).toEqual({ amount: 100, asOf: '2026-10-30' });
		expect(plan.items).toEqual([item]);
		expect(plan.overrides).toHaveLength(1);
	});
});
