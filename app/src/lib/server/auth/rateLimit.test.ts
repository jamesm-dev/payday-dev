import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { attemptCounter } from '#lib/server/db/schema.ts';
import { createRateLimiter, createSlotLimiter, limiterKey } from './rateLimit.ts';
import { loggedDatabase } from './statementLog.ts';

let db: Db;
beforeEach(async () => {
	db = await freshDb();
});

describe('TSK-E31665 failed sign-ins are rate limited per IP', () => {
	it('blocks an address after 10 failures in a minute, and only that address', async () => {
		const limiter = createRateLimiter('t', 10, 60_000);
		for (let i = 0; i < 9; i++) await limiter.recordFailure(db, '1.1.1.1', 1000 + i);
		expect(await limiter.isLimited(db, '1.1.1.1', 2000)).toBe(false);
		await limiter.recordFailure(db, '1.1.1.1', 2000);
		expect(await limiter.isLimited(db, '1.1.1.1', 2001)).toBe(true);
		expect(await limiter.isLimited(db, '2.2.2.2', 2001)).toBe(false);
	});

	it('forgets failures once the window has passed', async () => {
		const limiter = createRateLimiter('t', 2, 60_000);
		await limiter.recordFailure(db, 'a', 0);
		await limiter.recordFailure(db, 'a', 1);
		expect(await limiter.isLimited(db, 'a', 30_000)).toBe(true);
		expect(await limiter.isLimited(db, 'a', 61_000)).toBe(false);
	});
});

describe('TSK-E31665 the limiter keys IPv6 by /64 and cannot grow without bound', () => {
	it('treats every address in one /64 as the same client', async () => {
		expect(limiterKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(
			limiterKey('2001:0db8:0001:0002::1')
		);
		expect(limiterKey('2001:db8:1:3::1')).not.toBe(limiterKey('2001:db8:1:2::1'));
		expect(limiterKey('::1')).toBe('0000:0000:0000:0000::/64');
		expect(limiterKey('203.0.113.9')).toBe('203.0.113.9');
		expect(limiterKey('::ffff:203.0.113.9')).toBe('203.0.113.9');

		const limiter = createRateLimiter('t', 2, 60_000);
		await limiter.recordFailure(db, '2001:db8:1:2::1', 0);
		await limiter.recordFailure(db, '2001:db8:1:2::2', 1);
		expect(await limiter.isLimited(db, '2001:db8:1:2:ffff::9', 2)).toBe(true);
		expect(await limiter.isLimited(db, '2001:db8:1:9::1', 2)).toBe(false);
	});

	it('TSK-6DF544 holds at most maxKeys keys, dropping the least recently touched', async () => {
		const limiter = createRateLimiter('t', 1, 60_000, 3);
		for (let i = 0; i < 10; i++) await limiter.recordFailure(db, `10.0.0.${i}`, i);
		expect(await limiter.size(db)).toBe(3);
		expect(await limiter.isLimited(db, '10.0.0.0', 10)).toBe(false);
		expect(await limiter.isLimited(db, '10.0.0.9', 10)).toBe(true);
	});

	it('TSK-6DF544 a new key sweeps a bounded batch of expired keys; sweep() clears the rest', async () => {
		const limiter = createRateLimiter('t', 5, 1000);
		for (let i = 0; i < 120; i++) await limiter.recordFailure(db, `10.0.1.${i}`, 0);
		expect(await limiter.size(db)).toBe(120);
		await limiter.recordFailure(db, '10.0.2.1', 5000);
		// One new key cleared at most 50 stale ones, not the whole table.
		expect(await limiter.size(db)).toBe(71);
		await limiter.sweep(db, 5001);
		expect(await limiter.size(db)).toBe(1);
	});

	it('TSK-6DF544 never reads an expired stamp as current, even before it is cleaned up', async () => {
		const limiter = createRateLimiter('t', 1, 1000);
		await limiter.recordFailure(db, 'a', 0);
		expect(await limiter.size(db)).toBe(1); // still in the table...
		expect(await limiter.isLimited(db, 'a', 999)).toBe(true);
		expect(await limiter.isLimited(db, 'a', 1000)).toBe(false); // ...but not current
		expect(await limiter.hit(db, 'a', 1000)).toBe(true);
		// The same key's own write dropped the stale stamp.
		const [row] = await db.select().from(attemptCounter);
		expect(row.stamps).toEqual([2000]);
	});

	it('hit() counts a request and refuses once the limit is reached', async () => {
		const limiter = createRateLimiter('t', 2, 1000);
		expect(await limiter.hit(db, 'a', 0)).toBe(true);
		expect(await limiter.hit(db, 'a', 1)).toBe(true);
		expect(await limiter.hit(db, 'a', 2)).toBe(false);
		expect(await limiter.hit(db, 'a', 1500)).toBe(true);
	});

	it('keeps a long run of recorded failures bounded to the limit', async () => {
		const limiter = createRateLimiter('t', 3, 60_000);
		for (let i = 0; i < 50; i++) await limiter.recordFailure(db, 'a', i);
		const [row] = await db.select().from(attemptCounter);
		expect(row.stamps).toHaveLength(3);
	});
});

describe('TSK-2F1582 the sign-in limiters', () => {
	it('keys IPv6 by /48 when asked, and /64 otherwise', async () => {
		expect(limiterKey('2001:db8:1:2::1', 48)).toBe(limiterKey('2001:db8:1:ffff::9', 48));
		expect(limiterKey('2001:db8:1:2::1', 48)).toBe('2001:0db8:0001::/48');
		expect(limiterKey('2001:db8:2:2::1', 48)).not.toBe(limiterKey('2001:db8:1:2::1', 48));
		expect(limiterKey('2001:db8:1:2::1')).not.toBe(limiterKey('2001:db8:1:3::1'));
		expect(limiterKey('203.0.113.9', 48)).toBe('203.0.113.9');

		const signIn = createRateLimiter('t48', 2, 60_000, 5000, 48);
		await signIn.hit(db, '2001:db8:1:2::1', 0);
		await signIn.hit(db, '2001:db8:1:9::5', 0);
		expect(await signIn.isLimited(db, '2001:db8:1:abcd::7', 1)).toBe(true);
		// The shared sign-in limiter is a /48 limiter; the options limiter stays /64.
		const options = createRateLimiter('t64', 1, 60_000);
		await options.hit(db, '2001:db8:1:2::1', 0);
		expect(await options.isLimited(db, '2001:db8:1:3::1', 1)).toBe(false);
	});

	it('refunds one count, and never goes below zero', async () => {
		const limiter = createRateLimiter('t', 2, 60_000);
		await limiter.refund(db, 'a');
		expect(await limiter.hit(db, 'a', 0)).toBe(true);
		expect(await limiter.hit(db, 'a', 1)).toBe(true);
		expect(await limiter.hit(db, 'a', 2)).toBe(false);
		await limiter.refund(db, 'a');
		expect(await limiter.hit(db, 'a', 3)).toBe(true);
		await limiter.refund(db, 'a');
		await limiter.refund(db, 'a');
		await limiter.refund(db, 'a');
		expect(await limiter.hit(db, 'a', 4)).toBe(true);
		expect(await limiter.hit(db, 'a', 5)).toBe(true);
		expect(await limiter.hit(db, 'a', 6)).toBe(false);
	});

	it('caps the slots one address may hold, by /48 for IPv6, and frees them on release', async () => {
		const slots = createSlotLimiter('s', 2);
		const a = await slots.acquire(db, '2001:db8:1:1::1');
		const b = await slots.acquire(db, '2001:db8:1:2::1');
		expect(a && b).toBeTruthy();
		expect(await slots.acquire(db, '2001:db8:1:3::1')).toBeNull();
		expect(await slots.acquire(db, '2001:db8:2::1')).not.toBeNull();
		await a!();
		await a!(); // releasing twice frees only one
		const c = await slots.acquire(db, '2001:db8:1:4::1');
		expect(c).not.toBeNull();
		expect(await slots.acquire(db, '2001:db8:1:5::1')).toBeNull();
		await b!();
		await c!();
	});

	it('TSK-6DF544 a slot is a lease: one never given back frees itself when the lease ends', async () => {
		const slots = createSlotLimiter('s', 1, 48, 1000);
		expect(await slots.acquire(db, '1.1.1.1', 0)).not.toBeNull(); // never released: a dead function
		expect(await slots.acquire(db, '1.1.1.1', 999)).toBeNull();
		const later = await slots.acquire(db, '1.1.1.1', 1000);
		expect(later).not.toBeNull();
		// Releasing the old, already expired lease does not free the new one.
		expect(await slots.acquire(db, '1.1.1.1', 1001)).toBeNull();
	});
});

describe('TSK-5569A1 the limits hold across separate function instances', () => {
	it('two limiters built apart, over one database, count together', async () => {
		const first = createRateLimiter('shared', 3, 60_000);
		const second = createRateLimiter('shared', 3, 60_000);
		expect(await first.hit(db, '9.9.9.9', 0)).toBe(true);
		expect(await second.hit(db, '9.9.9.9', 1)).toBe(true);
		expect(await first.hit(db, '9.9.9.9', 2)).toBe(true);
		expect(await second.hit(db, '9.9.9.9', 3)).toBe(false);
		expect(await first.isLimited(db, '9.9.9.9', 4)).toBe(true);
		await second.refund(db, '9.9.9.9');
		expect(await first.hit(db, '9.9.9.9', 5)).toBe(true);
	});

	it('two slot limiters share the address share, and a release by one frees it for the other', async () => {
		const first = createSlotLimiter('shared-slots', 2);
		const second = createSlotLimiter('shared-slots', 2);
		const a = await first.acquire(db, '9.9.9.9');
		expect(await second.acquire(db, '9.9.9.9')).not.toBeNull();
		expect(await first.acquire(db, '9.9.9.9')).toBeNull();
		await a!();
		expect(await second.acquire(db, '9.9.9.9')).not.toBeNull();
	});

	it('requests started together do not all pass a limit meant for fewer', async () => {
		const limiter = createRateLimiter('burst', 4, 60_000);
		const results = await Promise.all(
			Array.from({ length: 12 }, () => limiter.hit(db, '7.7.7.7', 0))
		);
		expect(results.filter(Boolean)).toHaveLength(4);
	});
});

describe('TSK-5569A1 a check-and-count is one statement', () => {
	const logged = loggedDatabase();

	it('hit() and acquire() are each a single INSERT … ON CONFLICT … WHERE, never a read then a write', async () => {
		const limiter = createRateLimiter('atomic', 2, 60_000);
		const slots = createSlotLimiter('atomic-slots', 2);
		await limiter.hit(logged.db, 'k', 0);
		await slots.acquire(logged.db, 'k', 0);
		for (const run of [
			() => limiter.hit(logged.db, 'k', 1), // an existing key
			() => limiter.hit(logged.db, 'k', 2), // refused
			() => slots.acquire(logged.db, 'k', 1)
		]) {
			const seen = await logged.statements(run);
			expect(seen).toHaveLength(1);
			expect(seen[0]).toMatch(
				/^insert into "payday"\."attempt_counter".* on conflict .* do update set .* where /is
			);
			expect(seen[0]).toMatch(/count\(\*\)/i); // the live count is judged inside the statement
		}
	});
});

describe('TSK-6DF544 housekeeping can never fail the call that was counted', () => {
	it('a cleanup that errors still counts the hit and hands out the slot', async () => {
		const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
		// A database whose raw `execute` always fails: only the cleanup uses it.
		const broken = new Proxy(db, {
			get: (target, prop, receiver) =>
				prop === 'execute'
					? () => {
							throw new Error('cleanup broke');
						}
					: Reflect.get(target, prop, receiver)
		});
		const limiter = createRateLimiter('broken', 2, 60_000);
		const slots = createSlotLimiter('broken-slots', 1);
		expect(await limiter.hit(broken, 'new-key', 0)).toBe(true);
		const release = await slots.acquire(broken, 'new-key', 0);
		expect(release).not.toBeNull();
		await release!(); // not leaked: the place comes back
		expect(await slots.acquire(db, 'new-key', 1)).not.toBeNull();
		expect(quiet).toHaveBeenCalled();
		quiet.mockRestore();
	});

	it('a new key still sweeps an expired one', async () => {
		const limiter = createRateLimiter('t', 5, 1000);
		await limiter.hit(db, 'stale', 0);
		await limiter.hit(db, 'fresh', 2000);
		expect(await limiter.size(db)).toBe(1);
	});
});

describe('TSK-6DF544 the cleanup statements skip locked rows', () => {
	const logged = loggedDatabase();
	it('both subqueries say FOR UPDATE SKIP LOCKED and the sweep repeats the expiry test', async () => {
		const limiter = createRateLimiter('shape', 5, 1000);
		const seen = await logged.statements(() => limiter.hit(logged.db, 'k', 0));
		const deletes = seen.filter((q) => /delete from "payday"\."attempt_counter"/i.test(q));
		expect(deletes).toHaveLength(2);
		for (const q of deletes) expect(q).toMatch(/for update skip locked/i);
		// The cap locks only the rows it deletes: a LIMIT of the excess, never an OFFSET.
		expect(deletes[1]).toMatch(/limit greatest\(0,/i);
		expect(deletes[1]).not.toMatch(/offset/i);
		expect(deletes[0]).toMatch(/"until" <= \$\d+::bigint.*"until" <= \$\d+::bigint/is);
	});
});

describe('TSK-6DF544 the row cap evicts the least recently touched keys', () => {
	it('trims down to maxKeys, oldest first, and keeps the newest', async () => {
		const limiter = createRateLimiter('cap', 1, 60_000, 4);
		for (let i = 0; i < 12; i++) await limiter.recordFailure(db, `10.2.0.${i}`, i);
		expect(await limiter.size(db)).toBe(4);
		for (const i of [8, 9, 10, 11])
			expect(await limiter.isLimited(db, `10.2.0.${i}`, 12)).toBe(true);
		for (const i of [0, 1, 7]) expect(await limiter.isLimited(db, `10.2.0.${i}`, 12)).toBe(false);
	});
});
