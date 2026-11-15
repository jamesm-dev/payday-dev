import type { Db } from '#lib/server/db/open.ts';
import * as counter from './attemptCounter.ts';

/*
 * The sign-in limits are kept in the database (attemptCounter.ts), not in memory: on Netlify every
 * request may run in a fresh function instance, and a limit that each instance counts for itself is
 * no limit. Each call is one atomic statement, so two attempts at once cannot both pass a limit
 * meant for one. Nothing here holds state of its own; two limiters built with the same scope share
 * their counts through the database, which is exactly how two function instances do.
 */
export type RateLimiter = {
	/** True when the key has already hit the limit in the window. */
	isLimited(db: Db, key: string, now?: number): Promise<boolean>;
	recordFailure(db: Db, key: string, now?: number): Promise<void>;
	/** Counts one request: false (and nothing counted) when the key is already at the limit. */
	hit(db: Db, key: string, now?: number): Promise<boolean>;
	/** Gives back one count made by `hit` (a success does not cost the owner a try). */
	refund(db: Db, key: string): Promise<void>;
	/** Deletes every key whose attempts have all aged out. Requests only sweep a bounded batch. */
	sweep(db: Db, now?: number): Promise<void>;
	/** How many keys the scope holds (rows, expired or not). */
	size(db: Db): Promise<number>;
};

/**
 * An IPv4 address is its own key. An IPv6 address is keyed by its /64 (or the wider prefix asked
 * for), because one machine or subscriber is handed a whole /64 and could otherwise change address
 * on every try. The sign-in limiters use /48, the size of a typical site allocation.
 */
export function limiterKey(address: string, v6Bits: 48 | 64 = 64): string {
	const ip = address.trim().toLowerCase().replace(/%.*$/, '');
	if (!ip.includes(':')) return ip;
	const mapped = /^(?:0{0,4}:){2,5}ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
	if (mapped) return mapped[1];

	const [head, tail, ...extra] = ip.split('::');
	if (extra.length) return ip;
	const left = head ? head.split(':') : [];
	const right = tail ? tail.split(':') : [];
	const fill = tail === undefined ? 0 : Math.max(0, 8 - left.length - right.length);
	const groups = [...left, ...Array<string>(fill).fill('0'), ...right];
	if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return ip;
	const kept = v6Bits / 16;
	return `${groups
		.slice(0, kept)
		.map((g) => g.padStart(4, '0'))
		.join(':')}::/${v6Bits}`;
}

export function createRateLimiter(
	scope: string,
	max = 10,
	windowMs = 60_000,
	maxKeys = 5000,
	v6Bits: 48 | 64 = 64
): RateLimiter {
	const keyOf = (address: string) => limiterKey(address, v6Bits);
	const add = (db: Db, key: string, now: number, limit?: number) =>
		counter.count(db, scope, keyOf(key), { now, ttlMs: windowMs, keep: max, max: limit, maxKeys });

	return {
		async isLimited(db, key, now = Date.now()) {
			return (await counter.live(db, scope, keyOf(key), now)) >= max;
		},
		async recordFailure(db, key, now = Date.now()) {
			await add(db, key, now);
		},
		async hit(db, key, now = Date.now()) {
			return (await add(db, key, now, max)).counted;
		},
		refund: (db, key) => counter.popNewest(db, scope, keyOf(key)),
		sweep: (db, now = Date.now()) => counter.sweep(db, scope, now),
		size: (db) => counter.rows(db, scope)
	};
}

/**
 * Shared by every sign-in, recovery-code and confirm attempt: 10 a minute per IP (IPv6 by /48).
 * An attempt is charged when it ENTERS, before it waits for the brake or the hash queue, so a burst
 * cannot get past the limit while its first attempts are still queued. A success is refunded.
 */
export const signInFailures = createRateLimiter('sign-in-failures', 10, 60_000, 5000, 48);

/**
 * How many password checks one address may have waiting or running at once. The hash queue has 16
 * places; if one address could hold them all the owner would be turned away with a 503.
 */
export const MAX_SLOTS_PER_ADDRESS = 2;

/**
 * A slot is leased, not held forever: a function that is frozen or killed between taking a slot and
 * giving it back must not leave the address one place short for good. The queue's longest wait (16
 * places, the brake's 3 seconds) is far under this.
 */
export const SLOT_LEASE_MS = 60_000;

export type SlotLimiter = {
	/** A release function, or null when this address already holds its share. */
	acquire(db: Db, address: string, now?: number): Promise<(() => Promise<void>) | null>;
	size(db: Db): Promise<number>;
};

export function createSlotLimiter(
	scope = 'sign-in-slots',
	max = MAX_SLOTS_PER_ADDRESS,
	v6Bits: 48 | 64 = 48,
	leaseMs = SLOT_LEASE_MS,
	maxKeys = 5000
): SlotLimiter {
	return {
		async acquire(db, address, now = Date.now()) {
			const key = limiterKey(address, v6Bits);
			const got = await counter.count(db, scope, key, {
				now,
				ttlMs: leaseMs,
				keep: max,
				max,
				maxKeys
			});
			if (!got.counted) return null;
			let released = false;
			return async () => {
				if (released) return;
				released = true;
				await counter.removeStamp(db, scope, key, got.stamp);
			};
		},
		size: (db) => counter.rows(db, scope)
	};
}

export const signInSlots = createSlotLimiter();

/**
 * Leased places shared by EVERY address: one row (key 'all'), at most `max` held at once. This is the
 * global ceiling on password checks (ADR-0010) that the per-process queue in password.ts cannot give
 * once each request may run in a different function instance.
 */
export function createGlobalSlots(
	scope: string,
	max: number,
	leaseMs = SLOT_LEASE_MS
): SlotLimiter {
	return {
		async acquire(db, _address, now = Date.now()) {
			const got = await counter.count(db, scope, 'all', {
				now,
				ttlMs: leaseMs,
				keep: max,
				max,
				maxKeys: 1
			});
			if (!got.counted) return null;
			let released = false;
			return async () => {
				if (released) return;
				released = true;
				await counter.removeStamp(db, scope, 'all', got.stamp);
			};
		},
		size: (db) => counter.rows(db, scope)
	};
}

/** The options endpoints are open to anyone, so every request counts, not just failures. */
export const optionsRequests = createRateLimiter('options-requests', 20, 60_000);

/*
 * The limits a PASSWORD sign-in uses (signInAttempt.ts, beginSignInAttempt). Many people share one
 * address (a mobile network gives hundreds of phones the same IPv4), so what one person types wrong
 * must never turn another person's right password away.
 */

/**
 * Wrong passwords from one address in a minute (IPv6 by /48), over every account. The address is
 * refused only past this, a number a shared address reaches only when someone is guessing: a few
 * hundred people mistyping do not.
 */
export const ADDRESS_FAILURES_MAX = 100;
export const addressFailures = createRateLimiter(
	'sign-in-address-failures',
	ADDRESS_FAILURES_MAX,
	60_000,
	5000,
	48
);

/**
 * Past that number, a few checks a minute still go through, but only for an account that is not
 * itself being guessed. That is the person with the right password on a busy shared address, and
 * it also caps a sprayer (one guess per account, many accounts) at this many extra guesses a minute.
 * A right password gives its place back, so real people do not use it up; wrong guesses keep theirs.
 */
export const ADDRESS_PASSES_PER_MINUTE = 20;
export const addressPasses = createRateLimiter(
	'sign-in-address-passes',
	ADDRESS_PASSES_PER_MINUTE,
	60_000,
	5000,
	48
);

/**
 * How many password checks one address may have waiting or running at once: the same 2 as everywhere
 * else (ADR-0018), so one address can never fill the hash queue. On a shared address a third person
 * signing in within the same fraction of a second is told to try again; raising this is one number.
 */
export const MAX_PASSWORD_SLOTS_PER_ADDRESS = MAX_SLOTS_PER_ADDRESS;
export const passwordSlots = createSlotLimiter(
	'sign-in-password-slots',
	MAX_PASSWORD_SLOTS_PER_ADDRESS
);
