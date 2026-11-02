/**
 * Loads the fictional household from `domain/fixture.ts` for demos (`pnpm seed`). Nothing here is
 * real data, and nothing real may ever be put here. Plain TypeScript with relative-or-`#lib` imports
 * only, so Node runs it directly (type stripping), with no build step.
 */
import { eq } from 'drizzle-orm';
import { fixtureBalance, fixtureItems, fixtureOverrides } from '#lib/domain/fixture.ts';
import { minor } from '#lib/domain/money.ts';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { createLoan } from './loans.ts';
import {
	addItem,
	ensureAccount,
	getOwner,
	listItems,
	ownerToday,
	saveRegion,
	setBalance,
	setOverride,
	setSetupStep
} from './store.ts';

/** The seed would be wrong to run; the message says why in plain words. */
export class SeedRefused extends Error {}

export type SeedOptions = {
	ownerId?: number;
	production: boolean;
	force?: boolean;
	now?: Date;
	/** Also load the household's four loans (default true). The check-in tests turn it off. */
	loans?: boolean;
};

export function seedHousehold(
	db: Db,
	options: SeedOptions
): { items: number; overrides: number; loans: number } {
	const ownerId = options.ownerId ?? 1;
	if (options.production) {
		throw new SeedRefused('Refusing to seed: NODE_ENV is production. The seed is fictional data.');
	}
	if (!db.select({ id: owner.id }).from(owner).where(eq(owner.id, ownerId)).get()) {
		throw new SeedRefused(
			'Refusing to seed: nobody has signed up yet. Open the app, create your passkey, then run the seed.'
		);
	}
	ensureAccount(db, ownerId);
	if (listItems(db, ownerId).length > 0 && !options.force) {
		throw new SeedRefused(
			'Refusing to seed: this account already has a schedule. Use --force to add the demo household anyway.'
		);
	}

	// better-sqlite3's own transaction: all of it lands, or none of it does.
	return db.$client.transaction(() => {
		const settings = getOwner(db, ownerId);
		// A fictional household in a fictional place, unless the owner already chose their own.
		if (!settings.currency || !settings.timeZone) saveRegion(db, ownerId, 'USD', 'UTC');
		const today = ownerToday(getOwner(db, ownerId), options.now ?? new Date());

		const ids = new Map<string, number>();
		for (const { id, ...item } of fixtureItems) ids.set(id, Number(addItem(db, ownerId, item).id));
		for (const o of fixtureOverrides) {
			const itemId = ids.get(o.itemId);
			if (itemId === undefined) throw new Error(`Fixture override names unknown item ${o.itemId}`);
			setOverride(
				db,
				ownerId,
				itemId,
				o.action === 'skip'
					? { action: 'skip', originalDate: o.originalDate }
					: { action: 'change', originalDate: o.originalDate, date: o.date, amount: o.amount }
			);
		}
		// Dated today, not on the fixture's own January date, so a demo opens on a fresh number.
		setBalance(db, ownerId, fixtureBalance.amount, today, options.now ?? new Date());
		setSetupStep(db, ownerId, null);

		let items = fixtureItems.length;
		let loans = 0;
		if (options.loans !== false) {
			// Two more loan payments, which start today so the number on the demo's first day is the
			// fixture's own. The card and the laptop plan reuse the fixture's own payments.
			const startsOn = today;
			const car = addItem(db, ownerId, {
				kind: 'loan-payment',
				name: 'Car loan payment',
				amount: minor(28500),
				rule: { kind: 'monthly', day: 20 },
				startsOn
			});
			const dad = addItem(db, ownerId, {
				kind: 'loan-payment',
				name: 'Paying back Dad',
				amount: minor(10000),
				rule: { kind: 'monthly', day: 25 },
				startsOn
			});
			items += 2;
			const link = (key: string) => ids.get(key) ?? null;
			const households = [
				{
					type: 'credit-card' as const,
					name: 'Visa',
					lender: 'Harbour Bank',
					balance: minor(180000),
					rateBp: 2299,
					scheduleItemId: link('card'),
					minPctBp: 200,
					minFloor: minor(2500)
				},
				{
					type: 'instalment' as const,
					name: 'Car loan',
					lender: 'Harbour Credit Union',
					balance: minor(640000),
					rateBp: 650,
					scheduleItemId: Number(car.id),
					minPctBp: null,
					minFloor: null
				},
				// The fixture's laptop plan ended in March: it is paid, and linked to its own payment.
				{
					type: 'bnpl' as const,
					name: 'Laptop plan',
					lender: 'ShopLater',
					balance: minor(0),
					rateBp: 0,
					scheduleItemId: link('bnpl'),
					minPctBp: null,
					minFloor: null
				},
				{
					type: 'informal' as const,
					name: 'Loan from Dad',
					lender: 'Dad',
					balance: minor(120000),
					rateBp: 0,
					scheduleItemId: Number(dad.id),
					minPctBp: null,
					minFloor: null
				}
			];
			for (const fields of households) {
				createLoan(db, ownerId, fields, today);
				loans++;
			}
		}
		return { items, overrides: fixtureOverrides.length, loans };
	})();
}
