import {
	createHash,
	createPublicKey,
	generateKeyPairSync,
	randomBytes,
	sign,
	type KeyObject
} from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/*
 * A fake Google: just enough of an OpenID Connect provider for the browser tests (TSK-9a4d16). It
 * listens on a loopback port of its own and the app is pointed at it with GOOGLE_TEST_PROVIDER (a
 * switch that exists only outside the hosted build, see src/lib/server/auth/google/config.ts).
 *
 *   GET  /authorize  checks the request the way Google does, then shows a small page with a GET form
 *                    (no script, so it works in WebKit) to choose sub, email and email_verified.
 *   GET  /choose     the form's target: makes a one-time code and redirects back with code and state.
 *   POST /token      checks the form post (code, PKCE verifier, client id and secret, redirect URI)
 *                    and answers { id_token }, an RS256 JWT in Google's shape.
 *   GET  /jwks       the public key, as Google's certs endpoint would give it.
 *
 * The app does not check the signature (ADR-0028), but the token is signed for real, so it looks
 * like one. A test can ask for one bad token (`failNext`) to see the app refuse it.
 */

export type BadToken = 'wrong-aud' | 'expired' | 'wrong-nonce';

export type FakeGoogleOptions = { clientId: string; clientSecret: string };

type Grant = {
	sub: string;
	email: string;
	emailVerified: boolean;
	nonce: string;
	challenge: string;
	redirectUri: string;
	clientId: string;
	used: boolean;
};

export type FakeGoogle = {
	/** http://127.0.0.1:<port>: what GOOGLE_TEST_PROVIDER is set to, and the token's `iss`. */
	origin: string;
	/** The next token issued is bad in this one way; the one after is good again. */
	failNext(kind: BadToken): void;
	/**
	 * The next account chosen is NOT sent back at once: the page shows a "Return to Payday" link to the
	 * redirect instead. For a test that wants to carry the return address to another browser.
	 */
	holdNextReturn(): void;
	/** How many codes were exchanged successfully, for a test that wants to see none were. */
	tokensIssued(): number;
	/** How many requests of any kind the provider has seen: zero means nobody sent anyone here. */
	requestsSeen(): number;
	close(): Promise<void>;
};

const REDIRECT_URI = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}\/signin\/google\/callback$/;
const BASE64URL = /^[A-Za-z0-9_-]{43,128}$/;

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function send(res: ServerResponse, status: number, type: string, body: string, headers = {}) {
	res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
	res.end(body);
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams | null> {
	if (!/^application\/x-www-form-urlencoded/i.test(req.headers['content-type'] ?? '')) return null;
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);
	return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export async function startFakeGoogle(options: FakeGoogleOptions): Promise<FakeGoogle> {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const kid = createHash('sha256')
		.update(publicKey.export({ type: 'spki', format: 'der' }))
		.digest('hex')
		.slice(0, 16);
	const grants = new Map<string, Grant>();
	let bad: BadToken | null = null;
	let issued = 0;
	let seen = 0;
	let hold = false;
	let origin = '';

	/** Google answers a bad authorization request with a page, never by redirecting to an unchecked URI. */
	const refuse = (res: ServerResponse, reason: string) =>
		send(
			res,
			400,
			'text/plain; charset=utf-8',
			`Fake Google: bad authorization request (${reason})`
		);

	function authorize(url: URL, res: ServerResponse) {
		const q = url.searchParams;
		if (q.get('response_type') !== 'code') return refuse(res, 'response_type');
		if (q.get('client_id') !== options.clientId) return refuse(res, 'client_id');
		if (!REDIRECT_URI.test(q.get('redirect_uri') ?? '')) return refuse(res, 'redirect_uri');
		if (q.get('code_challenge_method') !== 'S256') return refuse(res, 'code_challenge_method');
		if (!BASE64URL.test(q.get('code_challenge') ?? '')) return refuse(res, 'code_challenge');
		if (!BASE64URL.test(q.get('state') ?? '')) return refuse(res, 'state');
		if (!BASE64URL.test(q.get('nonce') ?? '')) return refuse(res, 'nonce');
		if (!(q.get('scope') ?? '').split(' ').includes('openid')) return refuse(res, 'scope');

		const carry = ['client_id', 'redirect_uri', 'code_challenge', 'state', 'nonce']
			.map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(q.get(k) ?? '')}">`)
			.join('\n\t\t');
		send(
			res,
			200,
			'text/html; charset=utf-8',
			`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fake Google</title></head>
<body>
	<h1>Fake Google</h1>
	<form method="GET" action="/choose">
		${carry}
		<p><label>Account number (sub) <input name="sub" autocomplete="off" required></label></p>
		<p><label>Google email <input name="email" type="email" autocomplete="off" required></label></p>
		<p><label>Email verified <select name="email_verified"><option value="true">true</option><option value="false">false</option></select></label></p>
		<p><button type="submit" name="decision" value="allow">Sign in with this account</button>
		<button type="submit" name="decision" value="deny" formnovalidate>Cancel</button></p>
	</form>
</body>
</html>`
		);
	}

	function choose(url: URL, res: ServerResponse) {
		const q = url.searchParams;
		const redirectUri = q.get('redirect_uri') ?? '';
		if (!REDIRECT_URI.test(redirectUri) || q.get('client_id') !== options.clientId) {
			return refuse(res, 'redirect_uri');
		}
		const back = new URL(redirectUri);
		const state = q.get('state') ?? '';
		if (q.get('decision') === 'deny') {
			back.searchParams.set('error', 'access_denied');
			back.searchParams.set('state', state);
			return send(res, 302, 'text/plain', '', { location: back.toString() });
		}
		const code = randomBytes(24).toString('base64url');
		grants.set(code, {
			sub: q.get('sub') ?? '',
			email: q.get('email') ?? '',
			emailVerified: q.get('email_verified') === 'true',
			nonce: q.get('nonce') ?? '',
			challenge: q.get('code_challenge') ?? '',
			redirectUri,
			clientId: q.get('client_id') ?? '',
			used: false
		});
		back.searchParams.set('code', code);
		back.searchParams.set('state', state);
		if (hold) {
			hold = false;
			return send(
				res,
				200,
				'text/html; charset=utf-8',
				`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake Google</title></head><body><h1>Fake Google</h1><p><a href="${escapeHtml(back.toString())}">Return to Payday</a></p></body></html>`
			);
		}
		send(res, 302, 'text/plain', '', { location: back.toString() });
	}

	const invalid = (res: ServerResponse, error = 'invalid_grant') =>
		send(res, 400, 'application/json', JSON.stringify({ error }));

	async function token(req: IncomingMessage, res: ServerResponse) {
		const form = await readForm(req);
		if (!form) return invalid(res, 'invalid_request');
		const grant = grants.get(form.get('code') ?? '');
		if (form.get('grant_type') !== 'authorization_code' || !grant) return invalid(res);
		// A code works once, even when this very exchange then fails.
		if (grant.used) return invalid(res);
		grant.used = true;

		const verifier = form.get('code_verifier') ?? '';
		const challenge = createHash('sha256').update(verifier).digest('base64url');
		if (challenge !== grant.challenge) return invalid(res);
		if (form.get('client_id') !== options.clientId || grant.clientId !== options.clientId) {
			return invalid(res, 'invalid_client');
		}
		if (form.get('client_secret') !== options.clientSecret) return invalid(res, 'invalid_client');
		if (form.get('redirect_uri') !== grant.redirectUri) return invalid(res);

		const now = Math.floor(Date.now() / 1000);
		const kind = bad;
		bad = null;
		const claims = {
			iss: origin,
			azp: options.clientId,
			aud: kind === 'wrong-aud' ? 'some-other-client.apps.googleusercontent.com' : options.clientId,
			sub: grant.sub,
			email: grant.email,
			email_verified: grant.emailVerified,
			nonce: kind === 'wrong-nonce' ? randomBytes(32).toString('base64url') : grant.nonce,
			at_hash: randomBytes(16).toString('base64url'),
			iat: kind === 'expired' ? now - 7200 : now,
			exp: kind === 'expired' ? now - 3600 : now + 3600
		};
		const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
		const body = b64(claims);
		const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey as KeyObject);
		issued += kind ? 0 : 1;
		send(
			res,
			200,
			'application/json',
			JSON.stringify({
				access_token: randomBytes(24).toString('base64url'),
				expires_in: 3599,
				scope: 'openid https://www.googleapis.com/auth/userinfo.email',
				token_type: 'Bearer',
				id_token: `${head}.${body}.${signature.toString('base64url')}`
			})
		);
	}

	const server: Server = createServer((req, res) => {
		seen += 1;
		const url = new URL(req.url ?? '/', origin || 'http://127.0.0.1');
		const run = async () => {
			if (req.method === 'GET' && url.pathname === '/authorize') return authorize(url, res);
			if (req.method === 'GET' && url.pathname === '/choose') return choose(url, res);
			if (req.method === 'POST' && url.pathname === '/token') return token(req, res);
			if (req.method === 'GET' && url.pathname === '/jwks') {
				const jwk = createPublicKey(publicKey).export({ format: 'jwk' });
				return send(
					res,
					200,
					'application/json',
					JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] })
				);
			}
			send(res, 404, 'text/plain', 'Fake Google: not found');
		};
		run().catch(() => {
			if (!res.headersSent) send(res, 500, 'text/plain', 'Fake Google: error');
			else res.end();
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	return {
		origin,
		failNext: (kind) => {
			bad = kind;
		},
		holdNextReturn: () => {
			hold = true;
		},
		tokensIssued: () => issued,
		requestsSeen: () => seen,
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			})
	};
}
