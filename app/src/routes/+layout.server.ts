import { redirect } from '@sveltejs/kit';
import { building } from '$app/env';
import { getDb } from '#lib/server/db/index.ts';
import { takeFlash } from '#lib/server/flash.ts';
import { getOwner } from '#lib/server/money/store.ts';
import { offlineOwnerTag } from '#lib/server/offlineTag.ts';
import type { LayoutServerLoad } from './$types';

/**
 * Screens that are not the app proper: signing in, first-run setup, the dashboard, the offline page,
 * and the public privacy notice and terms (readable by anyone, also before setup is finished).
 */
const WITHOUT_NAV = ['/signin', '/setup', '/management', '/offline', '/privacy', '/terms'];
/** Open before setup is finished: those, and Settings (signing out, security, starting over). */
const BEFORE_SETUP = [...WITHOUT_NAV, '/settings'];

const under = (path: string, bases: readonly string[]) =>
	bases.some((base) => path === base || path.startsWith(`${base}/`));

/**
 * Who this page was drawn for, as the phone's offline copy needs to know (ADR-0029):
 * `out` (signed out: the copy goes), `setup` (signed in with no number yet: the copy goes), `in`
 * (signed in: anything of another person's goes, by `ownerTag`), or null for a page drawn once at
 * build time (the offline page, the privacy notice, the terms), which whoever opens it later may or
 * may not be signed in for. `#lib/offline/guard.js` reads it on every full page load and the root
 * layout on every other.
 */
export type Session = 'in' | 'out' | 'setup' | null;

/** Whether the main navigation shows: signed in, setup finished, and not on one of those screens. */
export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	const path = url.pathname;
	const page = (nav: boolean, session: Session, ownerTag: string | null = null) =>
		// Read once and cleared: a message from the last save shows on this page only.
		({ nav, flash: takeFlash(cookies), session, ownerTag });

	if (building || path === '/offline') return page(false, null);
	// Signed out never reaches the database.
	if (locals.ownerId === null) return page(false, 'out');
	if (under(path, WITHOUT_NAV)) return page(false, under(path, ['/setup']) ? 'setup' : 'in');
	const db = await getDb();
	const setUp = (await getOwner(db, locals.ownerId)).setupStep === null;
	// Until setup is finished, every other page carries on with it, wherever the owner came in
	// (signing in again after signing out half way, an old link, a bookmark). Before the message is
	// read, so a message on its way survives to the setup page.
	if (!setUp && !under(path, BEFORE_SETUP)) redirect(303, '/setup');
	if (!setUp) return page(false, 'setup');
	return page(true, 'in', await offlineOwnerTag(db, locals.ownerId));
};
