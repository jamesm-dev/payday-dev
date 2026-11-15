import { beforeEach, describe, expect, it } from 'vitest';
import { GOOGLE_FLOW_TTL_MS } from '../challenge.ts';
import type { Db } from '#lib/server/db/open.ts';
import { freshDb } from '#lib/server/db/testing.ts';
import {
	flowBinding,
	flowCookieName,
	flowCookieOptions,
	newFlowCookie,
	startFlow,
	takeFlow,
	type FlowData
} from './flow.ts';

const T0 = new Date('2026-11-16T08:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);
const data: FlowData = {
	codeVerifier: 'v',
	nonce: 'n',
	redirectUri: 'https://x.test/cb',
	next: '/plan'
};

let db: Db;
beforeEach(async () => {
	db = await freshDb();
});

describe('TSK-3e8f61 a Google flow is kept in the database', () => {
	it('is given back once, with its purpose and data', async () => {
		const { value, binding } = newFlowCookie();
		const { state } = await startFlow(db, 'google-sign-in', binding, data, T0);
		expect(await takeFlow(db, state, flowBinding(value), T0)).toEqual({
			purpose: 'google-sign-in',
			data
		});
		expect(await takeFlow(db, state, binding, T0)).toBeNull();
	});

	it('is refused to another browser, and the try uses it up', async () => {
		const mine = newFlowCookie();
		const theirs = newFlowCookie();
		const { state } = await startFlow(db, 'google-sign-in', mine.binding, data, T0);
		expect(await takeFlow(db, state, theirs.binding, T0)).toBeNull();
		expect(await takeFlow(db, state, mine.binding, T0)).toBeNull();
	});

	it('connect and confirm flows are refused to another session', async () => {
		for (const purpose of ['google-connect', 'google-confirm'] as const) {
			const a = await startFlow(db, purpose, 'session-a', data, T0);
			expect(await takeFlow(db, a.state, 'session-b', T0)).toBeNull();
			const b = await startFlow(db, purpose, 'session-a', data, T0);
			expect((await takeFlow(db, b.state, 'session-a', T0))?.purpose).toBe(purpose);
		}
	});

	it('lives 10 minutes and not a moment longer', async () => {
		const ok = await startFlow(db, 'google-connect', 's', data, T0);
		expect(await takeFlow(db, ok.state, 's', after(GOOGLE_FLOW_TTL_MS - 1))).not.toBeNull();
		const late = await startFlow(db, 'google-connect', 's', data, T0);
		expect(await takeFlow(db, late.state, 's', after(GOOGLE_FLOW_TTL_MS))).toBeNull();
	});

	it('knows nothing of an unknown state', async () => {
		expect(await takeFlow(db, 'unknown', 's', T0)).toBeNull();
	});
});

describe('TSK-3e8f61 the flow cookie', () => {
	it('is __Host- over https and plain over http, HttpOnly, Lax, ten minutes', () => {
		const https = new URL('https://payday.test/');
		const http = new URL('http://localhost:5173/');
		expect(flowCookieName(https)).toBe('__Host-google-flow');
		expect(flowCookieName(http)).toBe('google-flow');
		expect(flowCookieOptions(https)).toEqual({
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 600
		});
		expect(flowCookieOptions(http).secure).toBe(false);
	});

	it('stores only a hash of the cookie value', () => {
		const { value, binding } = newFlowCookie();
		expect(binding).not.toBe(value);
		expect(binding).toBe(flowBinding(value));
	});
});
