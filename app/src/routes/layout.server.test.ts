import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/db/index.ts', () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock('#lib/server/money/store.ts', () => ({
	getOwner: vi.fn(async () => ({ setupStep: 'pay' }))
}));
const { load } = await import('./+layout.server.ts');
type LoadEvent = Parameters<typeof load>[0];

describe('TSK-99efff the privacy notice and the terms open before setup is finished', () => {
	it.each(['/privacy', '/terms'])(
		'%s is not sent to /setup and shows no navigation',
		async (path) => {
			const event = {
				locals: { ownerId: 1 },
				url: new URL(`http://x${path}`),
				cookies: { get: () => undefined, delete: () => undefined }
			} as unknown as LoadEvent;
			const result = (await load(event)) as { nav: boolean };
			expect(result.nav).toBe(false);
		}
	);

	it('still sends an unfinished owner from another page to /setup', async () => {
		const event = {
			locals: { ownerId: 1 },
			url: new URL('http://x/plan'),
			cookies: { get: () => undefined, delete: () => undefined }
		} as unknown as LoadEvent;
		await expect(load(event)).rejects.toMatchObject({ status: 303, location: '/setup' });
	});
});
