import { expect, test } from '@playwright/test';

// The dashboard is development-only: in the production build the page and every endpoint are a
// 404, so a deployed app exposes no roadmap, no names and no writable board.
test.describe('the dev-only /management dashboard', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'server behaviour; checked once');

	test('does not exist in the production build: page, reads and writes all 404', async ({
		request
	}, info) => {
		test.skip(info.project.name !== 'laptop', 'checked once');

		expect((await request.get('/management')).status()).toBe(404);
		expect((await request.get('/management/api/state')).status()).toBe(404);
		expect((await request.get('/management/api/board')).status()).toBe(404);
		const write = await request.post('/management/api/status', {
			data: { taskId: 'TSK-1C63DF', status: 'done' }
		});
		expect(write.status()).toBe(404);
	});
});
