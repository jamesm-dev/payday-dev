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
import { accountBrake, BRAKE_MAX_MS } from './failureBrake.ts';
import {
	ADDRESS_FAILURES_MAX,
	ADDRESS_PASSES_PER_MINUTE,
	MAX_PASSWORD_SLOTS_PER_ADDRESS,
	RECOVERY_PASSES_PER_MINUTE
} from './rateLimit.ts';
import {
	ACCOUNT_CALM_FAILURES,
	beginAttempt,
	beginPasskeyAttempt,
	beginRecoveryAttempt,
	beginSignInAttempt,
	hashQueue
} from './signInAttempt.ts';
import { accountKeyOf } from './signInLookup.ts';
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

/** One wrong password for `account` from `address`, as the sign-in action would count it. */
async function wrong(db: Db, address: string, account: string) {
	const attempt = await beginSignInAttempt(db, address, account);
	if (attempt.ok) await attempt.done(false);
	return attempt;
}

describe('TSK-8fcc17 one person cannot lock out another on a shared address', () => {
	const X = accountKeyOf('x@example.com');
	const Y = accountKeyOf('y@example.com');

	it("X's typos from an address never stop Y's right password from the same address", async () => {
		for (let i = 0; i < ADDRESS_FAILURES_MAX - 1; i++) {
			expect((await wrong(db, '5.5.5.5', X)).ok).toBe(true);
		}
		// A right password costs nothing: Y can sign in again and again.
		for (let i = 0; i < 30; i++) {
			const y = await beginSignInAttempt(db, '5.5.5.5', Y);
			expect(y.ok).toBe(true);
			if (y.ok) await y.done(true);
		}
	});

	it("keeps Y's right password working past the address limit while Y's own failures are low", async () => {
		for (let i = 0; i < ADDRESS_FAILURES_MAX; i++) await wrong(db, '6.6.6.6', X);
		// Past the limit, X (whose account is being guessed) is held back, but Y is let through, and a
		// right password gives its place back, so Y never uses the few places up.
		expect((await beginSignInAttempt(db, '6.6.6.6', X)).ok).toBe(false);
		for (let i = 0; i < ADDRESS_PASSES_PER_MINUTE + 10; i++) {
			const y = await beginSignInAttempt(db, '6.6.6.6', Y);
			expect(y.ok).toBe(true);
			if (y.ok) await y.done(true);
		}
		// Another address was never affected.
		expect((await beginSignInAttempt(db, '7.7.7.7', X)).ok).toBe(true);
	});

	it('only slows an account that many addresses guess at: it never refuses it', async () => {
		for (let i = 0; i < 60; i++) expect((await wrong(db, `10.0.0.${i}`, X)).ok).toBe(true);
		// Slowed to the ceiling ...
		expect(await accountBrake.delayMs(db, X)).toBe(BRAKE_MAX_MS);
		// ... but the next try, from a new address, is still taken, and a right password still works.
		const right = await beginSignInAttempt(db, '10.0.1.1', X);
		expect(right.ok).toBe(true);
		if (right.ok) await right.done(true);
		// And Y, untouched, is not slowed at all.
		expect(await accountBrake.delayMs(db, Y)).toBe(0);
	});

	it('still limits an attacker who sprays many accounts from one address', async () => {
		// One wrong guess per account: no account is ever "hot", so only the address can stop this.
		for (let i = 0; i < ADDRESS_FAILURES_MAX; i++) {
			expect((await wrong(db, '8.8.8.8', accountKeyOf(`victim${i}@example.com`))).ok).toBe(true);
		}
		// Past the limit only a few more guesses a minute get through ...
		let allowed = 0;
		for (let i = 0; i < ADDRESS_PASSES_PER_MINUTE + 15; i++) {
			if ((await wrong(db, '8.8.8.8', accountKeyOf(`more${i}@example.com`))).ok) allowed++;
		}
		expect(allowed).toBe(ADDRESS_PASSES_PER_MINUTE);
		// ... and an account that is already being guessed gets none.
		for (let i = 0; i < ACCOUNT_CALM_FAILURES; i++) await accountBrake.recordFailure(db, X);
		expect(await beginSignInAttempt(db, '8.8.8.8', X)).toEqual({ ok: false, reason: 'limit' });
	});

	it('lets an address hold only its few places, so it can never fill the queue', async () => {
		const held = await Promise.all(
			Array.from({ length: MAX_PASSWORD_SLOTS_PER_ADDRESS }, () =>
				beginSignInAttempt(db, '9.9.9.9', Y)
			)
		);
		expect(held.every((a) => a.ok)).toBe(true);
		expect((await beginSignInAttempt(db, '9.9.9.9', Y)).ok).toBe(false);
		for (const a of held) if (a.ok) await a.done(true);
		expect((await beginSignInAttempt(db, '9.9.9.9', Y)).ok).toBe(true);
	});

	it('answers busy, giving back everything, when the hash queue is full', async () => {
		const queue = createGlobalSlots('q', 1);
		await queue.acquire(db, 'x');
		const attempt = await beginSignInAttempt(db, '1.1.1.1', Y, { queue });
		expect(attempt).toEqual({ ok: false, reason: 'busy' });
		// The address place went back.
		expect(
			(await beginSignInAttempt(db, '1.1.1.1', Y, { queue: createGlobalSlots('q2', 5) })).ok
		).toBe(true);
	});
});

describe('TSK-8fcc17 recovery codes and passkey confirmations count failures after the answer', () => {
	const Z = accountKeyOf('z@example.com');

	/** One wrong recovery code from `address`. */
	async function wrongCode(address: string) {
		const attempt = await beginRecoveryAttempt(db, address);
		if (attempt.ok) await attempt.done(false);
		return attempt;
	}

	it("one person's wrong recovery codes never stop another's right one on the same address", async () => {
		for (let i = 0; i < ADDRESS_FAILURES_MAX - 1; i++)
			expect((await wrongCode('4.4.4.4')).ok).toBe(true);
		for (let i = 0; i < 30; i++) {
			const right = await beginRecoveryAttempt(db, '4.4.4.4');
			expect(right.ok).toBe(true);
			if (right.ok) await right.done(true);
		}
	});

	it('lets only a few checks a minute through past the threshold, so a sprayer stays held', async () => {
		for (let i = 0; i < ADDRESS_FAILURES_MAX; i++) await wrongCode('4.4.4.5');
		let allowed = 0;
		for (let i = 0; i < RECOVERY_PASSES_PER_MINUTE + 15; i++) {
			if ((await wrongCode('4.4.4.5')).ok) allowed++;
		}
		expect(allowed).toBe(RECOVERY_PASSES_PER_MINUTE);
		// A right code gives its place back, so a person with a right code gets through while places last.
		expect((await beginRecoveryAttempt(db, '4.4.4.6')).ok).toBe(true);
	});

	it('does not touch the password counters', async () => {
		for (let i = 0; i < ADDRESS_FAILURES_MAX + 5; i++) await wrongCode('4.4.4.7');
		expect((await beginSignInAttempt(db, '4.4.4.7', Z)).ok).toBe(true);
		// And it takes no place in the hash queue: with every place held, a recovery code still gets in.
		const full = await hashQueue.acquire(db, 'x');
		expect(full).not.toBeNull();
		expect((await beginRecoveryAttempt(db, '4.4.4.8')).ok).toBe(true);
	});

	it("one person's wrong passkeys never stop another's right one on the same address, and only slow the account", async () => {
		for (let i = 0; i < ADDRESS_FAILURES_MAX - 1; i++) {
			const a = await beginPasskeyAttempt(db, '3.3.3.3', Z);
			expect(a.ok).toBe(true);
			if (a.ok) await a.done(false);
		}
		const right = await beginPasskeyAttempt(db, '3.3.3.3', accountKeyOf('w@example.com'));
		expect(right.ok).toBe(true);
		if (right.ok) await right.done(true);
		// Z's own failures slow Z (a delay), they never refuse it from a quiet address.
		expect(await accountBrake.delayMs(db, Z)).toBe(BRAKE_MAX_MS);
		expect((await beginPasskeyAttempt(db, '3.3.3.4', Z)).ok).toBe(true);
	});
});
