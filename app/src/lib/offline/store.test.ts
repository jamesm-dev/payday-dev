import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { parseCalDate as d } from '#lib/domain/dates.ts';
import { minor } from '#lib/domain/money.ts';
import { moneyText } from '#lib/format.ts';
import HomeNumber from '#lib/home/HomeNumber.svelte';
import { owner } from '#lib/server/db/schema.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { buildHomeScreen, type CopyFacts } from '#lib/server/money/home.ts';
import { seedHousehold } from '#lib/server/money/seed.ts';
import { setBalance } from '#lib/server/money/store.ts';
import { fromText, paydayPassed, withQueued } from './adjust.ts';
import {
	adopt,
	COPY_KEY,
	dropCopy,
	enqueue,
	forgetAll,
	holdFor,
	mark,
	newId,
	QUEUE_KEY,
	readCopy,
	readQueue,
	unqueue,
	type Queued,
	type ReadyView
} from './store.ts';

/** A browser's local storage, for node. `full` makes every write fail, as a full phone does. */
class FakeStorage {
	map = new Map<string, string>();
	full = false;
	getItem = (k: string) => this.map.get(k) ?? null;
	setItem = (k: string, v: string) => {
		if (this.full) throw new DOMException('full', 'QuotaExceededError');
		this.map.set(k, v);
	};
	removeItem = (k: string) => void this.map.delete(k);
}

let storage: FakeStorage;
beforeEach(() => {
	storage = new FakeStorage();
	Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});
afterEach(() => {
	Reflect.deleteProperty(globalThis, 'localStorage');
});

const T0 = new Date('2026-10-16T12:00:00Z');
/** Two people's tags, as the layout sends them. */
const ME = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const THEM = '0f9e8d7c6b5a49382716f5e4d3c2b1a0';
/** Data asked for now, by this phone's clock. */
const NOW_ASKED = () => Date.now();

/** The seeded household's home screen, and what the copy keeps beside it. */
async function screen() {
	const db = await freshDb();
	await db.insert(owner).values({ id: 1 });
	await seedHousehold(db, { production: false, now: T0, loans: false });
	await setBalance(db, 1, minor(150000), d('2026-10-16'), new Date('2026-10-16T09:00:00Z'));
	const { home, facts } = await buildHomeScreen(db, 1, T0);
	if (home.state !== 'ready' || !facts) throw new Error(home.state);
	return { view: home, facts };
}

const queued = (over: Partial<Queued> = {}): Queued => ({
	id: newId(),
	owner: ME,
	amount: 1250,
	amountText: '12.50',
	note: 'Lunch',
	date: d('2026-10-16'),
	loggedAt: '2026-10-16T12:30:00.000Z',
	state: 'waiting',
	...over
});

describe('TSK-e87f11 the copy of the last home screen', () => {
	it('is kept for its owner and read back whole', async () => {
		const { view, facts } = await screen();
		expect(adopt(ME, view, facts, NOW_ASKED())).toEqual([]);
		expect(readCopy()).toEqual({ v: 1, owner: ME, view, facts });
		expect(facts.at).toBe(T0.toISOString());
		expect(facts.timeZone).toBe('UTC');
	});

	it('is removed when the home screen has no number to show', async () => {
		const { view, facts } = await screen();
		adopt(ME, view, facts, NOW_ASKED());
		adopt(ME, null, null, NOW_ASKED());
		expect(readCopy()).toBeNull();
	});

	it('reads as nothing when storage holds something else, or is off', async () => {
		storage.map.set(COPY_KEY, '{not json');
		expect(readCopy()).toBeNull();
		storage.map.set(COPY_KEY, JSON.stringify({ v: 2, owner: ME }));
		expect(readCopy()).toBeNull();
		storage.map.set(COPY_KEY, JSON.stringify({ v: 1, owner: ME, view: { state: 'ready' } }));
		expect(readCopy()).toBeNull();
		Object.defineProperty(globalThis, 'localStorage', {
			get() {
				throw new DOMException('blocked', 'SecurityError');
			},
			configurable: true
		});
		expect(readCopy()).toBeNull();
		expect(readQueue()).toEqual([]);
		expect(enqueue(queued())).toBe(false);
		expect(() => forgetAll()).not.toThrow();
	});

	it('says when it is from, in the owner’s time zone, and when its payday has come', async () => {
		const { facts } = await screen();
		expect(fromText({ at: '2026-11-16T15:42:00.000Z', timeZone: 'America/New_York' })).toBe(
			'Mon, Nov 16 2026 at 10:42 AM'
		);
		expect(fromText({ at: 'garbage', timeZone: 'UTC' })).toBe('an earlier visit');
		expect(paydayPassed(facts, T0)).toBe(false);
		expect(paydayPassed(facts, new Date(`${facts.nextPayday}T00:00:01Z`))).toBe(true);
	});
});

describe('TSK-6ff9b3 an expense logged offline lowers the number at once', () => {
	it('takes each queued expense off the copy’s number and adds it to what was logged', async () => {
		const { view, facts } = await screen();
		const { view: shown, pending } = withQueued(view, facts, [
			queued({ amount: 1250, note: 'Lunch' }),
			queued({ amount: 300, note: '', loggedAt: '2026-10-16T12:40:00.000Z' })
		]);
		expect(shown.amount).toBe(moneyOf(facts.amountMinor - 1550, facts));
		expect(shown.expensesTotal).toBe(moneyOf(facts.expensesTotalMinor + 1550, facts));
		expect(pending.map((p) => [p.name, p.amount])).toEqual([
			['Expense', '$3.00'],
			['Lunch', '$12.50']
		]);
		expect(pending.every((p) => p.problem === undefined)).toBe(true);
	});

	it('leaves out one dated before the balance, as the site does (ADR-0012)', async () => {
		const { view, facts } = await screen();
		const { view: shown, pending } = withQueued(view, facts, [queued({ date: d('2026-10-15') })]);
		expect(shown).toBe(view);
		expect(pending).toHaveLength(1);
	});

	it('still counts a refused one, and says why it was refused', async () => {
		const { view, facts } = await screen();
		const { view: shown, pending } = withQueued(view, facts, [
			queued({ state: 'refused', problem: 'That amount is too big.' })
		]);
		expect(shown.amount).toBe(moneyOf(facts.amountMinor - 1250, facts));
		expect(pending[0]!.problem).toBe('That amount is too big.');
	});

	it('goes below zero honestly', async () => {
		const { view, facts } = await screen();
		const { view: shown } = withQueued(view, facts, [queued({ amount: facts.amountMinor + 100 })]);
		expect(shown.negative).toBe(true);
		expect(shown.amount).toBe('-$1.00');
	});

	it('is listed as not sent yet, above the saved ones, with no link', async () => {
		const { view, facts } = await screen();
		const { view: shown, pending } = withQueued(view, facts, [
			queued({ note: 'Bus' }),
			queued({ note: 'Big', state: 'refused', problem: 'That amount is too big.' })
		]);
		const html = render(HomeNumber, {
			props: { view: shown, pending, onremove: () => {} }
		}).body;
		expect(html).toContain('Not sent yet');
		expect(html).toContain('Not sent: That amount is too big.');
		expect(html).toContain('Remove from this phone');
		expect(html.match(/data-testid="not-sent"/g)).toHaveLength(2);
	});
});

describe('TSK-faf834 the copy and queue belong to one person', () => {
	it('drops another person’s copy and queue when this person’s screen arrives', async () => {
		const { view, facts } = await screen();
		adopt(THEM, view as ReadyView, facts, NOW_ASKED());
		enqueue(queued({ owner: THEM, note: 'Theirs' }));
		enqueue(queued({ owner: ME, note: 'Mine' }));
		const mine = adopt(ME, view, facts, NOW_ASKED());
		expect(mine.map((q) => q.note)).toEqual(['Mine']);
		expect(readQueue().map((q) => q.note)).toEqual(['Mine']);
		expect(readCopy()?.owner).toBe(ME);
	});

	it('drops a sent one only with data asked for after the site saved it', async () => {
		vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
		try {
			const { view, facts } = await screen();
			const sent = queued({ note: 'Sent' });
			const waiting = queued({ note: 'Waiting' });
			enqueue(sent);
			enqueue(waiting);
			const askedBefore = Date.now();
			vi.setSystemTime(1_000_500);
			mark(sent.id, 'sent');
			expect(readQueue(ME).find((q) => q.id === sent.id)?.sentAt).toBe(1_000_500);
			// Until then a sent one still comes off an older copy.
			expect(withQueued(view, facts, readQueue(ME)).pending).toHaveLength(2);
			// Data asked for before the save may not hold it: it stays, and the number never reads high.
			expect(
				adopt(ME, view, facts, askedBefore)
					.map((q) => q.note)
					.sort()
			).toEqual(['Sent', 'Waiting']);
			// Data asked for in the same millisecond as the save was asked for after it: it holds it.
			const same = queued({ note: 'Same moment' });
			enqueue(same);
			mark(same.id, 'sent');
			expect(adopt(ME, view, facts, 1_000_500).map((q) => q.note)).not.toContain('Same moment');
			// Data asked for after the save holds it.
			vi.setSystemTime(1_001_000);
			expect(adopt(ME, view, facts, Date.now()).map((q) => q.note)).toEqual(['Waiting']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('is held for whoever a page was drawn for', async () => {
		const { view, facts } = await screen();
		adopt(ME, view, facts, NOW_ASKED());
		enqueue(queued({ owner: ME, note: 'Mine' }));
		enqueue(queued({ owner: THEM, note: 'Theirs' }));
		holdFor(null, null);
		expect(readQueue()).toHaveLength(2);
		holdFor('in', null);
		expect(readQueue()).toHaveLength(2);
		holdFor('in', ME);
		expect(readCopy()?.owner).toBe(ME);
		expect(readQueue().map((q) => q.note)).toEqual(['Mine']);
		holdFor('in', THEM);
		expect(readCopy()).toBeNull();
		expect(readQueue()).toEqual([]);
		adopt(ME, view, facts, NOW_ASKED());
		enqueue(queued({ owner: ME, note: 'Mine' }));
		holdFor('setup', ME);
		expect(readCopy()).toBeNull();
		expect(readQueue()).toHaveLength(1);
		adopt(ME, view, facts, NOW_ASKED());
		holdFor('out', null);
		expect(readCopy()).toBeNull();
		// Signed out, the queue stays for its owner: the sign-in page asks about it.
		expect(readQueue()).toHaveLength(1);
	});

	it('marks, refuses and removes by id, and forgets everything on sign-out', () => {
		const a = queued();
		const b = queued();
		enqueue(a);
		enqueue(b);
		enqueue(a); // the same id again replaces, never doubles
		expect(readQueue()).toHaveLength(2);
		mark(a.id, 'refused', 'That day has not happened yet.');
		expect(readQueue().find((q) => q.id === a.id)?.problem).toBe('That day has not happened yet.');
		mark(a.id, 'waiting');
		expect(readQueue().find((q) => q.id === a.id)?.problem).toBeUndefined();
		unqueue(a.id);
		expect(readQueue().map((q) => q.id)).toEqual([b.id]);
		storage.map.set(COPY_KEY, '{}');
		forgetAll();
		expect(storage.map.size).toBe(0);
		dropCopy();
	});

	it('says so when a full phone cannot keep an expense', () => {
		storage.full = true;
		expect(enqueue(queued())).toBe(false);
		expect(readQueue()).toEqual([]);
	});

	it('uses the names the every-page guard script removes', () => {
		const guard = readFileSync(new URL('./guard.js', import.meta.url), 'utf8');
		expect(guard).toContain(`const COPY = '${COPY_KEY}';`);
		expect(guard).toContain(`const QUEUE = '${QUEUE_KEY}';`);
	});
});

describe('TSK-03858e an id made on the phone', () => {
	it('is a version 4 UUID with or without crypto.randomUUID', () => {
		const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
		expect(newId()).toMatch(pattern);
		const original = crypto.randomUUID;
		Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
		try {
			const ids = new Set(Array.from({ length: 200 }, () => newId()));
			expect(ids.size).toBe(200);
			for (const id of ids) expect(id).toMatch(pattern);
		} finally {
			Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
		}
	});
});

const moneyOf = (minorUnits: number, facts: CopyFacts) => moneyText(minorUnits, facts.currency);
