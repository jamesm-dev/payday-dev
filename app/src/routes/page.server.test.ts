import { beforeEach, describe, expect, it, vi } from 'vitest';

const signUpOpen = vi.fn<(db: unknown) => Promise<boolean>>();
const getDb = vi.fn<() => Promise<unknown>>();
vi.mock('#lib/server/db/index.ts', () => ({ getDb: () => getDb() }));
vi.mock('#lib/server/auth/signUp.ts', () => ({ signUpOpen: (db: unknown) => signUpOpen(db) }));
const logged = vi.fn();
vi.mock('#lib/server/log.ts', () => ({ log: (line: unknown) => logged(line) }));

const { load } = await import('./+page.server.ts');

type LoadEvent = Parameters<typeof load>[0];

const visit = () => {
	const headers: Record<string, string> = {};
	const event = {
		locals: { ownerId: null },
		setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
	} as unknown as LoadEvent;
	return { headers, run: () => load(event) };
};

beforeEach(() => {
	signUpOpen.mockReset();
	getDb.mockReset();
	logged.mockReset();
	getDb.mockResolvedValue({});
});

describe('TSK-04a739 the home page for a visitor who is not signed in', () => {
	it('TSK-cd259c returns the landing marker, with sign-up open, after one count', async () => {
		signUpOpen.mockResolvedValue(true);
		expect(await visit().run()).toEqual({ landing: true, signUpOpen: true });
		expect(signUpOpen).toHaveBeenCalledTimes(1);
	});

	it('TSK-cd259c says sign-up is full when the count is at the cap', async () => {
		signUpOpen.mockResolvedValue(false);
		expect(await visit().run()).toEqual({ landing: true, signUpOpen: false });
		expect(signUpOpen).toHaveBeenCalledTimes(1);
	});

	it('TSK-cd259c still renders, offering sign-up, when the database throws', async () => {
		signUpOpen.mockRejectedValue(new Error('connection refused'));
		expect(await visit().run()).toEqual({ landing: true, signUpOpen: true });
		expect(logged).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn' }));
	});

	it('TSK-cd259c still renders, offering sign-up, when the database cannot be opened', async () => {
		getDb.mockRejectedValue(new Error('no database'));
		expect(await visit().run()).toEqual({ landing: true, signUpOpen: true });
		expect(signUpOpen).not.toHaveBeenCalled();
	});

	it('is never stored by a shared cache, and varies with the cookie', async () => {
		signUpOpen.mockResolvedValue(true);
		const { headers, run } = visit();
		await run();
		expect(headers['cache-control']).toBe('no-store');
		expect(headers['vary']).toBe('cookie');
	});

	it('keeps the headers even when the count fails', async () => {
		signUpOpen.mockRejectedValue(new Error('down'));
		const { headers, run } = visit();
		await run();
		expect(headers['cache-control']).toBe('no-store');
		expect(headers['vary']).toBe('cookie');
	});
});
