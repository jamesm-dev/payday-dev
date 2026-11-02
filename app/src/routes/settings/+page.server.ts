import { getDb } from '#lib/server/db/index.ts';
import { backupDue, lastBackupAt } from '#lib/server/money/fullBackup.ts';
import type { PageServerLoad } from './$types';

// Plain text and links: no script needed, so none is sent.
export const csr = false;

export const load: PageServerLoad = ({ locals }) => {
	const last = locals.ownerId === null ? null : lastBackupAt(getDb(), locals.ownerId);
	return { backupDue: backupDue(last, new Date()), backupEver: last !== null };
};
