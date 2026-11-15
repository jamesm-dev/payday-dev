import { describe, expect, it, vi } from 'vitest';

// The landing must never open the database: fail the test if it tries.
vi.mock('#lib/server/db/index.ts', () => ({
	getDb: vi.fn(() => {
		throw new Error('the public home page must not touch the database');
	})
}));

const { load } = await import('./+page.server.ts');

type LoadEvent = Parameters<typeof load>[0];

describe('TSK-04a739 the home page for a visitor who is not signed in', () => {
	it('returns the landing marker without touching the database', async () => {
		const headers: Record<string, string> = {};
		const event = {
			locals: { ownerId: null },
			setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
		} as unknown as LoadEvent;
		const result = await load(event);
		expect(result).toEqual({ landing: true });
		const { getDb } = await import('#lib/server/db/index.ts');
		expect(getDb).not.toHaveBeenCalled();
	});

	it('is never stored by a shared cache, and varies with the cookie', async () => {
		const headers: Record<string, string> = {};
		const event = {
			locals: { ownerId: null },
			setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
		} as unknown as LoadEvent;
		await load(event);
		expect(headers['cache-control']).toBe('no-store');
		expect(headers['vary']).toBe('cookie');
	});
});
