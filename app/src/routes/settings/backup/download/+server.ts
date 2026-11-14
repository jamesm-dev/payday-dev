import { redirect } from '@sveltejs/kit';
import { stepUpAllows } from '#lib/server/auth/stepUpGate.ts';
import { getDb } from '#lib/server/db/index.ts';
import { log } from '#lib/server/log.ts';
import {
	backupFilename,
	backupText,
	exportBackup,
	markBackupDownloaded
} from '#lib/server/money/fullBackup.ts';
import type { RequestHandler } from './$types';

/**
 * The whole budget as one file. It is plain text, so it goes only to a signed-in owner who confirmed
 * it is them within the last 5 minutes, and is never kept by the browser or a proxy. Without the
 * confirmation the owner is sent to the backup page, which says how to confirm.
 */
export const GET: RequestHandler = async ({ locals, cookies, url, request }) => {
	if (locals.ownerId === null) redirect(303, '/signin');
	// Only the owner's own clicks: a link on another site, or another site of the same host, must not
	// be able to start a download or move "last downloaded". A browser that sends no header is let in.
	const site = request.headers.get('sec-fetch-site');
	if (site !== null && site !== 'same-origin' && site !== 'none') {
		return new Response('Not available.', {
			status: 403,
			headers: { 'cache-control': 'no-store' }
		});
	}
	if (!stepUpAllows(cookies, url, 'export-data')) redirect(303, '/settings/backup');

	const db = await getDb();
	const now = new Date();
	const doc = await exportBackup(db, locals.ownerId, now);
	await markBackupDownloaded(db, locals.ownerId, now);
	log({ level: 'info', msg: 'full backup downloaded by the owner' });
	return new Response(backupText(doc), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="${backupFilename(doc.settings.timeZone, now)}"`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
