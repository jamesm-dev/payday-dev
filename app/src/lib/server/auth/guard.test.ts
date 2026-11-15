import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	listRoutes,
	PROTECTED_APP_PATHS,
	PUBLIC_APP_PATHS,
	PUBLIC_READ_ONLY_ROUTES,
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
		for (const id of [...PUBLIC_ROUTES, ...PUBLIC_READ_ONLY_ROUTES]) expect(ids).toContain(id);
	});

	it('protects the settings page; the home page is open to reads only, never to every method', () => {
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
		expect(decideGuard({ ...req, pathname: '/plan' }).action).toBe('redirect');
	});

	it('lets public paths through without a session', () => {
		for (const pathname of ['/signin', '/health', '/offline', '/manifest.webmanifest']) {
			expect(decideGuard({ ...base, pathname }).action).toBe('allow');
		}
		const register = { ...base, method: 'POST', pathname: '/signin/register/options' };
		expect(decideGuard(register).action).toBe('allow');
	});
});

describe('TSK-04a739 the home page is public to read, and only to read', () => {
	const base: GuardRequest = {
		method: 'GET',
		pathname: '/',
		search: () => '',
		accept: 'text/html,application/xhtml+xml',
		isDataRequest: false,
		isRemoteRequest: false,
		signedIn: false
	};

	it('shows a signed-out visitor the page, a HEAD for it, and its data request', () => {
		expect(decideGuard(base)).toEqual({ action: 'allow' });
		expect(decideGuard({ ...base, method: 'HEAD' })).toEqual({ action: 'allow' });
		expect(decideGuard({ ...base, accept: '*/*', isDataRequest: true })).toEqual({
			action: 'allow'
		});
		// A query string on the page is still the page (the action name only matters to a POST).
		expect(decideGuard({ ...base, search: () => '?/balance' })).toEqual({ action: 'allow' });
	});

	it('refuses every write to / with 401, the form actions included', () => {
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			for (const search of ['', '?/balance', '?/expense', '?/paid']) {
				const decision = decideGuard({ ...base, method, search: () => search });
				expect(decision, `${method} /${search}`).toEqual({ action: 'unauthorized' });
			}
		}
	});

	it('shows link-preview fetchers the page: no Accept, or */*, is a read of the page', () => {
		for (const accept of [null, '*/*', 'text/html', 'image/*,*/*;q=0.8']) {
			for (const method of ['GET', 'HEAD']) {
				expect(decideGuard({ ...base, method, accept }), `${method} ${accept}`).toEqual({
					action: 'allow'
				});
			}
		}
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			expect(decideGuard({ ...base, method, accept: '*/*' }).action).toBe('unauthorized');
			expect(decideGuard({ ...base, method, accept: null }).action).toBe('unauthorized');
		}
		// And the same openness is for `/` alone.
		expect(decideGuard({ ...base, pathname: '/plan', accept: '*/*' }).action).toBe('unauthorized');
		expect(decideGuard({ ...base, pathname: '/plan', accept: null }).action).toBe('unauthorized');
	});

	it('still refuses a JSON read of / and a remote call made from it', () => {
		expect(decideGuard({ ...base, accept: 'application/json' }).action).toBe('unauthorized');
		expect(decideGuard({ ...base, isRemoteRequest: true }).action).toBe('unauthorized');
		expect(decideGuard({ ...base, method: 'POST', isDataRequest: true }).action).toBe(
			'unauthorized'
		);
	});

	it('opens no other path by the same rule', () => {
		for (const pathname of ['/plan', '/settings', '/signin-x', '//', '/index', '/%2F']) {
			expect(decideGuard({ ...base, pathname }).action, pathname).not.toBe('allow');
		}
	});

	it('serves the sitemap to a signed-out visitor', () => {
		expect(decideGuard({ ...base, pathname: '/sitemap.xml', accept: '*/*' })).toEqual({
			action: 'allow'
		});
	});
});

describe('TSK-04a739 a future route cannot become public by accident', () => {
	const open = new Set([...PUBLIC_ROUTES, ...PUBLIC_READ_ONLY_ROUTES]);

	it.each(listRoutes().map((r) => [r.id, r.path] as const))(
		'%s: a signed-out page request is %s',
		(id, path) => {
			const decision = decideGuard({
				method: 'GET',
				pathname: path,
				search: () => '',
				accept: 'text/html',
				isDataRequest: false,
				isRemoteRequest: false,
				signedIn: false
			});
			if (open.has(id)) expect(decision.action).toBe('allow');
			else expect(decision.action, `${id} must not be public`).not.toBe('allow');
		}
	);

	it('a signed-out write to any route is never allowed, except the sign-in endpoints', () => {
		for (const { id, path } of listRoutes()) {
			if (PUBLIC_ROUTES.includes(id)) continue;
			const decision = decideGuard({
				method: 'POST',
				pathname: path,
				search: () => '',
				accept: 'text/html',
				isDataRequest: false,
				isRemoteRequest: false,
				signedIn: false
			});
			expect(decision.action, `POST ${id}`).toBe('unauthorized');
		}
	});
});

describe('TSK-04a739 nothing but the page may answer at /', () => {
	it('has no endpoint that answers /, in any route group: it would be public to every read', () => {
		const routesDir = join(import.meta.dirname, '../../../routes');
		const atRoot: string[] = [];
		for (const entry of readdirSync(routesDir, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || !/^\+server\.(ts|js)$/.test(entry.name)) continue;
			const dir = relative(routesDir, entry.parentPath).split(sep).join('/');
			// (groups) are not part of the URL, so (app)/+server.ts answers "/" too.
			const path = `/${dir}`.replace(/\/\([^/]+\)/g, '').replace(/\/$/, '') || '/';
			if (path === '/') atRoot.push(`src/routes/${dir ? `${dir}/` : ''}${entry.name}`);
		}
		expect(
			atRoot,
			`${atRoot.join(', ')} answers "/". The guard lets a signed-out visitor GET "/" with any Accept ` +
				'header (link-preview fetchers send none), so an endpoint there would be reachable without a ' +
				'session. Put it on another path, or change the guard on purpose.'
		).toEqual([]);
	});
});
