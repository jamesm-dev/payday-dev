import { describe, expect, it } from 'vitest';
import { createRateLimiter, createSlotLimiter, limiterKey } from './rateLimit.ts';

describe('TSK-E31665 failed sign-ins are rate limited per IP', () => {
	it('blocks an address after 10 failures in a minute, and only that address', () => {
		const limiter = createRateLimiter(10, 60_000);
		for (let i = 0; i < 9; i++) limiter.recordFailure('1.1.1.1', 1000 + i);
		expect(limiter.isLimited('1.1.1.1', 2000)).toBe(false);
		limiter.recordFailure('1.1.1.1', 2000);
		expect(limiter.isLimited('1.1.1.1', 2001)).toBe(true);
		expect(limiter.isLimited('2.2.2.2', 2001)).toBe(false);
	});

	it('forgets failures once the window has passed', () => {
		const limiter = createRateLimiter(2, 60_000);
		limiter.recordFailure('a', 0);
		limiter.recordFailure('a', 1);
		expect(limiter.isLimited('a', 30_000)).toBe(true);
		expect(limiter.isLimited('a', 61_000)).toBe(false);
	});
});

describe('TSK-E31665 the limiter keys IPv6 by /64 and cannot grow without bound', () => {
	it('treats every address in one /64 as the same client', () => {
		expect(limiterKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(
			limiterKey('2001:0db8:0001:0002::1')
		);
		expect(limiterKey('2001:db8:1:3::1')).not.toBe(limiterKey('2001:db8:1:2::1'));
		expect(limiterKey('::1')).toBe('0000:0000:0000:0000::/64');
		expect(limiterKey('203.0.113.9')).toBe('203.0.113.9');
		expect(limiterKey('::ffff:203.0.113.9')).toBe('203.0.113.9');

		const limiter = createRateLimiter(2, 60_000);
		limiter.recordFailure('2001:db8:1:2::1', 0);
		limiter.recordFailure('2001:db8:1:2::2', 1);
		expect(limiter.isLimited('2001:db8:1:2:ffff::9', 2)).toBe(true);
		expect(limiter.isLimited('2001:db8:1:9::1', 2)).toBe(false);
	});

	it('holds at most maxKeys keys, dropping the least recently touched', () => {
		const limiter = createRateLimiter(1, 60_000, 3);
		for (let i = 0; i < 10; i++) limiter.recordFailure(`10.0.0.${i}`, i);
		expect(limiter.size()).toBe(3);
		expect(limiter.isLimited('10.0.0.0', 10)).toBe(false);
		expect(limiter.isLimited('10.0.0.9', 10)).toBe(true);
	});

	it('sweeps expired keys only when asked, not on every failure', () => {
		const limiter = createRateLimiter(5, 1000);
		for (let i = 0; i < 20; i++) limiter.recordFailure(`10.0.1.${i}`, 0);
		limiter.recordFailure('10.0.2.1', 5000);
		// No sweep ran in between, so the stale keys are still held...
		expect(limiter.size()).toBe(21);
		limiter.sweep(5001);
		expect(limiter.size()).toBe(1);
	});

	it('hit() counts a request and refuses once the limit is reached', () => {
		const limiter = createRateLimiter(2, 1000);
		expect(limiter.hit('a', 0)).toBe(true);
		expect(limiter.hit('a', 1)).toBe(true);
		expect(limiter.hit('a', 2)).toBe(false);
		expect(limiter.hit('a', 1500)).toBe(true);
	});
});

describe('TSK-2F1582 the sign-in limiters', () => {
	it('keys IPv6 by /48 when asked, and /64 otherwise', () => {
		expect(limiterKey('2001:db8:1:2::1', 48)).toBe(limiterKey('2001:db8:1:ffff::9', 48));
		expect(limiterKey('2001:db8:1:2::1', 48)).toBe('2001:0db8:0001::/48');
		expect(limiterKey('2001:db8:2:2::1', 48)).not.toBe(limiterKey('2001:db8:1:2::1', 48));
		expect(limiterKey('2001:db8:1:2::1')).not.toBe(limiterKey('2001:db8:1:3::1'));
		expect(limiterKey('203.0.113.9', 48)).toBe('203.0.113.9');

		const signIn = createRateLimiter(2, 60_000, 5000, 48);
		signIn.hit('2001:db8:1:2::1', 0);
		signIn.hit('2001:db8:1:9::5', 0);
		expect(signIn.isLimited('2001:db8:1:abcd::7', 1)).toBe(true);
		// The shared sign-in limiter is a /48 limiter; the options limiter stays /64.
		const options = createRateLimiter(1, 60_000);
		options.hit('2001:db8:1:2::1', 0);
		expect(options.isLimited('2001:db8:1:3::1', 1)).toBe(false);
	});

	it('refunds one count, and never goes below zero', () => {
		const limiter = createRateLimiter(2, 60_000);
		limiter.refund('a');
		expect(limiter.hit('a', 0)).toBe(true);
		expect(limiter.hit('a', 1)).toBe(true);
		expect(limiter.hit('a', 2)).toBe(false);
		limiter.refund('a');
		expect(limiter.hit('a', 3)).toBe(true);
	});

	it('caps the slots one address may hold, by /48 for IPv6, and frees them on release', () => {
		const slots = createSlotLimiter(2);
		const a = slots.acquire('2001:db8:1:1::1');
		const b = slots.acquire('2001:db8:1:2::1');
		expect(a && b).toBeTruthy();
		expect(slots.acquire('2001:db8:1:3::1')).toBeNull();
		expect(slots.acquire('2001:db8:2::1')).not.toBeNull();
		a!();
		a!(); // releasing twice frees only one
		const c = slots.acquire('2001:db8:1:4::1');
		expect(c).not.toBeNull();
		expect(slots.acquire('2001:db8:1:5::1')).toBeNull();
		b!();
		c!();
	});
});
