import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({
	GOOGLE_CLIENT_ID: undefined,
	GOOGLE_CLIENT_SECRET: undefined,
	GOOGLE_TEST_PROVIDER: undefined
}));

import { googleConfig, resetInsecureTlsWarning, resolveGoogleConfig } from './config.ts';

const ON = { clientId: 'id', clientSecret: 'secret' };

describe('TSK-5c19e2 Google sign-in is off unless both values are set', () => {
	it('is off when either is missing, empty or blank', () => {
		expect(resolveGoogleConfig({}, true)).toBeNull();
		expect(resolveGoogleConfig({ clientId: 'id' }, true)).toBeNull();
		expect(resolveGoogleConfig({ clientSecret: 'secret' }, false)).toBeNull();
		expect(resolveGoogleConfig({ clientId: '', clientSecret: 'secret' }, true)).toBeNull();
		expect(resolveGoogleConfig({ clientId: 'id', clientSecret: '   ' }, true)).toBeNull();
		expect(resolveGoogleConfig({ clientId: ' \t', clientSecret: 'secret' }, false)).toBeNull();
	});

	it('is off through the environment reader when nothing is set', () => {
		expect(googleConfig()).toBeNull();
	});

	it('is on with Google constants when both are set, trimmed', () => {
		expect(resolveGoogleConfig({ clientId: ' id ', clientSecret: ' secret ' }, true)).toEqual({
			clientId: 'id',
			clientSecret: 'secret',
			authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			tokenUrl: 'https://oauth2.googleapis.com/token',
			issuers: ['https://accounts.google.com', 'accounts.google.com']
		});
	});

	it('honours a loopback test provider only when not hosted', () => {
		for (const origin of ['http://127.0.0.1:4321', 'http://localhost:9']) {
			expect(resolveGoogleConfig({ ...ON, testProvider: origin }, false)).toEqual({
				clientId: 'id',
				clientSecret: 'secret',
				authorizeUrl: `${origin}/authorize`,
				tokenUrl: `${origin}/token`,
				issuers: [origin]
			});
		}
	});

	it('refuses a test provider that is not loopback, with a clear message', () => {
		for (const bad of [
			'https://127.0.0.1:4321',
			'http://127.0.0.1',
			'http://example.com:80',
			'http://127.0.0.1:80@evil.test:80',
			'http://localhost:80/path',
			'https://accounts.google.com'
		]) {
			expect(() => resolveGoogleConfig({ ...ON, testProvider: bad }, false)).toThrow(
				/GOOGLE_TEST_PROVIDER must be http:\/\/127\.0\.0\.1/
			);
		}
	});

	it('ignores the test provider entirely when hosted, even a bad one', () => {
		for (const provider of ['http://127.0.0.1:4321', 'http://evil.test']) {
			expect(resolveGoogleConfig({ ...ON, testProvider: provider }, true)?.authorizeUrl).toBe(
				'https://accounts.google.com/o/oauth2/v2/auth'
			);
		}
	});

	it('does not read the test provider when Google is off', () => {
		expect(resolveGoogleConfig({ testProvider: 'http://evil.test' }, false)).toBeNull();
	});
});

describe('TSK-3e8f61 Google stays off while Node skips certificate checks', () => {
	it('is off, with one plain warning, when NODE_TLS_REJECT_UNAUTHORIZED is 0', () => {
		resetInsecureTlsWarning();
		const out = vi.spyOn(console, 'log').mockImplementation(() => {});
		const env = { NODE_TLS_REJECT_UNAUTHORIZED: '0' };
		expect(resolveGoogleConfig(ON, true, env)).toBeNull();
		expect(resolveGoogleConfig(ON, false, env)).toBeNull();
		expect(
			resolveGoogleConfig({ ...ON, testProvider: 'http://127.0.0.1:4321' }, false, env)
		).toBeNull();
		expect(out).toHaveBeenCalledTimes(1);
		expect(String(out.mock.calls[0][0])).toContain('NODE_TLS_REJECT_UNAUTHORIZED');
		expect(String(out.mock.calls[0][0])).not.toContain('secret');
		out.mockRestore();
	});

	it('is on with any other value, and says nothing when it was off anyway', () => {
		const out = vi.spyOn(console, 'log').mockImplementation(() => {});
		resetInsecureTlsWarning();
		expect(resolveGoogleConfig(ON, true, { NODE_TLS_REJECT_UNAUTHORIZED: '1' })).not.toBeNull();
		expect(resolveGoogleConfig(ON, true, {})).not.toBeNull();
		expect(resolveGoogleConfig({}, true, { NODE_TLS_REJECT_UNAUTHORIZED: '0' })).toBeNull();
		expect(out).not.toHaveBeenCalled();
		out.mockRestore();
	});
});
