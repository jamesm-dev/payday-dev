import type { Db } from '#lib/server/db/open.ts';
import * as counter from './attemptCounter.ts';

/*
 * The global failure brake.
 *
 * The per-IP limit (rateLimit.ts) stops one address guessing. It does nothing against guessing
 * spread over many addresses. The brake counts wrong passwords and wrong recovery codes from ALL
 * addresses over the last few minutes, and every password or recovery attempt then waits a short
 * while before it is checked: nothing for the first few failures, then 100 ms more per failure,
 * never more than 3 seconds.
 *
 * It is a delay, not a lock. The owner who types the right password during an attack waits at
 * most 3 seconds, so no one can lock the owner out by failing on purpose; a guesser is held to
 * roughly 20 guesses a minute per connection, however many addresses they own, and each wait holds
 * one of the database-backed hash-queue places (signInAttempt.ts) for its whole length. The count forgets failures older than the window.
 * The count is kept in the database (attemptCounter.ts), one row for all addresses, so every
 * function instance sees the same failures.
 */
export type FailureBrake = {
	recordFailure(db: Db, now?: number): Promise<void>;
	/** How long the next attempt should wait before being checked, in milliseconds. */
	delayMs(db: Db, now?: number): Promise<number>;
	/** Waits `delayMs()`; resolves straight away when there is nothing to wait for. */
	wait(db: Db, now?: number): Promise<void>;
	count(db: Db, now?: number): Promise<number>;
};

export const BRAKE_WINDOW_MS = 5 * 60 * 1000;
/** Failures this many in the window cost nothing: the owner's own typos. */
export const BRAKE_FREE_FAILURES = 5;
export const BRAKE_STEP_MS = 100;
export const BRAKE_MAX_MS = 3000;

const SCOPE = 'failure-brake';
/** Every address shares the one count. */
const KEY = 'all';

export function createFailureBrake({
	windowMs = BRAKE_WINDOW_MS,
	free = BRAKE_FREE_FAILURES,
	stepMs = BRAKE_STEP_MS,
	maxMs = BRAKE_MAX_MS,
	sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
}: {
	windowMs?: number;
	free?: number;
	stepMs?: number;
	maxMs?: number;
	sleep?: (ms: number) => Promise<void>;
} = {}): FailureBrake {
	// Past this many the delay is already at its ceiling, so older ones add nothing worth keeping.
	const keep = free + Math.ceil(maxMs / stepMs) + 1;

	const count = (db: Db, now = Date.now()) => counter.live(db, SCOPE, KEY, now);
	const delayMs = async (db: Db, now = Date.now()) =>
		Math.min(maxMs, Math.max(0, (await count(db, now)) - free) * stepMs);

	return {
		async recordFailure(db, now = Date.now()) {
			await counter.count(db, SCOPE, KEY, { now, ttlMs: windowMs, keep, maxKeys: 1 });
		},
		delayMs,
		async wait(db, now = Date.now()) {
			const ms = await delayMs(db, now);
			if (ms > 0) await sleep(ms);
		},
		count
	};
}

export const failureBrake = createFailureBrake();
