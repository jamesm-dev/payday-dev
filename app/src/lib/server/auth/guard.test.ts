import { describe, expect, it } from 'vitest';
import {
	listRoutes,
	PROTECTED_APP_PATHS,
	PUBLIC_APP_PATHS,
	PUBLIC_ROUTES
} from '../../../../tests/support/routes.ts';
import { decideGuard, isPublicPath, type GuardRequest } from './guard.ts';

describe('TSK-EF5663 every route is either on the public list or behind the guard', () => {
	const routes = listRoutes();

	it('finds the routes', () => {
		expect(routes.map((r) => r.id)).toEqual(expect.arrayContaining(['/', '/signin', '/health']));
	});

	it.each(routes.map((r) => [r.id, r.path] as const))('%s', (id, path) => {
		expect(isPublicPath(path), `${id} (${path})`).toBe(PUBLIC_ROUTES.includes(id));
	});

	it('lists no public route that does not exist', () => {
		const ids = routes.map((r) => r.id);
		for (const id of PUBLIC_ROUTES) expect(ids).toContain(id);
	});

	it('protects the settings page and the home page', () => {
		expect(isPublicPath('/')).toBe(false);
		expect(isPublicPath('/settings/security')).toBe(false);
		expect(isPublicPath('/signin-lookalike')).toBe(false);
		expect(isPublicPath('/management-lookalike')).toBe(false);
	});

	it.each(PUBLIC_APP_PATHS)('serves %s without a session', (path) => {
		expect(isPublicPath(path)).toBe(true);
	});

	it.each(PROTECTED_APP_PATHS)('guards %s: only the built files are public under /_app', (path) => {
		expect(isPublicPath(path)).toBe(false);
	});
});

describe('TSK-EF5663 the guard decides per request', () => {
	const base: GuardRequest = {
		method: 'GET',
		pathname: '/',
		search: () => '',
		accept: 'text/html,application/xhtml+xml',
		isDataRequest: false,
		isRemoteRequest: false,
		signedIn: false
	};

	it('lets a signed-in owner through anywhere', () => {
		expect(decideGuard({ ...base, signedIn: true, pathname: '/settings/security' })).toEqual({
			action: 'allow'
		});
	});

	it('sends a page request to sign-in with a validated way back', () => {
		expect(decideGuard({ ...base, pathname: '/settings/security', search: () => '?a=1' })).toEqual({
			action: 'redirect',
			location: '/signin?next=%2Fsettings%2Fsecurity%3Fa%3D1'
		});
		// A hostile path cannot become an open redirect.
		expect(decideGuard({ ...base, pathname: '//evil.example' })).toEqual({
			action: 'redirect',
			location: '/signin?next=%2F'
		});
	});

	it('answers writes and non-page reads with 401', () => {
		expect(decideGuard({ ...base, method: 'POST' }).action).toBe('unauthorized');
		expect(decideGuard({ ...base, method: 'DELETE', accept: null }).action).toBe('unauthorized');
		expect(decideGuard({ ...base, accept: 'application/json' }).action).toBe('unauthorized');
	});

	it('refuses a remote function call without a session, even one made from a public page', () => {
		for (const pathname of ['/signin', '/_app/remote/abc/fn', '/']) {
			for (const method of ['GET', 'POST']) {
				expect(decideGuard({ ...base, method, pathname, isRemoteRequest: true }).action).toBe(
					'unauthorized'
				);
			}
		}
		expect(decideGuard({ ...base, signedIn: true, isRemoteRequest: true }).action).toBe('allow');
	});

	it('sends a data request to sign-in with the page it was for', () => {
		const req = { ...base, accept: '*/*', isDataRequest: true, search: () => '?a=1' };
		expect(decideGuard({ ...req, pathname: '/settings/security' })).toEqual({
			action: 'redirect',
			location: '/signin?next=%2Fsettings%2Fsecurity%3Fa%3D1'
		});
		expect(decideGuard({ ...req, pathname: '/' }).action).toBe('redirect');
	});

	it('lets public paths through without a session', () => {
		for (const pathname of ['/signin', '/health', '/offline', '/manifest.webmanifest']) {
			expect(decideGuard({ ...base, pathname }).action).toBe('allow');
		}
		const register = { ...base, method: 'POST', pathname: '/signin/register/options' };
		expect(decideGuard(register).action).toBe('allow');
	});
});
