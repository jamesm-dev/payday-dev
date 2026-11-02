import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

// From the SPECS.md performance budget.
const HOME_JS_GZIP_BUDGET = 60 * 1024;
const SERVER_P95_BUDGET_MS = 150;

test.describe('TSK-79C0D4 the performance budget is measured', () => {
	// The bytes and the server are the same whatever the browser, so measure once.
	test.skip(({ browserName }) => browserName !== 'chromium', 'measured once, on Chromium');

	test('the home screen ships at most 60 KB of JavaScript, gzipped', async ({ page }, info) => {
		test.skip(info.project.name !== 'android', 'measured once, at phone size');

		const scripts = new Map<string, number>();
		page.on('response', async (response) => {
			if (response.request().resourceType() !== 'script') return;
			const body = await response.body().catch(() => null);
			if (body) scripts.set(response.url(), gzipSync(body, { level: 9 }).length);
		});

		await page.goto('/', { waitUntil: 'networkidle' });
		const total = [...scripts.values()].reduce((sum, bytes) => sum + bytes, 0);

		info.annotations.push({
			type: 'home-js-gzip-bytes',
			description: `${total} bytes across ${scripts.size} scripts`
		});
		console.log(`home screen JS: ${(total / 1024).toFixed(1)} KB gzipped, ${scripts.size} files`);
		expect(total).toBeGreaterThan(0);
		expect(total).toBeLessThanOrEqual(HOME_JS_GZIP_BUDGET);
	});

	test('the server renders the home screen within 150 ms at p95, locally', async ({
		request
	}, info) => {
		test.skip(info.project.name !== 'laptop', 'measured once');

		const times: number[] = [];
		await request.get('/'); // warm-up, not counted
		for (let i = 0; i < 100; i++) {
			const start = performance.now();
			const response = await request.get('/');
			expect(response.ok()).toBe(true);
			times.push(performance.now() - start);
		}
		times.sort((a, b) => a - b);
		const p95 = times[Math.ceil(times.length * 0.95) - 1];

		info.annotations.push({ type: 'home-p95-ms', description: p95.toFixed(1) });
		console.log(`home screen server p95: ${p95.toFixed(1)} ms over 100 requests (local)`);
		expect(p95).toBeLessThanOrEqual(SERVER_P95_BUDGET_MS);
	});
});
