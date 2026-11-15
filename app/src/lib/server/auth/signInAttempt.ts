import { log } from '#lib/server/log.ts';
import type { Db } from '#lib/server/db/open.ts';
import { MAX_CONCURRENT, MAX_WAITING } from './password.ts';
import { accountBrake, type AccountBrake } from './failureBrake.ts';
import {
	addressFailures,
	addressPasses,
	createGlobalSlots,
	passwordSlots,
	signInFailures,
	signInSlots,
	type RateLimiter,
	type SlotLimiter
} from './rateLimit.ts';

/**
 * The door every password, recovery-code and confirm attempt goes through before anything slow
 * happens (the brake's wait, the hash queue).
 *
 * It does two things at ENTRY, not after the answer is known:
 *  - charges the attempt to the per-IP limiter, so a burst of attempts started together cannot all
 *    get in just because none has failed yet;
 *  - takes one of that address's few slots in the hash queue, so one address can never fill the
 *    queue and leave the owner with a 503.
 *
 *  - for a password check, takes one of the global hash-queue places (the same size as one
 *    instance's queue, but counted in the database), so the ceiling on password checks holds across
 *    function instances; when they are all taken the attempt is refused as `busy`, and the caller
 *    answers 503. A recovery code is a SHA-256 lookup, not a hash, so `beginRecoveryAttempt` takes
 *    no place and is never `busy` (ADR-0018).
 *
 * `done(true)` after a success gives the charge back; either way the slot is released. Call `done`
 * exactly once, in a `finally`.
 */
export type Attempt =
	{ ok: true; done: (success: boolean) => Promise<void> } | { ok: false; reason: 'limit' | 'busy' };

/** Every password check in flight or waiting, over all addresses and all function instances. */
export const hashQueue = createGlobalSlots('hash-queue', MAX_CONCURRENT + MAX_WAITING);

export async function beginAttempt(
	db: Db,
	address: string,
	limiter: RateLimiter = signInFailures,
	slots: SlotLimiter = signInSlots,
	queue: SlotLimiter = hashQueue
): Promise<Attempt> {
	const release = await slots.acquire(db, address);
	if (!release) return { ok: false, reason: 'limit' };
	if (!(await limiter.hit(db, address))) {
		await release();
		return { ok: false, reason: 'limit' };
	}
	const leave = await queue.acquire(db, address);
	if (!leave) {
		// Busy is not a guess: the attempt gives back everything it took.
		await release();
		await limiter.refund(db, address);
		return { ok: false, reason: 'busy' };
	}
	let finished = false;
	return {
		ok: true,
		async done(success) {
			if (finished) return;
			finished = true;
			// Independently: a failure giving back one must not leave the other held for its lease.
			const results = await Promise.allSettled([release(), leave()]);
			for (const r of results) {
				if (r.status === 'rejected') {
					log({ level: 'warn', msg: 'sign-in place not released', reason: String(r.reason) });
				}
			}
			if (success) await limiter.refund(db, address);
		}
	};
}

/** A queue that holds nothing, for checks that never reach scrypt. */
const noQueue: SlotLimiter = { acquire: async () => async () => {}, size: async () => 0 };

/**
 * The door for a recovery code. A recovery code is a SHA-256 lookup, never a scrypt hash, and the
 * hash queue (ADR-0010) covers password hashes only, so it takes no place in it: a flood of
 * password attempts must not also turn away the way back in. The per-address limit, the address
 * places and the brake apply exactly as for a password.
 */
export const beginRecoveryAttempt = (db: Db, address: string) =>
	beginAttempt(db, address, signInFailures, signInSlots, noQueue) as Promise<
		Extract<Attempt, { ok: true }> | { ok: false; reason: 'limit' }
	>;

/**
 * The door for a PASSWORD sign-in (and a password confirmation), where the address is often shared
 * by many people. It differs from `beginAttempt` in what it counts and when:
 *
 *  - It counts WRONG passwords, after the answer is known (`done(false)`), once per address and once
 *    per account. Nobody's attempt is charged to the address up front, so a person typing the right
 *    password is never what fills the address's count.
 *  - The address is refused only when it has made ADDRESS_FAILURES_MAX wrong guesses in a minute, a
 *    number a shared address reaches only when someone is guessing. Even then an account that is
 *    not being guessed itself (fewer than ACCOUNT_CALM_FAILURES recent wrong passwords) still gets
 *    ADDRESS_PASSES_PER_MINUTE checks a minute, and a right password gives its place back. So a
 *    right password gets through while its own account's failures are low, and a sprayer, who
 *    guesses once per account, is held to those few extra guesses.
 *  - An account's failures never refuse anything. They only slow that account (accountBrake), by at
 *    most 3 seconds, so nobody can lock a person out.
 *  - Places in flight are still limited per address (4, not 2) and in the hash queue, so a burst
 *    cannot overshoot the address's limit by more than the places it holds.
 *
 * Call `done` exactly once, in a `finally`.
 */
export const ACCOUNT_CALM_FAILURES = 3;

export type SignInDeps = {
	slots?: SlotLimiter;
	queue?: SlotLimiter;
	addressFailures?: RateLimiter;
	addressPasses?: RateLimiter;
	accountBrake?: AccountBrake;
};

export async function beginSignInAttempt(
	db: Db,
	address: string,
	accountKey: string,
	deps: SignInDeps = {}
): Promise<Attempt> {
	const slots = deps.slots ?? passwordSlots;
	const queue = deps.queue ?? hashQueue;
	const failures = deps.addressFailures ?? addressFailures;
	const passes = deps.addressPasses ?? addressPasses;
	const account = deps.accountBrake ?? accountBrake;

	const release = await slots.acquire(db, address);
	if (!release) return { ok: false, reason: 'limit' };

	let passed = false;
	if (await failures.isLimited(db, address)) {
		const calm = (await account.count(db, accountKey)) < ACCOUNT_CALM_FAILURES;
		if (!calm || !(await passes.hit(db, address))) {
			await release();
			return { ok: false, reason: 'limit' };
		}
		passed = true;
	}
	const leave = await queue.acquire(db, address);
	if (!leave) {
		await release();
		if (passed) await passes.refund(db, address);
		return { ok: false, reason: 'busy' };
	}
	let finished = false;
	return {
		ok: true,
		async done(success) {
			if (finished) return;
			finished = true;
			const results = await Promise.allSettled([release(), leave()]);
			for (const r of results) {
				if (r.status === 'rejected') {
					log({ level: 'warn', msg: 'sign-in place not released', reason: String(r.reason) });
				}
			}
			if (success) {
				if (passed) await passes.refund(db, address);
			} else {
				await failures.recordFailure(db, address);
				await account.recordFailure(db, accountKey);
			}
		}
	};
}

export const TOO_MANY = 'Too many tries. Wait a minute, then try again.';
export const PASSWORD_CHANGED = 'Your password was just changed. Sign in again with the new one.';
