import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureItems, fixtureOverrides } from '#lib/domain/fixture.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { openDatabase } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { buildHome } from './home.ts';
import { listLoans } from './loans.ts';
import { SeedRefused, seedHousehold } from './seed.ts';
import { getOwner, listItems, listOverrides, setSetupStep } from './store.ts';

const NOW = new Date('2026-10-31T12:00:00Z');

async function fresh() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	return db;
}

describe('TSK-4BCD15 the seed loads the fictional household', () => {
	it('loads every fixture item and override, finishes setup and shows a number', async () => {
		const db = await fresh();
		const done = await seedHousehold(db, { production: false, now: NOW });
		expect(done).toEqual({
			items: fixtureItems.length + 2,
			overrides: fixtureOverrides.length,
			loans: 4
		});
		// The fixture's own items first, then the two loan payments the seed adds for its loans.
		expect((await listItems(db, 1)).map((i) => i.name)).toEqual([
			...fixtureItems.map((i) => i.name),
			'Car loan payment',
			'Paying back Dad'
		]);
		expect(await listOverrides(db, 1)).toHaveLength(fixtureOverrides.length);
		expect(await getOwner(db, 1)).toEqual({ currency: 'USD', timeZone: 'UTC', setupStep: null });
		const home = await buildHome(db, 1, NOW);
		expect(home.state).toBe('ready');
	});

	it('TSK-A641F9 loads a loan of each kind, the card and the laptop plan on the fixture payments', async () => {
		const db = await fresh();
		await seedHousehold(db, { production: false, now: NOW });
		const loans = await listLoans(db, 1);
		expect(loans.map((l) => l.type)).toEqual(['credit-card', 'instalment', 'bnpl', 'informal']);
		const items = await listItems(db, 1);
		const nameOf = (id: string | null) => items.find((i) => i.id === id)?.name;
		expect(loans.map((l) => nameOf(l.scheduleItemId))).toEqual([
			'Credit card minimum',
			'Car loan payment',
			'Laptop instalment',
			'Paying back Dad'
		]);
		expect(loans.every((l) => l.rateBp !== null)).toBe(true);
	});

	it('TSK-D5AAAA the loans change nothing about the number on the first day of a demo', async () => {
		const withLoans = await fresh();
		await seedHousehold(withLoans, { production: false, now: NOW });
		const without = await fresh();
		await seedHousehold(without, { production: false, now: NOW, loans: false });
		expect(await buildHome(withLoans, 1, NOW)).toEqual(await buildHome(without, 1, NOW));
	});

	it('keeps the currency and time zone the owner already chose', async () => {
		const db = await fresh();
		await db.update(owner).set({ currency: 'GBP', timeZone: 'Europe/London' });
		await seedHousehold(db, { production: false, now: NOW });
		expect(await getOwner(db, 1)).toMatchObject({ currency: 'GBP', timeZone: 'Europe/London' });
	});

	it('refuses in production, writing nothing', async () => {
		const db = await fresh();
		await expect(seedHousehold(db, { production: true, force: true })).rejects.toThrow(SeedRefused);
		expect(await listItems(db, 1)).toEqual([]);
		expect((await getOwner(db, 1)).setupStep).toBe('welcome');
	});

	it('refuses when the account already has a schedule, unless forced', async () => {
		const db = await fresh();
		await seedHousehold(db, { production: false, now: NOW });
		await expect(seedHousehold(db, { production: false, now: NOW })).rejects.toThrow(
			/already has a schedule/
		);
		expect(await listItems(db, 1)).toHaveLength(fixtureItems.length + 2);
		await seedHousehold(db, { production: false, force: true, now: NOW });
		expect(await listItems(db, 1)).toHaveLength((fixtureItems.length + 2) * 2);
	});

	it('refuses before anyone has signed up, rather than creating the owner', async () => {
		const db = await freshDb();
		await expect(seedHousehold(db, { production: false })).rejects.toThrow(/signed up/);
		expect(await db.select().from(owner)).toEqual([]);
	});

	it('does not change the setup step of nothing when it refuses', async () => {
		const db = await fresh();
		await setSetupStep(db, 1, 'pay');
		await expect(seedHousehold(db, { production: true })).rejects.toThrow(SeedRefused);
		expect((await getOwner(db, 1)).setupStep).toBe('pay');
	});
});

// Each test starts real Node processes that load the app from scratch: about a second each alone,
// several under a full parallel run, so the default five seconds is too tight.
describe(
	'TSK-4BCD15 pnpm seed runs under plain Node, with type stripping',
	{ timeout: 30_000 },
	() => {
		let dir: string | undefined;
		afterEach(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
			dir = undefined;
		});

		const run = (env: Record<string, string>, ...args: string[]) =>
			spawnSync(process.execPath, ['scripts/seed.ts', ...args], {
				cwd: process.cwd(),
				env: { ...process.env, NODE_ENV: 'test', ...env },
				encoding: 'utf8'
			});

		it('refuses under NODE_ENV=production and never creates the database', () => {
			dir = mkdtempSync(join(tmpdir(), 'payday-seed-'));
			const url = join(dir, 'prod');
			const result = run({ DATABASE_URL: url, NODE_ENV: 'production' }, '--force');
			expect(result.status).toBe(1);
			expect(result.stderr).toMatch(/production/);
			expect(
				spawnSync(process.execPath, [
					'-e',
					`process.exit(require('fs').existsSync(${JSON.stringify(url)}) ? 1 : 0)`
				]).status
			).toBe(0);
		});

		it('seeds a database file, then refuses a second run, then accepts --force', async () => {
			dir = mkdtempSync(join(tmpdir(), 'payday-seed-'));
			const url = join(dir, 'demo');
			const first0 = await openDatabase(url);
			await first0.db.insert(owner).values({ id: 1 });
			await first0.close();

			const first = run({ DATABASE_URL: url });
			expect(first.stderr).toBe('');
			expect(first.stdout).toMatch(/Seeded 10 items, 2 overrides and 4 loans/);
			expect(first.status).toBe(0);

			const second = run({ DATABASE_URL: url });
			expect(second.status).toBe(1);
			expect(second.stderr).toMatch(/already has a schedule/);

			expect(run({ DATABASE_URL: url }, '--force').status).toBe(0);
			const check = await openDatabase(url);
			expect(await listItems(check.db, 1)).toHaveLength(20);
			await check.close();
		});
	}
);
