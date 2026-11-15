import { createHash, randomBytes } from 'node:crypto';
import { normaliseEmail } from '../email.ts';
import { safeEqual } from '../tokens.ts';
import type { GoogleConfig } from './config.ts';

/**
 * Why a step failed. The message is a fixed phrase and never carries the code, a token, the secret
 * or a response body: nothing here may put those in a log.
 */
export class OidcError extends Error {
	constructor(readonly reason: string) {
		super(`Google sign-in step failed: ${reason}`);
		this.name = 'OidcError';
	}
}

/** The S256 challenge for a verifier (RFC 7636 section 4.2). */
export const codeChallengeFor = (verifier: string): string =>
	createHash('sha256').update(verifier).digest('base64url');

/** 32 random bytes (256 bits), base64url: far past the 128 bits a state or nonce needs. */
export const randomValue = (): string => randomBytes(32).toString('base64url');

/** A PKCE verifier (43 characters, inside RFC 7636's 43 to 128) and its S256 challenge. */
export function newPkce(): { codeVerifier: string; codeChallenge: string } {
	const codeVerifier = randomValue();
	return { codeVerifier, codeChallenge: codeChallengeFor(codeVerifier) };
}

export const newState = randomValue;
export const newNonce = randomValue;

export function authorizeUrl(
	config: GoogleConfig,
	p: { state: string; nonce: string; codeChallenge: string; redirectUri: string }
): string {
	const url = new URL(config.authorizeUrl);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', config.clientId);
	url.searchParams.set('redirect_uri', p.redirectUri);
	url.searchParams.set('scope', 'openid email');
	url.searchParams.set('state', p.state);
	url.searchParams.set('nonce', p.nonce);
	url.searchParams.set('code_challenge', p.codeChallenge);
	url.searchParams.set('code_challenge_method', 'S256');
	url.searchParams.set('prompt', 'select_account');
	return url.toString();
}

export const TOKEN_TIMEOUT_MS = 10_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Swaps the code for tokens at the token endpoint and returns the ID token. */
export async function exchangeCode(
	config: GoogleConfig,
	p: { code: string; codeVerifier: string; redirectUri: string },
	fetchFn: typeof fetch = fetch
): Promise<string> {
	let response: Response;
	try {
		response = await fetchFn(config.tokenUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: p.code,
				code_verifier: p.codeVerifier,
				redirect_uri: p.redirectUri,
				client_id: config.clientId,
				client_secret: config.clientSecret
			}),
			redirect: 'error',
			signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS)
		});
	} catch {
		// Deliberately drops the error: its cause can echo the request.
		throw new OidcError('the token endpoint could not be reached');
	}
	if (!response.ok) throw new OidcError(`the token endpoint answered ${response.status}`);
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new OidcError('the token endpoint did not answer with JSON');
	}
	const idToken = isRecord(body) ? body.id_token : undefined;
	if (typeof idToken !== 'string' || idToken === '') {
		throw new OidcError('the token response has no id_token');
	}
	return idToken;
}

const SKEW_SECONDS = 60;

/**
 * Checks the ID token's claims and returns who it names.
 *
 * The signature is NOT verified, on purpose (ADR-0028): the token came straight from Google's token
 * endpoint over TLS, in answer to a request carrying our secret, and OpenID Connect Core 3.1.3.7
 * allows relying on that TLS server validation instead of the signature. It never comes from the
 * browser. Do not pass this a token that did.
 */
export function verifyIdToken(
	config: GoogleConfig,
	idToken: string,
	p: { nonce: string; now: Date }
): { sub: string; email: string } {
	const parts = idToken.split('.');
	if (parts.length !== 3 || parts.some((x) => x === '')) throw new OidcError('malformed token');
	let claims: unknown;
	try {
		claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
	} catch {
		throw new OidcError('malformed token');
	}
	if (!isRecord(claims)) throw new OidcError('malformed token');

	if (typeof claims.iss !== 'string' || !config.issuers.includes(claims.iss)) {
		throw new OidcError('wrong issuer');
	}
	const aud = claims.aud;
	if (Array.isArray(aud)) {
		if (!aud.includes(config.clientId)) throw new OidcError('wrong audience');
		if (claims.azp !== config.clientId) throw new OidcError('wrong authorised party');
	} else if (aud !== config.clientId) {
		throw new OidcError('wrong audience');
	}
	if (claims.azp !== undefined && claims.azp !== config.clientId) {
		throw new OidcError('wrong authorised party');
	}

	const nowSeconds = p.now.getTime() / 1000;
	if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
		throw new OidcError('no expiry');
	}
	if (claims.exp + SKEW_SECONDS < nowSeconds) throw new OidcError('expired');
	if (claims.iat !== undefined) {
		if (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat)) {
			throw new OidcError('bad issue time');
		}
		if (claims.iat - SKEW_SECONDS > nowSeconds) throw new OidcError('issued in the future');
	}

	if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, p.nonce)) {
		throw new OidcError('nonce mismatch');
	}
	if (claims.email_verified !== true) throw new OidcError('email not verified');
	if (typeof claims.sub !== 'string' || claims.sub === '') throw new OidcError('no subject');
	if (typeof claims.email !== 'string') throw new OidcError('no email');
	const email = normaliseEmail(claims.email);
	if (!email.ok) throw new OidcError('no usable email');
	return { sub: claims.sub, email: email.email };
}
