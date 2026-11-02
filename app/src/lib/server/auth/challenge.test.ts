import { describe, expect, it } from 'vitest';
import { CHALLENGE_TTL_MS, createChallengeStore } from './challenge.ts';

const T0 = new Date('2026-11-01T08:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);

describe('TSK-D7D015 challenges are single use and short lived', () => {
	it('can be consumed once, and only for the purpose it was made for', () => {
		const store = createChallengeStore();
		const id = store.save('authenticate', 'abc', T0);
		expect(store.consume(id, 'register', T0)).toBeNull();
		// The wrong-purpose attempt used it up as well.
		expect(store.consume(id, 'authenticate', T0)).toBeNull();

		const again = store.save('authenticate', 'abc', T0);
		expect(store.consume(again, 'authenticate', T0)).toBe('abc');
		expect(store.consume(again, 'authenticate', T0)).toBeNull();
	});

	it('is valid for 5 minutes and not a moment longer', () => {
		const store = createChallengeStore();
		const ok = store.save('register', 'c1', T0);
		expect(store.consume(ok, 'register', after(CHALLENGE_TTL_MS - 1))).toBe('c1');

		const late = store.save('register', 'c2', T0);
		expect(store.consume(late, 'register', after(CHALLENGE_TTL_MS))).toBeNull();
		expect(store.consume('unknown', 'register', T0)).toBeNull();
	});

	it('can be bound to a session, and is refused to any other', () => {
		const store = createChallengeStore();
		const id = store.save('step-up', 'c', T0, 'session-a');
		expect(store.consume(id, 'step-up', T0, 'session-b')).toBeNull();
		const mine = store.save('step-up', 'c', T0, 'session-a');
		expect(store.consume(mine, 'step-up', T0, 'session-a')).toBe('c');
	});
});

describe('TSK-D7D015 the challenge store cannot be grown without bound', () => {
	it('holds at most the cap, evicting the oldest first', () => {
		const store = createChallengeStore(3);
		const ids = [0, 1, 2, 3, 4].map((i) => store.save('authenticate', `c${i}`, after(i)));
		expect(store.size()).toBe(3);
		expect(store.consume(ids[0], 'authenticate', after(5))).toBeNull();
		expect(store.consume(ids[1], 'authenticate', after(5))).toBeNull();
		expect(store.consume(ids[4], 'authenticate', after(5))).toBe('c4');
	});

	it('drops expired entries as new ones arrive', () => {
		const store = createChallengeStore(200);
		for (let i = 0; i < 50; i++) store.save('authenticate', 'x', T0);
		store.save('authenticate', 'y', after(CHALLENGE_TTL_MS + 1));
		expect(store.size()).toBe(1);
	});
});
