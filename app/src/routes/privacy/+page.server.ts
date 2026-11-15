import { CONTACT, assertContactSet } from '#lib/site.ts';
import type { PageServerLoad } from './$types';

export const prerender = true;

/** Runs during the build's prerender: a Netlify build fails while the contact is a placeholder. */
export const load: PageServerLoad = () => {
	assertContactSet(CONTACT, process.env.NETLIFY);
};
