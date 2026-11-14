/*
 * Netlify's `_headers` file and `[[headers]]` in netlify.toml apply to static files only, never to
 * a function's response, and every page here is a function response. So the security headers come
 * from the app itself (hooks.server.ts and the `csp` option). These unit tests cover the helpers;
 * tests/netlify-function.smoke.ts (`pnpm test:netlify`, after `pnpm build`) calls the built Netlify
 * function and checks the real responses.
 */
import { describe, expect, it } from 'vitest';
import { applyPrivateCache, applySecurityHeaders, SECURITY_HEADERS } from './headers.ts';

describe('TSK-13D3EB the security headers come from the app, not the host', () => {
	it('sets every security header on a response that has none', () => {
		const headers = new Headers();
		applySecurityHeaders(headers);
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			expect(headers.get(name), name).toBe(value);
		}
		expect(headers.get('strict-transport-security')).toContain('max-age=');
		expect(headers.get('x-content-type-options')).toBe('nosniff');
		expect(headers.get('x-frame-options')).toBe('DENY');
	});

	it('marks a signed-in page private and never kept, with no help from the host', () => {
		const headers = new Headers({ 'content-type': 'text/html' });
		applyPrivateCache(headers, { signedIn: true, isDataRequest: false });
		expect(headers.get('cache-control')).toBe('private, no-store');
	});
});
