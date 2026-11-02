import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { backupStatus } from '#lib/server/backup.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

/**
 * Fly.io's health check. Fails only when the database cannot be read: a stale backup is reported in
 * the body, because restarting the app would not fix it.
 */
export const GET: RequestHandler = () => {
	let database: 'ok' | 'error' = 'ok';
	try {
		getDb().get(sql`select 1`);
	} catch {
		database = 'error';
	}

	return json(
		{ database, backup: backupStatus() },
		{ status: database === 'ok' ? 200 : 503, headers: { 'cache-control': 'no-store' } }
	);
};
