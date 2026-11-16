import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/db/index.ts', () => ({ getDb: vi.fn(async () => ({})) }));
// One query for the layout: setup unfinished, unless a test says otherwise.
vi.mock('#lib/server/offlineTag.ts', async (real) => {
	const { tagOf } = await real<typeof import('#lib/server/offlineTag.ts')>();
	return {
		tagOf,
		layoutOwner: vi.fn(async (_db: unknown, id: number) => ({
			setUp: false,
			ownerTag: tagOf(`backup-${id}`)
		}))
	};
});
const { load } = await import('./+layout.server.ts');
const { tagOf } = await import('#lib/server/offlineTag.ts');
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

describe('TSK-faf834 every page says who it was drawn for, for the offline copy', () => {
	const run = (ownerId: number | null, path: string) =>
		load({
			locals: { ownerId },
			url: new URL(`http://x${path}`),
			cookies: { get: () => undefined, delete: () => undefined }
		} as unknown as LoadEvent) as Promise<{ session: string | null; ownerTag: string | null }>;

	it('signed out: out, with no tag', async () => {
		expect(await run(null, '/')).toMatchObject({ session: 'out', ownerTag: null });
		expect(await run(null, '/signin')).toMatchObject({ session: 'out', ownerTag: null });
	});

	it('the offline page, drawn once at build time, says nothing', async () => {
		expect(await run(1, '/offline')).toMatchObject({ session: null, ownerTag: null });
		expect(await run(null, '/offline')).toMatchObject({ session: null, ownerTag: null });
	});

	it('signed in with no number yet: setup, so the copy goes', async () => {
		expect(await run(1, '/setup')).toMatchObject({ session: 'setup', ownerTag: null });
		expect(await run(1, '/settings')).toMatchObject({ session: 'setup', ownerTag: null });
	});

	it('signed in, set up: in, with the person’s tag and never their account number', async () => {
		const { layoutOwner } = await import('#lib/server/offlineTag.ts');
		vi.mocked(layoutOwner).mockResolvedValueOnce({ setUp: true, ownerTag: tagOf('backup-7') });
		const result = await run(7, '/plan');
		expect(result.session).toBe('in');
		expect(result.ownerTag).toBe(tagOf('backup-7'));
		expect(result.ownerTag).toMatch(/^[0-9a-f]{32}$/);
	});
});
