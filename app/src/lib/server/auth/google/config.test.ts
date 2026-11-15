import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({
	GOOGLE_CLIENT_ID: undefined,
	GOOGLE_CLIENT_SECRET: undefined,
	GOOGLE_TEST_PROVIDER: undefined
}));

import { googleConfig, resolveGoogleConfig } from './config.ts';

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
