import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/*
 * Every route under src/routes, found by looking at the files. The unit test and the browser test
 * both read it, so a route added tomorrow is covered by both without anyone remembering to.
 * No imports from the app: Playwright and Vitest each load this file.
 */

export type RouteFile = { id: string; path: string; kind: 'page' | 'endpoint' };

/**
 * Every route that is open to a visitor with no session, written out on purpose. A new route is
 * protected by default; one placed under a public prefix (say /signin/x) fails the unit test until
 * it is listed here by a person who meant it. The browser test reads the same list.
 */
export const PUBLIC_ROUTES = [
	'/health',
	'/management',
	'/management/api/[...op]',
	'/offline',
	'/signin',
	'/signin/authenticate/options',
	'/signin/authenticate/verify',
	'/signin/register/options',
	'/signin/register/verify'
];

/**
 * Files SvelteKit serves under /_app that a visitor with no session may fetch, written out on
 * purpose. Everything else under /_app is protected: remote functions live at /_app/remote/*.
 */
export const PUBLIC_APP_PATHS = [
	'/_app/immutable/chunks/x.js',
	'/_app/version.json',
	'/_app/env.js'
];
export const PROTECTED_APP_PATHS = [
	'/_app',
	'/_app/remote/abc123/doThing',
	'/_app/remote',
	'/_app/anything-else',
	'/_app/immutablex',
	'/_app/version.json/x'
];

/** A URL that matches the route: parameters like [id] and [...rest] become a sample segment. */
export const samplePath = (id: string) => id.replace(/\[\.{0,3}[^\]]+\]/g, 'x');

export function listRoutes(routesDir = join(import.meta.dirname, '../../src/routes')): RouteFile[] {
	const found = new Map<string, RouteFile>();
	for (const entry of readdirSync(routesDir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !['+page.svelte', '+server.ts'].includes(entry.name)) continue;
		const dir = relative(routesDir, entry.parentPath).split(sep).join('/');
		// (groups) are not part of the URL.
		const id = `/${dir}`.replace(/\/\([^/]+\)/g, '').replace(/\/$/, '') || '/';
		const kind = entry.name === '+page.svelte' ? 'page' : 'endpoint';
		const existing = found.get(id);
		// A directory holding both a page and an endpoint is a page that also answers other methods.
		if (!existing || kind === 'page') found.set(id, { id, path: samplePath(id), kind });
	}
	return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}
