import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { MAX_CONCURRENT, MAX_WAITING } from './password.ts';
import {
	createGlobalSlots,
	createRateLimiter,
	createSlotLimiter,
	SLOT_LEASE_MS
} from './rateLimit.ts';
import { beginAttempt, hashQueue } from './signInAttempt.ts';
import { loggedDatabase } from './statementLog.ts';

let db: Db;
beforeEach(async () => {
	db = await freshDb();
});

describe('TSK-2F1582 an attempt is charged and given a place at entry', () => {
	it('stops a burst at the limit before any of it has failed', async () => {
		const limiter = createRateLimiter('l', 10, 60_000);
		const slots = createSlotLimiter('s', 100);
		// A real burst: all twelve start together, before any has finished.
		const open = await Promise.all(
			Array.from({ length: 12 }, () => beginAttempt(db, '1.2.3.4', limiter, slots))
		);
		// Nothing has finished or failed, yet only 10 got in.
		expect(open.filter((a) => a.ok)).toHaveLength(10);
		expect(open.filter((a) => !a.ok)).toHaveLength(2);
		expect((await beginAttempt(db, '5.6.7.8', limiter, slots)).ok).toBe(true);
	});

	it('lets one address hold only 2 places, so the owner always gets in', async () => {
		const limiter = createRateLimiter('l', 10, 60_000);
		const slots = createSlotLimiter('s', 2);
		const first = await beginAttempt(db, '1.2.3.4', limiter, slots);
		const second = await beginAttempt(db, '1.2.3.4', limiter, slots);
		expect(first.ok && second.ok).toBe(true);
		expect((await beginAttempt(db, '1.2.3.4', limiter, slots)).ok).toBe(false);
		expect((await beginAttempt(db, '9.9.9.9', limiter, slots)).ok).toBe(true);
		if (first.ok) await first.done(false);
		expect((await beginAttempt(db, '1.2.3.4', limiter, slots)).ok).toBe(true);
	});

	it('keeps the charge for a failure and refunds it for a success, releasing the place either way', async () => {
		const limiter = createRateLimiter('l', 2, 60_000);
		const slots = createSlotLimiter('s', 2);
		for (let i = 0; i < 2; i++) {
			const a = await beginAttempt(db, '1.2.3.4', limiter, slots);
			if (a.ok) await a.done(false);
		}
		expect((await beginAttempt(db, '1.2.3.4', limiter, slots)).ok).toBe(false); // two failures used the limit
		const ok = await beginAttempt(db, '5.5.5.5', limiter, slots);
		if (ok.ok) await ok.done(true);
		if (ok.ok) await ok.done(true); // a second call changes nothing
		expect(await limiter.isLimited(db, '5.5.5.5')).toBe(false);
		// Nothing is held: the place is back, and the one charge was refunded.
		const again = await beginAttempt(db, '5.5.5.5', limiter, slots);
		const another = await beginAttempt(db, '5.5.5.5', limiter, slots);
		expect(again.ok && another.ok).toBe(true);
	});

	it('TSK-5569A1 shares the limit and the places between separate function instances', async () => {
		// Two instances: each builds its own limiter and slot limiter over the one database.
		const instance = () => ({
			limiter: createRateLimiter('l', 3, 60_000),
			slots: createSlotLimiter('s', 2)
		});
		const a = instance();
		const b = instance();
		const one = await beginAttempt(db, '1.2.3.4', a.limiter, a.slots);
		const two = await beginAttempt(db, '1.2.3.4', b.limiter, b.slots);
		expect(one.ok && two.ok).toBe(true);
		// The third is refused for the places held by the other instance, not for the count.
		expect((await beginAttempt(db, '1.2.3.4', a.limiter, a.slots)).ok).toBe(false);
		if (one.ok) await one.done(false);
		if (two.ok) await two.done(false);
		const three = await beginAttempt(db, '1.2.3.4', b.limiter, b.slots);
		expect(three.ok).toBe(true);
		if (three.ok) await three.done(false);
		// Three failures, counted across both instances, are the limit.
		expect((await beginAttempt(db, '1.2.3.4', a.limiter, a.slots)).ok).toBe(false);
	});
});

describe('TSK-5569A1 the global ceiling on password checks is kept in the database', () => {
	const CEILING = MAX_CONCURRENT + MAX_WAITING;
	/** A different address per attempt, so only the global ceiling can refuse. */
	const addr = (i: number) => `10.1.${Math.floor(i / 200)}.${i % 200}`;
	const attempt = (i: number, queue = hashQueue) =>
		beginAttempt(db, addr(i), createRateLimiter('l', 10, 60_000), createSlotLimiter('s', 2), queue);

	it('is as big as one instance queue, and the next attempt after it is refused as busy', async () => {
		expect(CEILING).toBe(18);
		const held = [];
		for (let i = 0; i < CEILING; i++) held.push(await attempt(i));
		expect(held.every((a) => a.ok)).toBe(true);
		expect(await attempt(CEILING)).toEqual({ ok: false, reason: 'busy' });
	});

	it('refuses the 19th of a real burst: no more than the ceiling get in', async () => {
		const results = await Promise.all(Array.from({ length: 25 }, (_, i) => attempt(i)));
		expect(results.filter((a) => a.ok)).toHaveLength(CEILING);
		expect(results.filter((a) => !a.ok && a.reason === 'busy')).toHaveLength(25 - CEILING);
	});

	it('holds across separate instances: places taken by one are gone for the other', async () => {
		const one = createGlobalSlots('hash-queue', CEILING);
		const two = createGlobalSlots('hash-queue', CEILING);
		for (let i = 0; i < 9; i++) expect((await attempt(i, one)).ok).toBe(true);
		for (let i = 9; i < CEILING; i++) expect((await attempt(i, two)).ok).toBe(true);
		expect((await attempt(100, one)).ok).toBe(false);
		expect((await attempt(101, two)).ok).toBe(false);
	});

	it('a finished attempt frees its place, and a busy refusal costs the address nothing', async () => {
		const first = await attempt(0);
		for (let i = 1; i < CEILING; i++) await attempt(i);
		const limiter = createRateLimiter('l2', 1, 60_000);
		const slots = createSlotLimiter('s2', 2);
		const refused = await beginAttempt(db, '9.9.9.9', limiter, slots, hashQueue);
		expect(refused).toEqual({ ok: false, reason: 'busy' });
		// Nothing was kept: not the charge, not the address place.
		expect(await limiter.isLimited(db, '9.9.9.9')).toBe(false);
		if (first.ok) await first.done(false);
		expect((await beginAttempt(db, '9.9.9.9', limiter, slots, hashQueue)).ok).toBe(true);
	});

	it('TSK-6DF544 a place never given back frees itself when its lease ends', async () => {
		const queue = createGlobalSlots('hash-queue', 1, SLOT_LEASE_MS);
		expect(await queue.acquire(db, 'x', 0)).not.toBeNull();
		expect(await queue.acquire(db, 'x', SLOT_LEASE_MS - 1)).toBeNull();
		expect(await queue.acquire(db, 'x', SLOT_LEASE_MS)).not.toBeNull();
	});

	describe('as one statement', () => {
		const logged = loggedDatabase();
		it('taking a place is a single INSERT … ON CONFLICT … WHERE count', async () => {
			const queue = createGlobalSlots('hash-queue', CEILING);
			await queue.acquire(logged.db, 'x');
			const seen = await logged.statements(() => queue.acquire(logged.db, 'x'));
			expect(seen).toHaveLength(1);
			expect(seen[0]).toMatch(
				/^insert into "payday"\."attempt_counter".* on conflict .* do update set .* where .*count\(\*\)/is
			);
		});
	});
});

describe('TSK-5569A1 giving back a place cannot strand another', () => {
	it('frees the global place even when giving back the address place throws', async () => {
		const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
		const failing: ReturnType<typeof createSlotLimiter> = {
			acquire: async () => async () => {
				throw new Error('database hiccup');
			},
			size: async () => 0
		};
		const queue = createGlobalSlots('hash-queue', 1);
		const attempt = await beginAttempt(
			db,
			'1.2.3.4',
			createRateLimiter('l', 10, 60_000),
			failing,
			queue
		);
		expect(attempt.ok).toBe(true);
		expect(await queue.acquire(db, 'x')).toBeNull(); // held
		if (attempt.ok) await attempt.done(false); // does not throw
		expect(await queue.acquire(db, 'x')).not.toBeNull(); // freed regardless
		expect(quiet).toHaveBeenCalled();
		quiet.mockRestore();
	});
});
