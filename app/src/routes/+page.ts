import type { PageLoad } from './$types';

/**
 * One address, two pages: the product page for a visitor, the number for the owner. The product
 * page is imported only when it is the one shown, on the server and in the browser, so its code
 * and its motion never reach the signed-in home screen's bundle (its 60 KB budget, SPECS).
 */
export const load: PageLoad = async ({ data }) => {
	if (!data.landing) return { ...data, Landing: null };
	const { default: Landing } = await import('#lib/landing/Landing.svelte');
	return { ...data, Landing };
};
