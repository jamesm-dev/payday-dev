import { getDb } from '#lib/server/db/index.ts';
import { requireOwner } from '#lib/server/money/request.ts';
import { getItem } from '#lib/server/money/store.ts';
import type { PageServerLoad } from './$types';

export const csr = false;

export const load: PageServerLoad = ({ locals, url }) => {
	const ownerId = requireOwner(locals);
	// A payment picked on the schedule screen travels along, to be linked on the next screen.
	const raw = url.searchParams.get('item') ?? '';
	const item = /^\d{1,9}$/.test(raw) ? getItem(getDb(), ownerId, Number(raw)) : null;
	return { item: item && item.kind !== 'income' ? { id: item.id, name: item.name } : null };
};
