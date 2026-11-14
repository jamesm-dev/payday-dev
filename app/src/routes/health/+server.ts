import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

/** Reports whether the database can be read. 503 when it cannot (a paused Supabase project, say). */
export const GET: RequestHandler = async () => {
	let database: 'ok' | 'error' = 'ok';
	try {
		await (await getDb()).execute(sql`select 1`);
	} catch {
		database = 'error';
	}

	return json(
		{ database },
		{ status: database === 'ok' ? 200 : 503, headers: { 'cache-control': 'no-store' } }
	);
};
