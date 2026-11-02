import { describe, expect, it } from 'vitest';
import { createOneTimeSlot } from './oneTimeSlot.ts';

describe('TSK-2F1582 new recovery codes are shown once', () => {
	it('gives the value to the first read and nothing to the second', () => {
		const slot = createOneTimeSlot<string[]>(1000);
		slot.put('s', ['A', 'B'], 0);
		expect(slot.take('s', 1)).toEqual(['A', 'B']);
		expect(slot.take('s', 2)).toBeUndefined();
	});

	it('is per session and expires', () => {
		const slot = createOneTimeSlot<string[]>(1000);
		slot.put('s', ['A'], 0);
		expect(slot.take('other', 1)).toBeUndefined();
		expect(slot.take('s', 1000)).toBeUndefined();
	});

	it('keeps only the latest value for a session, and is bounded', () => {
		const slot = createOneTimeSlot<number>(1000, 2);
		slot.put('s', 1, 0);
		slot.put('s', 2, 1);
		expect(slot.take('s', 2)).toBe(2);
		for (const k of ['a', 'b', 'c']) slot.put(k, 1, 3);
		expect(slot.size()).toBe(2);
	});
});
