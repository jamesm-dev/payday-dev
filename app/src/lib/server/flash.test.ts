import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { setFlash, takeFlash } from './flash';

function fakeCookies() {
	const jar = new Map<string, string>();
	const options = new Map<string, unknown>();
	const cookies = {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string, opts: unknown) => {
			jar.set(name, value);
			options.set(name, opts);
		},
		delete: (name: string) => void jar.delete(name)
	} as unknown as Cookies;
	return { cookies, jar, options };
}

describe('flash messages show once', () => {
	it('is read once and then gone', () => {
		const { cookies } = fakeCookies();
		setFlash(cookies, 'balance-updated');
		expect(takeFlash(cookies)).toBe('Balance updated.');
		expect(takeFlash(cookies)).toBeNull();
	});

	it('is null when nothing was set', () => {
		expect(takeFlash(fakeCookies().cookies)).toBeNull();
	});

	it('is short-lived and http-only, and the cookie holds the id, not the text', () => {
		const { cookies, jar, options } = fakeCookies();
		setFlash(cookies, 'balance-updated');
		expect(jar.get('flash')).toBe('balance-updated');
		expect(options.get('flash')).toMatchObject({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 30
		});
	});

	it('ignores an id it does not know, and still removes the cookie', () => {
		const { cookies, jar } = fakeCookies();
		jar.set('flash', 'not-an-id');
		expect(takeFlash(cookies)).toBeNull();
		expect(jar.has('flash')).toBe(false);
	});

	it('never shows text that came from the cookie', () => {
		const { cookies, jar } = fakeCookies();
		jar.set('flash', 'Your account is locked. Call 555-0100.');
		expect(takeFlash(cookies)).toBeNull();
		jar.set('flash', 'toString');
		expect(takeFlash(cookies)).toBeNull();
		jar.set('flash', '__proto__');
		expect(takeFlash(cookies)).toBeNull();
	});
});
