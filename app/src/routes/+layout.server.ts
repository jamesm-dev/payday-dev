import { redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { takeFlash } from '#lib/server/flash.ts';
import { getOwner } from '#lib/server/money/store.ts';
import type { LayoutServerLoad } from './$types';

/** Screens that are not the app proper: signing in, first-run setup, the dashboard, the offline page. */
const WITHOUT_NAV = ['/signin', '/setup', '/management', '/offline'];
/** Open before setup is finished: those, and Settings (signing out, security, starting over). */
const BEFORE_SETUP = [...WITHOUT_NAV, '/settings'];

const under = (path: string, bases: readonly string[]) =>
	bases.some((base) => path === base || path.startsWith(`${base}/`));

/** Whether the main navigation shows: signed in, setup finished, and not on one of those screens. */
export const load: LayoutServerLoad = ({ locals, url, cookies }) => {
	const path = url.pathname;
	// Signed out (and the build's prerender, which has no database) never reaches the database.
	if (locals.ownerId === null || under(path, WITHOUT_NAV)) {
		// Read once and cleared: a message from the last save shows on this page only.
		return { nav: false, flash: takeFlash(cookies) };
	}
	const setUp = getOwner(getDb(), locals.ownerId).setupStep === null;
	// Until setup is finished, every other page carries on with it, wherever the owner came in
	// (signing in again after signing out half way, an old link, a bookmark). Before the message is
	// read, so a message on its way survives to the setup page.
	if (!setUp && !under(path, BEFORE_SETUP)) redirect(303, '/setup');
	return { nav: setUp, flash: takeFlash(cookies) };
};
