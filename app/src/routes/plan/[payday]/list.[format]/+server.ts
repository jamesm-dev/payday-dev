import { error } from '@sveltejs/kit';
import { parseCalDate, type CalDate } from '#lib/domain/dates.ts';
import { getDb } from '#lib/server/db/index.ts';
import { FORMATS, isFormat } from '#lib/server/export/index.ts';
import { buildPaycheckList } from '#lib/server/money/paycheckListView.ts';
import { requireOwner } from '#lib/server/money/request.ts';
import type { RequestHandler } from './$types';

function paydayOf(raw: string): CalDate | null {
	try {
		return parseCalDate(raw);
	} catch {
		return null;
	}
}

/**
 * One paycheck's list as a download: /plan/2026-11-13/list.txt, .pdf or .docx. Only the next six
 * paychecks exist, the same ones the Plan page shows. Private and never cached: it is the owner's
 * money, and the next mark on the plan changes it.
 */
export const GET: RequestHandler = ({ params, locals }) => {
	const ownerId = requireOwner(locals);
	const payday = paydayOf(params.payday);
	if (!payday || !isFormat(params.format)) error(404, 'Not found');

	const list = buildPaycheckList(getDb(), ownerId, new Date(), payday);
	if (!list) error(404, 'That payday is not one of your next six paychecks.');

	const format = FORMATS[params.format];
	return new Response(format.write(list.lines, `Paycheck ${payday}`), {
		headers: {
			'content-type': format.type,
			'content-disposition': `attachment; filename="payday-${payday}.${params.format}"`,
			'cache-control': 'private, no-store'
		}
	});
};
