import { describe, expect, it, vi } from 'vitest';
import type { GoogleConfig } from './config.ts';
import {
	authorizeUrl,
	codeChallengeFor,
	exchangeCode,
	newNonce,
	newPkce,
	newState,
	OidcError,
	verifyIdToken
} from './oidc.ts';

const config: GoogleConfig = {
	clientId: 'client-1',
	clientSecret: 'SECRET-VALUE',
	authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
	tokenUrl: 'https://oauth2.googleapis.com/token',
	issuers: ['https://accounts.google.com', 'accounts.google.com']
};
const NOW = new Date('2026-11-16T10:00:00.000Z');
const sec = NOW.getTime() / 1000;
const NONCE = 'nonce-abc';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims: Record<string, unknown>) => `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
const good = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
	iss: 'https://accounts.google.com',
	aud: 'client-1',
	exp: sec + 600,
	iat: sec - 5,
	nonce: NONCE,
	sub: '1234',
	email: 'Owner@Example.com',
	email_verified: true,
	...over
});
const verify = (over: Record<string, unknown> = {}, remove: string[] = []) => {
	const c = good(over);
	for (const k of remove) delete c[k];
	return () => verifyIdToken(config, jwt(c), { nonce: NONCE, now: NOW });
};

describe('TSK-3e8f61 PKCE, state and nonce', () => {
	it("matches RFC 7636 Appendix B's S256 example", () => {
		expect(codeChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
			'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
		);
	});

	it('makes a verifier in range and its own challenge', () => {
		const { codeVerifier, codeChallenge } = newPkce();
		expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
		expect(codeChallenge).toBe(codeChallengeFor(codeVerifier));
	});

	it('makes unique state and nonce of at least 128 bits, base64url', () => {
		for (const make of [newState, newNonce]) {
			const a = make();
			expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
			expect(Buffer.from(a, 'base64url').length).toBeGreaterThanOrEqual(16);
			expect(make()).not.toBe(a);
		}
	});
});

describe('TSK-3e8f61 the authorisation URL', () => {
	it('carries everything the code flow needs', () => {
		const url = new URL(
			authorizeUrl(config, {
				state: 's',
				nonce: 'n',
				codeChallenge: 'cc',
				redirectUri: 'https://x.test/auth/google/callback'
			})
		);
		expect(url.origin + url.pathname).toBe(config.authorizeUrl);
		const q = Object.fromEntries(url.searchParams);
		expect(q).toEqual({
			response_type: 'code',
			client_id: 'client-1',
			redirect_uri: 'https://x.test/auth/google/callback',
			scope: 'openid email',
			state: 's',
			nonce: 'n',
			code_challenge: 'cc',
			code_challenge_method: 'S256',
			prompt: 'select_account'
		});
	});
});

describe('TSK-3e8f61 the token exchange', () => {
	const args = { code: 'CODE-1', codeVerifier: 'VERIFIER-1', redirectUri: 'https://x.test/cb' };
	const reply = (body: unknown, status = 200) =>
		vi.fn(async () => new Response(JSON.stringify(body), { status }));

	it('posts a form with no redirects and a timeout, and returns the id_token', async () => {
		const f = reply({ id_token: 'a.b.c', access_token: 'zzz' });
		expect(await exchangeCode(config, args, f as unknown as typeof fetch)).toBe('a.b.c');
		const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(config.tokenUrl);
		expect(init.method).toBe('POST');
		expect(init.redirect).toBe('error');
		expect(init.signal).toBeInstanceOf(AbortSignal);
		const form = new URLSearchParams(init.body as URLSearchParams);
		expect(Object.fromEntries(form)).toEqual({
			grant_type: 'authorization_code',
			code: 'CODE-1',
			code_verifier: 'VERIFIER-1',
			redirect_uri: 'https://x.test/cb',
			client_id: 'client-1',
			client_secret: 'SECRET-VALUE'
		});
	});

	it('refuses a bad status, a body that is not JSON, and a missing id_token', async () => {
		const call = (f: unknown) => exchangeCode(config, args, f as typeof fetch);
		await expect(call(reply({ error: 'invalid_grant' }, 400))).rejects.toBeInstanceOf(OidcError);
		await expect(call(vi.fn(async () => new Response('<html>')))).rejects.toBeInstanceOf(OidcError);
		await expect(call(reply({}))).rejects.toBeInstanceOf(OidcError);
		await expect(call(reply({ id_token: '' }))).rejects.toBeInstanceOf(OidcError);
		await expect(call(reply([1]))).rejects.toBeInstanceOf(OidcError);
	});

	it('never lets the code, the secret or the body into an error, a log or the console', async () => {
		const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
			vi.spyOn(console, m).mockImplementation(() => {})
		);
		const failures = [
			vi.fn(async () => {
				throw new Error('boom CODE-1 SECRET-VALUE');
			}),
			reply({ error: 'CODE-1 SECRET-VALUE' }, 500)
		];
		for (const f of failures) {
			const err = await exchangeCode(config, args, f as unknown as typeof fetch).catch((e) => e);
			expect(err).toBeInstanceOf(OidcError);
			const text = `${err.message} ${err.stack ?? ''} ${JSON.stringify(err)}`;
			for (const secret of ['CODE-1', 'SECRET-VALUE', 'VERIFIER-1']) {
				expect(text).not.toContain(secret);
			}
		}
		for (const s of spies) {
			expect(s).not.toHaveBeenCalled();
			s.mockRestore();
		}
	});
});

describe('TSK-3e8f61 the ID token', () => {
	it('returns the subject and a lower-cased email', () => {
		expect(verify()()).toEqual({ sub: '1234', email: 'owner@example.com' });
	});

	it('accepts the bare accounts.google.com issuer, an audience list naming us, and a little skew', () => {
		expect(verify({ iss: 'accounts.google.com' })().sub).toBe('1234');
		expect(verify({ aud: ['other', 'client-1'], azp: 'client-1' })().sub).toBe('1234');
		expect(verify({ exp: sec - 30 })().sub).toBe('1234');
		expect(verify({ iat: sec + 30 })().sub).toBe('1234');
	});

	it('refuses a malformed token', () => {
		const bad = [
			'',
			'a.b',
			'a.b.c.d',
			'a..c',
			`h.${Buffer.from('nope').toString('base64url')}.s`,
			`h.${b64([1])}.s`
		];
		for (const t of bad) {
			expect(() => verifyIdToken(config, t, { nonce: NONCE, now: NOW })).toThrow(OidcError);
		}
	});

	it.each([
		['an issuer that is not Google', { iss: 'https://evil.test' }, []],
		['no issuer', {}, ['iss']],
		['another audience', { aud: 'client-2' }, []],
		['an audience list without us', { aud: ['a', 'b'], azp: 'client-1' }, []],
		['an audience list with no azp', { aud: ['client-1', 'b'] }, ['azp']],
		['an audience list with another azp', { aud: ['client-1', 'b'], azp: 'b' }, []],
		['another azp', { azp: 'client-2' }, []],
		['an expired token', { exp: sec - 61 }, []],
		['no expiry', {}, ['exp']],
		['an issue time in the future', { iat: sec + 61 }, []],
		['a nonce that does not match', { nonce: 'other' }, []],
		['no nonce', {}, ['nonce']],
		['an email not verified', { email_verified: false }, []],
		['an email_verified that is only a string', { email_verified: 'true' }, []],
		['no email_verified', {}, ['email_verified']],
		['an empty sub', { sub: '' }, []],
		['no sub', {}, ['sub']],
		['no email', {}, ['email']],
		['an email that is not an address', { email: 'nope' }, []]
	])('TSK-3e8f61 refuses %s', (_name, over, remove) => {
		expect(verify(over as Record<string, unknown>, remove as string[])).toThrow(OidcError);
	});
});
