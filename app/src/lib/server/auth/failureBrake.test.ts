import { describe, expect, it } from 'vitest';
import { BRAKE_MAX_MS, BRAKE_WINDOW_MS, createFailureBrake } from './failureBrake.ts';

describe('TSK-D7D015 the global failure brake slows guessing from every address, and never locks out', () => {
	it("costs nothing for the owner's first few typos", () => {
		const brake = createFailureBrake();
		for (let i = 0; i < 5; i++) brake.recordFailure(1000);
		expect(brake.delayMs(1000)).toBe(0);
	});

	it('then adds 100 ms per failure', () => {
		const brake = createFailureBrake();
		for (let i = 0; i < 8; i++) brake.recordFailure(1000);
		expect(brake.delayMs(1000)).toBe(300);
		brake.recordFailure(1000);
		expect(brake.delayMs(1000)).toBe(400);
	});

	it('never delays by more than the ceiling, however many failures', () => {
		const brake = createFailureBrake();
		for (let i = 0; i < 5000; i++) brake.recordFailure(1000);
		expect(brake.delayMs(1000)).toBe(BRAKE_MAX_MS);
		expect(brake.count(1000)).toBeLessThan(100);
	});

	it('forgets failures once the window has passed, so the delay fades', () => {
		const brake = createFailureBrake();
		for (let i = 0; i < 20; i++) brake.recordFailure(0);
		expect(brake.delayMs(1)).toBe(1500);
		expect(brake.delayMs(BRAKE_WINDOW_MS)).toBe(0);
		expect(brake.count(BRAKE_WINDOW_MS)).toBe(0);
	});

	it('waits the delay, and only when there is one', async () => {
		const slept: number[] = [];
		const brake = createFailureBrake({ sleep: async (ms) => void slept.push(ms) });
		await brake.wait(0);
		for (let i = 0; i < 10; i++) brake.recordFailure(0);
		await brake.wait(0);
		expect(slept).toEqual([500]);
	});
});
