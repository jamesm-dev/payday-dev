import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self } from '$app/service-worker';

/*
 * Caches the app shell — built files, static assets and the prerendered offline page — and nothing
 * else. Server-rendered pages are never cached: from Phase 1 they hold financial data, and a stale
 * number is worse than an honest "offline".
 */

const CACHE = `payday-${version}`;
const toUrl = (path: string) => new URL(path, self.registration.scope).href;

const SHELL = [...immutable, ...assets, ...prerendered].map(({ path }) => toUrl(path));
const SHELL_SET = new Set(SHELL);
const OFFLINE = toUrl('offline');

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(SHELL))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

	// Shell files are versioned by the build, so the cached copy is always the right one.
	if (SHELL_SET.has(request.url)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
		return;
	}

	// Pages always come from the network; with none, show the offline page instead of an error.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error())
		);
	}
});
