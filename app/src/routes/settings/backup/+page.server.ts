import { fail, redirect } from '@sveltejs/kit';
import { currentSessionId } from '#lib/server/auth/cookie.ts';
import { sessionExists } from '#lib/server/auth/session.ts';
import { STEP_UP_MESSAGE, stepUps } from '#lib/server/auth/stepUp.ts';
import { stepUpAllows } from '#lib/server/auth/stepUpGate.ts';
import { getDb } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import { loggable } from '#lib/server/errors.ts';
import { log } from '#lib/server/log.ts';
import {
	BackupRefused,
	backupDue,
	lastBackupAt,
	MAX_BACKUP_BYTES,
	restoreBackup
} from '#lib/server/money/fullBackup.ts';
import { SessionEndedError } from '#lib/server/money/erase.ts';
import { getOwner } from '#lib/server/money/store.ts';
import { dateText } from '#lib/format.ts';
import { parseCalDate, todayIn } from '#lib/domain/dates.ts';
import type { Actions, PageServerLoad } from './$types';

/** The same word Start over asks for (settings/security): a restore replaces the budget too. */
const CONFIRM_WORD = 'DELETE';
const TOO_BIG =
	'That file is too big to be a Payday backup, or did not arrive whole, so nothing was changed.';

function requireOwner(locals: App.Locals): number {
	if (locals.ownerId === null) redirect(303, '/signin');
	return locals.ownerId;
}

export const load: PageServerLoad = async ({ locals, cookies, url, setHeaders }) => {
	const ownerId = requireOwner(locals);
	const db = await getDb();
	const sessionId = currentSessionId(cookies, url);
	const now = new Date();
	const last = await lastBackupAt(db, ownerId);
	const zone = (await getOwner(db, ownerId)).timeZone ?? 'UTC';
	setHeaders({ 'cache-control': 'private, no-store' });
	return {
		confirmed: sessionId ? await stepUps.hasAssertion(db, sessionId) : false,
		lastBackup: last ? dateText(parseCalDate(todayIn(zone, new Date(last)))) : null,
		due: backupDue(last, now),
		maxMb: MAX_BACKUP_BYTES / (1024 * 1024)
	};
};

export const actions: Actions = {
	/**
	 * Replaces the budget with a backup file: the same confirmation as Start over (a fresh confirmation
	 * and the word typed out), because it deletes what is there. The file is checked in full first; a
	 * refusal changes nothing.
	 */
	restore: async ({ locals, request, cookies, url }) => {
		const ownerId = requireOwner(locals);
		const confirmed = async () => {
			const sessionId = currentSessionId(cookies, url);
			return (
				sessionId !== null &&
				(await sessionExists(await getDb(), sessionId)) &&
				stepUpAllows(await getDb(), cookies, url, 'erase-data')
			);
		};
		if (!(await confirmed())) return fail(403, { restore: STEP_UP_MESSAGE });
		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			// Over the server's body limit (adapter-node BODY_SIZE_LIMIT, 512 KB unless raised), or cut off.
			return fail(400, {
				restore: TOO_BIG,
				field: 'file' as const
			});
		}
		if (
			String(form.get('confirm') ?? '')
				.trim()
				.toUpperCase() !== CONFIRM_WORD
		) {
			return fail(400, {
				restore: `Type ${CONFIRM_WORD} to replace your budget. Nothing was changed.`,
				field: 'confirm' as const
			});
		}
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, {
				restore: 'Choose the backup file first. Nothing was changed.',
				field: 'file' as const
			});
		}
		if (file.size > MAX_BACKUP_BYTES) {
			return fail(400, {
				restore: TOO_BIG,
				field: 'file' as const
			});
		}
		const text = await file.text();
		// The file took a while to arrive: the confirmation must still hold when the budget is replaced.
		if (!(await confirmed())) return fail(403, { restore: STEP_UP_MESSAGE });
		try {
			const restored = await restoreBackup(
				await getDb(),
				ownerId,
				text,
				currentSessionId(cookies, url) ?? undefined
			);
			log({ level: 'info', msg: 'budget restored from a backup by the owner', ...restored });
		} catch (error) {
			if (error instanceof SessionEndedError) return fail(403, { restore: STEP_UP_MESSAGE });
			if (error instanceof BackupRefused) {
				return fail(400, { restore: error.message, field: 'file' as const });
			}
			// The kind of failure only: never a value from the budget.
			log({
				level: 'error',
				msg: 'a backup restore failed and was rolled back',
				name: error instanceof Error ? error.name : 'unknown',
				message: loggable(error).message
			});
			return fail(500, {
				restore: 'Something went wrong, so nothing was changed. Try again, or use another copy.'
			});
		}
		setFlash(cookies, 'backup-restored');
		redirect(303, '/');
	}
};
