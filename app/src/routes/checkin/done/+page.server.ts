import { redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/db/index.ts';
import { presentDone } from '#lib/server/money/checkinView.ts';
import { requireOwner } from '#lib/server/money/request.ts';
import type { PageServerLoad } from './$types';

// Plain text and links: no script needed, so none is sent.
export const csr = false;

/** Where a finished check-in ends: the latest one, its number, the next two weeks. */
export const load: PageServerLoad = ({ locals }) => {
	const ownerId = requireOwner(locals);
	const done = presentDone(getDb(), ownerId, new Date());
	if (!done) redirect(303, '/checkin');
	return { done };
};
