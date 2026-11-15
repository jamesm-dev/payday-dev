import { CONTACT, assertContactSet } from '#lib/site.ts';
import { googleConfig } from '#lib/server/auth/google/config.ts';
import type { PageServerLoad } from './$types';

export const prerender = true;

/**
 * Runs during the build's prerender: a Netlify build fails while the contact is a placeholder.
 * It also says whether Google sign-in is on, read from the build's environment (TSK-c3b872). Only
 * that yes or no goes into the page, never the id or the secret. Switching Google on or off needs a
 * new build for the notice to follow.
 */
export const load: PageServerLoad = () => {
	assertContactSet(CONTACT, process.env.NETLIFY);
	return { google: googleConfig() !== null };
};
