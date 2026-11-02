import type { Cookies } from '@sveltejs/kit';

/** Test-only: a request event with real-enough cookies, for code that signs in or reads the session. */
export function cookieJar(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	const cookies = {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => void jar.set(name, value),
		delete: (name: string) => void jar.delete(name),
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		serialize: () => ''
	} as unknown as Cookies;
	return { jar, cookies };
}

export function testEvent({
	fields = {},
	cookies = cookieJar().cookies,
	address = '203.0.113.7',
	ownerId = null as number | null,
	path = '/signin'
}: {
	fields?: Record<string, string>;
	cookies?: Cookies;
	address?: string;
	ownerId?: number | null;
	path?: string;
} = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	const url = new URL(`http://localhost${path}`);
	return {
		request: new Request(url, { method: 'POST', body, headers: { 'user-agent': 'vitest' } }),
		cookies,
		url,
		locals: { ownerId },
		getClientAddress: () => address,
		setHeaders: () => {}
	};
}
