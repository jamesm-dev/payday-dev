import { error } from '@sveltejs/kit';
import { completeGoogleCallback, googleFor } from '#lib/server/auth/google/complete.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

/**
 * Where Google sends the person back (ADR-0028). Whatever happens it ends in a 303 to a page on this
 * site, so the one-time code leaves the address bar and the history. Never cached. Off, or over plain
 * http on the hosted build, it does not exist (404).
 */
export const GET: RequestHandler = async (event) => {
	const config = googleFor(event.url);
	if (!config) error(404, 'Not found');
	const location = await completeGoogleCallback(await getDb(), event, config);
	return new Response(null, {
		status: 303,
		headers: { location, 'cache-control': 'no-store' }
	});
};
