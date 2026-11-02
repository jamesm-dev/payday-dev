import { getDb } from '#lib/server/db/index.ts';
import { presentHistory } from '#lib/server/money/checkinView.ts';
import { requireOwner } from '#lib/server/money/request.ts';
import type { PageServerLoad } from './$types';

// Plain text and links: no script needed, so none is sent.
export const csr = false;

export const load: PageServerLoad = ({ locals }) => {
	const ownerId = requireOwner(locals);
	return { rows: presentHistory(getDb(), ownerId, new Date()) };
};
