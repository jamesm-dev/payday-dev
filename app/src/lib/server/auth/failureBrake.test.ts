import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import { BRAKE_MAX_MS, BRAKE_WINDOW_MS, createFailureBrake } from './failureBrake.ts';

let db: Db;
beforeEach(async () => {
	db = await freshDb();
});

describe('TSK-D7D015 the global failure brake slows guessing from every address, and never locks out', () => {
	it("costs nothing for the owner's first few typos", async () => {
		const brake = createFailureBrake();
		for (let i = 0; i < 5; i++) await brake.recordFailure(db, 1000);
		expect(await brake.delayMs(db, 1000)).toBe(0);
	});

	it('then adds 100 ms per failure', async () => {
		const brake = createFailureBrake();
		for (let i = 0; i < 8; i++) await brake.recordFailure(db, 1000);
		expect(await brake.delayMs(db, 1000)).toBe(300);
		await brake.recordFailure(db, 1000);
		expect(await brake.delayMs(db, 1000)).toBe(400);
	});

	it('never delays by more than the ceiling, however many failures', async () => {
		const brake = createFailureBrake();
		for (let i = 0; i < 200; i++) await brake.recordFailure(db, 1000);
		expect(await brake.delayMs(db, 1000)).toBe(BRAKE_MAX_MS);
		expect(await brake.count(db, 1000)).toBeLessThan(100);
	});

	it('forgets failures once the window has passed, so the delay fades', async () => {
		const brake = createFailureBrake();
		for (let i = 0; i < 20; i++) await brake.recordFailure(db, 0);
		expect(await brake.delayMs(db, 1)).toBe(1500);
		expect(await brake.delayMs(db, BRAKE_WINDOW_MS)).toBe(0);
		expect(await brake.count(db, BRAKE_WINDOW_MS)).toBe(0);
	});

	it('waits the delay, and only when there is one', async () => {
		const slept: number[] = [];
		const brake = createFailureBrake({ sleep: async (ms) => void slept.push(ms) });
		await brake.wait(db, 0);
		for (let i = 0; i < 10; i++) await brake.recordFailure(db, 0);
		await brake.wait(db, 0);
		expect(slept).toEqual([500]);
	});
});

describe('TSK-5569A1 the brake holds across separate function instances', () => {
	it('failures recorded by one instance slow every other, whatever address they came from', async () => {
		const slept: number[] = [];
		const one = createFailureBrake();
		const two = createFailureBrake({ sleep: async (ms) => void slept.push(ms) });
		for (let i = 0; i < 8; i++) await one.recordFailure(db, 0);
		expect(await two.count(db, 1)).toBe(8);
		await two.wait(db, 1);
		expect(slept).toEqual([300]);
		// And the failures fade for both together.
		expect(await one.delayMs(db, BRAKE_WINDOW_MS)).toBe(0);
		expect(await two.delayMs(db, BRAKE_WINDOW_MS)).toBe(0);
	});

	it('failures recorded together are all counted, none lost to a race', async () => {
		const brake = createFailureBrake();
		await Promise.all(Array.from({ length: 12 }, () => brake.recordFailure(db, 0)));
		expect(await brake.count(db, 1)).toBe(12);
	});
});
