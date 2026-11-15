import { describe, expect, it } from 'vitest';
import { applyPrivateCache } from './headers.ts';

const html = () => new Headers({ 'content-type': 'text/html; charset=utf-8' });

describe('a signed-in response is private and never kept', () => {
	it('marks an HTML page for a signed-in owner', () => {
		const headers = html();
		applyPrivateCache(headers, { signedIn: true, isDataRequest: false });
		expect(headers.get('cache-control')).toBe('private, no-store');
	});

	it('marks a SvelteKit data request', () => {
		const headers = new Headers({ 'content-type': 'application/json' });
		applyPrivateCache(headers, { signedIn: true, isDataRequest: true });
		expect(headers.get('cache-control')).toBe('private, no-store');
	});

	it('leaves a header the route already set', () => {
		const headers = html();
		headers.set('cache-control', 'no-store');
		applyPrivateCache(headers, { signedIn: true, isDataRequest: false });
		expect(headers.get('cache-control')).toBe('no-store');
	});

	it('forces private, no-store on any response that sets a cookie, whatever it said', () => {
		for (const signedIn of [true, false]) {
			const headers = new Headers({ 'cache-control': 'public, max-age=3600' });
			headers.append('set-cookie', 'session=abc; Path=/; HttpOnly');
			applyPrivateCache(headers, { signedIn, isDataRequest: false });
			expect(headers.get('cache-control')).toBe('private, no-store');
		}
		const bare = new Headers({ 'content-type': 'application/json' });
		bare.append('set-cookie', 'a=b');
		applyPrivateCache(bare, { signedIn: false, isDataRequest: false });
		expect(bare.get('cache-control')).toBe('private, no-store');
	});

	it('keeps a public header on a response with no cookie', () => {
		const headers = new Headers({ 'cache-control': 'public, max-age=3600' });
		applyPrivateCache(headers, { signedIn: true, isDataRequest: false });
		expect(headers.get('cache-control')).toBe('public, max-age=3600');
	});

	it('leaves public and signed-out responses, and non-page responses, alone', () => {
		const out = html();
		applyPrivateCache(out, { signedIn: false, isDataRequest: false });
		expect(out.has('cache-control')).toBe(false);
		const health = new Headers({ 'content-type': 'application/json' });
		applyPrivateCache(health, { signedIn: true, isDataRequest: false });
		expect(health.has('cache-control')).toBe(false);
	});
});
