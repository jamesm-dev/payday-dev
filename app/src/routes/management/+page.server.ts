import { assertDev, loadDashboard } from '#lib/server/management/index.ts';
import type { PageServerLoad } from './$types';

/** Both stores, read on every load and re-read after every successful write. Dev-only. */
export const load: PageServerLoad = () => {
	assertDev();
	return loadDashboard();
};
