/**
 * Counts attempts per key (an IP address) in memory. One machine and one owner, so nothing shared
 * is needed; a restart forgetting the count only ever helps the owner.
 */
export type RateLimiter = {
	/** True when the key has already hit the limit in the window. */
	isLimited(key: string, now?: number): boolean;
	recordFailure(key: string, now?: number): void;
	/** Counts one request: false (and nothing counted) when the key is already at the limit. */
	hit(key: string, now?: number): boolean;
	/** Gives back one count made by `hit` (a success does not cost the owner a try). */
	refund(key: string): void;
	/** Forgets every key whose attempts have all aged out. The timer calls it; so can a test. */
	sweep(now?: number): void;
	size(): number;
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
	max = 10,
	windowMs = 60_000,
	maxKeys = 5000,
	v6Bits: 48 | 64 = 64
): RateLimiter {
	const keyOf = (address: string) => limiterKey(address, v6Bits);
	const attempts = new Map<string, number[]>();

	const recent = (key: string, now: number) => {
		const kept = (attempts.get(key) ?? []).filter((at) => now - at < windowMs);
		if (kept.length) attempts.set(key, kept);
		else attempts.delete(key);
		return kept;
	};

	const add = (key: string, now: number) => {
		const kept = recent(key, now);
		// Re-inserting moves the key to the end, so the oldest-touched key is always first.
		attempts.delete(key);
		attempts.set(key, [...kept, now]);
		// A flood of distinct addresses must not grow the map: drop the least recently touched.
		while (attempts.size > maxKeys) attempts.delete(attempts.keys().next().value as string);
	};

	const sweep = (now = Date.now()) => {
		for (const key of [...attempts.keys()]) recent(key, now);
	};

	// Not on every failure: that made one bad request pay for a scan of the whole map.
	setInterval(sweep, Math.max(windowMs, 1000)).unref();

	return {
		isLimited: (rawKey, now = Date.now()) => recent(keyOf(rawKey), now).length >= max,
		recordFailure: (rawKey, now = Date.now()) => add(keyOf(rawKey), now),
		hit(rawKey, now = Date.now()) {
			const key = keyOf(rawKey);
			if (recent(key, now).length >= max) return false;
			add(key, now);
			return true;
		},
		refund(rawKey) {
			const key = keyOf(rawKey);
			const kept = attempts.get(key);
			if (!kept) return;
			kept.pop();
			if (!kept.length) attempts.delete(key);
		},
		sweep,
		size: () => attempts.size
	};
}

/**
 * Shared by every sign-in, recovery-code and confirm attempt: 10 a minute per IP (IPv6 by /48).
 * An attempt is charged when it ENTERS, before it waits for the brake or the hash queue, so a burst
 * cannot get past the limit while its first attempts are still queued. A success is refunded.
 */
export const signInFailures = createRateLimiter(10, 60_000, 5000, 48);

/**
 * How many password checks one address may have waiting or running at once. The hash queue has 16
 * places; if one address could hold them all the owner would be turned away with a 503.
 */
export const MAX_SLOTS_PER_ADDRESS = 2;

export type SlotLimiter = {
	/** A release function, or null when this address already holds its share. */
	acquire(address: string): (() => void) | null;
	size(): number;
};

export function createSlotLimiter(max = MAX_SLOTS_PER_ADDRESS, v6Bits: 48 | 64 = 48): SlotLimiter {
	const held = new Map<string, number>();
	return {
		acquire(address) {
			const key = limiterKey(address, v6Bits);
			const n = held.get(key) ?? 0;
			if (n >= max) return null;
			held.set(key, n + 1);
			let released = false;
			return () => {
				if (released) return;
				released = true;
				const left = (held.get(key) ?? 1) - 1;
				if (left > 0) held.set(key, left);
				else held.delete(key);
			};
		},
		size: () => held.size
	};
}

export const signInSlots = createSlotLimiter();

/** The options endpoints are open to anyone, so every request counts, not just failures. */
export const optionsRequests = createRateLimiter(20, 60_000);
