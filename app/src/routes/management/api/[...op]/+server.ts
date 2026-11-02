import { json } from '@sveltejs/kit';
import {
	assertDev,
	ManagementError,
	readBoardOnly,
	readStateOnly,
	write
} from '#lib/server/management/index.ts';
import type { RequestHandler } from './$types';

/*
 * The dashboard's operation set: GET state and board, and the seventeen POST writes of
 * .management/design/API Surface.md. Dev-only, like the page: in production every request here is
 * a 404. A refusal is { error: "<human sentence>" }, rendered verbatim by the page.
 */

const refuse = (e: unknown) =>
	e instanceof ManagementError
		? json({ error: e.message }, { status: 400 })
		: json(
				{ error: `The write failed: ${e instanceof Error ? e.message : String(e)}` },
				{ status: 500 }
			);

export const GET: RequestHandler = ({ params }) => {
	assertDev();
	try {
		if (params.op === 'state') return json(readStateOnly());
		if (params.op === 'board') return json(readBoardOnly());
	} catch (e) {
		return refuse(e);
	}
	return json({ error: `unknown read: ${params.op}` }, { status: 404 });
};

export const POST: RequestHandler = async ({ params, request }) => {
	assertDev();
	let payload: Record<string, unknown>;
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'the request body must be JSON' }, { status: 400 });
	}
	try {
		return json(write(params.op, payload) ?? {});
	} catch (e) {
		return refuse(e);
	}
};
