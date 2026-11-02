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
 * roughly 20 guesses a minute per connection, however many addresses they own, and each wait ties
 * up one of the server's few hash slots. The count forgets failures older than the window.
 * In memory, like the other limits: one machine, and a restart only ever helps the owner.
 */
export type FailureBrake = {
	recordFailure(now?: number): void;
	/** How long the next attempt should wait before being checked, in milliseconds. */
	delayMs(now?: number): number;
	/** Waits `delayMs()`; resolves straight away when there is nothing to wait for. */
	wait(now?: number): Promise<void>;
	count(now?: number): number;
};

export const BRAKE_WINDOW_MS = 5 * 60 * 1000;
/** Failures this many in the window cost nothing: the owner's own typos. */
export const BRAKE_FREE_FAILURES = 5;
export const BRAKE_STEP_MS = 100;
export const BRAKE_MAX_MS = 3000;

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
	let failures: number[] = [];
	// Past this many the delay is already at its ceiling, so older ones add nothing worth keeping.
	const keep = free + Math.ceil(maxMs / stepMs) + 1;

	const recent = (now: number) => {
		failures = failures.filter((at) => now - at < windowMs);
		return failures.length;
	};
	const delayMs = (now = Date.now()) => Math.min(maxMs, Math.max(0, recent(now) - free) * stepMs);

	return {
		recordFailure(now = Date.now()) {
			recent(now);
			failures.push(now);
			if (failures.length > keep) failures = failures.slice(-keep);
		},
		delayMs,
		async wait(now = Date.now()) {
			const ms = delayMs(now);
			if (ms > 0) await sleep(ms);
		},
		count: (now = Date.now()) => recent(now)
	};
}

export const failureBrake = createFailureBrake();
