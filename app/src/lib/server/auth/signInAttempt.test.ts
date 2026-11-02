import { describe, expect, it } from 'vitest';
import { createRateLimiter, createSlotLimiter } from './rateLimit.ts';
import { beginAttempt } from './signInAttempt.ts';

describe('TSK-2F1582 an attempt is charged and given a place at entry', () => {
	it('stops a burst at the limit before any of it has failed', () => {
		const limiter = createRateLimiter(10, 60_000);
		const slots = createSlotLimiter(100);
		const open = Array.from({ length: 12 }, () => beginAttempt('1.2.3.4', limiter, slots));
		// Nothing has finished or failed, yet only 10 got in.
		expect(open.filter((a) => a.ok)).toHaveLength(10);
		expect(open.slice(10).every((a) => !a.ok)).toBe(true);
		expect(beginAttempt('5.6.7.8', limiter, slots).ok).toBe(true);
	});

	it('lets one address hold only 2 places, so the owner always gets in', () => {
		const limiter = createRateLimiter(10, 60_000);
		const slots = createSlotLimiter(2);
		const first = beginAttempt('1.2.3.4', limiter, slots);
		const second = beginAttempt('1.2.3.4', limiter, slots);
		expect(first.ok && second.ok).toBe(true);
		expect(beginAttempt('1.2.3.4', limiter, slots).ok).toBe(false);
		expect(beginAttempt('9.9.9.9', limiter, slots).ok).toBe(true);
		if (first.ok) first.done(false);
		expect(beginAttempt('1.2.3.4', limiter, slots).ok).toBe(true);
	});

	it('keeps the charge for a failure and refunds it for a success, releasing the place either way', () => {
		const limiter = createRateLimiter(2, 60_000);
		const slots = createSlotLimiter(2);
		for (let i = 0; i < 2; i++) {
			const a = beginAttempt('1.2.3.4', limiter, slots);
			if (a.ok) a.done(false);
		}
		expect(beginAttempt('1.2.3.4', limiter, slots).ok).toBe(false); // two failures used the limit
		const ok = beginAttempt('5.5.5.5', limiter, slots);
		if (ok.ok) ok.done(true);
		if (ok.ok) ok.done(true); // a second call changes nothing
		expect(limiter.isLimited('5.5.5.5')).toBe(false);
		expect(slots.size()).toBe(0);
	});
});
