import { signInFailures, signInSlots, type RateLimiter, type SlotLimiter } from './rateLimit.ts';

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
 * `done(true)` after a success gives the charge back; either way the slot is released. Call `done`
 * exactly once, in a `finally`.
 */
export type Attempt = { ok: true; done: (success: boolean) => void } | { ok: false };

export function beginAttempt(
	address: string,
	limiter: RateLimiter = signInFailures,
	slots: SlotLimiter = signInSlots
): Attempt {
	const release = slots.acquire(address);
	if (!release) return { ok: false };
	if (!limiter.hit(address)) {
		release();
		return { ok: false };
	}
	let finished = false;
	return {
		ok: true,
		done(success) {
			if (finished) return;
			finished = true;
			release();
			if (success) limiter.refund(address);
		}
	};
}

export const TOO_MANY = 'Too many tries. Wait a minute, then try again.';
export const PASSWORD_CHANGED = 'Your password was just changed. Sign in again with the new one.';
