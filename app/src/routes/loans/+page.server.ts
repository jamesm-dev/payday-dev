import { redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { presentLoans } from '#lib/server/money/loansView.ts';
import { requireOwner } from '#lib/server/money/request.ts';
import { getOwner } from '#lib/server/money/store.ts';
import type { PageServerLoad } from './$types';

// Plain text, forms and links: no script needed, so none is sent.
export const csr = false;

export const load: PageServerLoad = ({ locals }) => {
	const ownerId = requireOwner(locals);
	const db = getDb();
	if (getOwner(db, ownerId).setupStep !== null) redirect(303, '/setup');
	return { page: presentLoans(db, ownerId, new Date()) };
};
