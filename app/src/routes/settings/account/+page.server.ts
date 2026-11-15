import { fail, redirect } from '@sveltejs/kit';
import { clearSessionCookie, currentSessionId } from '#lib/server/auth/cookie.ts';
import { deleteAccount } from '#lib/server/auth/deleteAccount.ts';
import { sessionExists } from '#lib/server/auth/session.ts';
import { STEP_UP_MESSAGE, stepUps } from '#lib/server/auth/stepUp.ts';
import { stepUpAllows } from '#lib/server/auth/stepUpGate.ts';
import { getDb } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import { log } from '#lib/server/log.ts';
import { SessionEndedError } from '#lib/server/money/erase.ts';
import type { Actions, PageServerLoad } from './$types';

/** Typed out to delete, as Start over and a backup restore ask: a stray tap can never do this. */
const CONFIRM_WORD = 'DELETE';

function requireOwner(locals: App.Locals): number {
	if (locals.ownerId === null) redirect(303, '/signin');
	return locals.ownerId;
}

export const load: PageServerLoad = async ({ locals, cookies, url, setHeaders }) => {
	requireOwner(locals);
	const sessionId = currentSessionId(cookies, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	return {
		confirmed: sessionId ? await stepUps.hasAssertion(await getDb(), sessionId) : false
	};
};

export const actions: Actions = {
	/**
	 * Deletes the account and everything in it, for good (deleteAccount.ts). Needs a confirmation
	 * made in the last 5 minutes and the word typed out. The confirmation is checked before the form
	 * is read and again just before the delete, and the delete checks the session itself inside its
	 * transaction. Then every device is signed out and the person lands on the sign-in page.
	 */
	delete: async ({ locals, request, cookies, url }) => {
		const ownerId = requireOwner(locals);
		const confirmed = async () => {
			const sessionId = currentSessionId(cookies, url);
			return (
				sessionId !== null &&
				(await sessionExists(await getDb(), sessionId)) &&
				stepUpAllows(await getDb(), cookies, url, 'erase-data')
			);
		};
		if (!(await confirmed())) return fail(403, { delete: STEP_UP_MESSAGE });
		const form = await request.formData();
		if (
			String(form.get('confirm') ?? '')
				.trim()
				.toUpperCase() !== CONFIRM_WORD
		) {
			return fail(400, {
				delete: `Type ${CONFIRM_WORD} to delete your account. Nothing was deleted.`,
				field: 'confirm' as const
			});
		}
		if (!(await confirmed())) return fail(403, { delete: STEP_UP_MESSAGE });
		let gone;
		try {
			gone = await deleteAccount(
				await getDb(),
				ownerId,
				currentSessionId(cookies, url) ?? undefined
			);
		} catch (error) {
			if (error instanceof SessionEndedError) return fail(403, { delete: STEP_UP_MESSAGE });
			throw error;
		}
		// Counts only: never who it was.
		log({ level: 'info', msg: 'account deleted by its owner', ...gone });
		clearSessionCookie(cookies, url);
		setFlash(cookies, 'account-deleted');
		redirect(303, '/signin');
	}
};
