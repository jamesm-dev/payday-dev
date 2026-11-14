import { fail, redirect } from '@sveltejs/kit';
import {
	clearSessionCookie,
	clientKey,
	currentSessionId,
	readSessionToken
} from '#lib/server/auth/cookie.ts';
import { failureBrake } from '#lib/server/auth/failureBrake.ts';
import { newRecoveryCodes } from '#lib/server/auth/oneTimeSlot.ts';
import {
	hasPassword,
	PasswordBusyError,
	passwordUnchanged,
	verifyOwnerPassword
} from '#lib/server/auth/password.ts';
import { listPasskeys, removePasskeyUnlessLast, renamePasskey } from '#lib/server/auth/passkeys.ts';
import {
	regenerateRecoveryCodes,
	unusedRecoveryCodeCount,
	RECOVERY_CODE_COUNT
} from '#lib/server/auth/recovery.ts';
import { beginAttempt, PASSWORD_CHANGED, TOO_MANY } from '#lib/server/auth/signInAttempt.ts';
import { deleteAllSessions, deleteSession, sessionExists } from '#lib/server/auth/session.ts';
import { STEP_UP_MESSAGE, stepUps } from '#lib/server/auth/stepUp.ts';
import { stepUpAllows } from '#lib/server/auth/stepUpGate.ts';
import { getDb } from '#lib/server/db/index.ts';
import { setFlash } from '#lib/server/flash.ts';
import { log } from '#lib/server/log.ts';
import { eraseBudget, SessionEndedError } from '#lib/server/money/erase.ts';
import type { Actions, PageServerLoad } from './$types';

/** Typed out to start over, so a stray tap can never delete the budget. */
const ERASE_WORD = 'DELETE';

/** The guard has already turned away anyone without a session; this is the second lock. */
function requireOwner(locals: App.Locals): number {
	if (locals.ownerId === null) redirect(303, '/signin');
	return locals.ownerId;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export const load: PageServerLoad = async ({ locals, cookies, url, setHeaders }) => {
	const ownerId = requireOwner(locals);
	const db = await getDb();
	const sessionId = currentSessionId(cookies, url);
	const token = readSessionToken(cookies, url);
	// Left by `regenerate` for this one read. Taking it empties the slot, so a reload shows none.
	const newCodes = token ? ((await newRecoveryCodes.take(db, token)) ?? null) : null;
	// Plain-text secrets: never let a browser or a proxy keep this page.
	if (newCodes) setHeaders({ 'cache-control': 'no-store' });
	return {
		newCodes,
		hasPassword: await hasPassword(db, ownerId),
		// Whether a fresh confirmation (password or passkey) is on record, and whether adding a device
		// is allowed (also true for 10 minutes after a recovery-code sign-in, the way back in).
		confirmed: sessionId ? await stepUps.hasAssertion(db, sessionId) : false,
		canAdd: await stepUpAllows(db, cookies, url, 'add-passkey'),
		passkeys: (await listPasskeys(db, ownerId)).map((p) => ({
			id: p.id,
			nickname: p.nickname ?? 'This device',
			addedOn: day(p.createdAt) as string,
			lastUsedOn: day(p.lastUsedAt)
		})),
		unusedCodes: await unusedRecoveryCodeCount(db, ownerId),
		totalCodes: RECOVERY_CODE_COUNT
	};
};

export const actions: Actions = {
	rename: async ({ locals, request }) => {
		const ownerId = requireOwner(locals);
		const form = await request.formData();
		await renamePasskey(await getDb(), ownerId, String(form.get('id') ?? ''), form.get('nickname'));
		return { done: 'rename' as const };
	},

	/**
	 * Confirms it is the owner with the password, for 5 minutes (the same as a device confirmation).
	 * Wrong passwords count against the per-IP limit and the global brake, like on the sign-in page.
	 */
	confirm: async (event) => {
		requireOwner(event.locals);
		const sessionId = currentSessionId(event.cookies, event.url);
		if (!sessionId) redirect(303, '/signin');
		const db = await getDb();
		const attempt = await beginAttempt(db, clientKey(event));
		if (!attempt.ok) {
			return attempt.reason === 'busy'
				? fail(503, { message: new PasswordBusyError().message })
				: fail(429, { message: TOO_MANY });
		}

		let success = false;
		try {
			const form = await event.request.formData();
			await failureBrake.wait(db);
			let check;
			try {
				check = await verifyOwnerPassword(db, event.locals.ownerId!, form.get('password'));
			} catch (error) {
				if (error instanceof PasswordBusyError) return fail(503, { message: error.message });
				throw error;
			}
			if (!check.ok) {
				await failureBrake.recordFailure(db);
				return fail(400, { message: 'That password is not right.' });
			}
			// The password, or this very session, may have been replaced while the check waited its turn.
			if (
				!(await passwordUnchanged(db, event.locals.ownerId!, check.hash)) ||
				!(await sessionExists(db, sessionId))
			) {
				await failureBrake.recordFailure(db);
				return fail(400, { message: PASSWORD_CHANGED });
			}
			await stepUps.markAssertion(db, sessionId);
			success = true;
		} finally {
			await attempt.done(success);
		}
		return { done: 'confirm' as const };
	},

	/** Needs a confirmation within the last 5 minutes. Any device may go, but not the last one while there is no password. */
	remove: async ({ locals, request, cookies, url }) => {
		const ownerId = requireOwner(locals);
		const db = await getDb();
		if (!(await stepUpAllows(db, cookies, url, 'remove-passkey'))) {
			return fail(403, { message: STEP_UP_MESSAGE });
		}
		const form = await request.formData();
		const result = await removePasskeyUnlessLast(db, ownerId, String(form.get('id') ?? ''));
		if (result === 'needs-password') {
			return fail(409, {
				message:
					'Set a password first. This is your only way in, and removing it would lock you out.'
			});
		}
		return { done: 'remove' as const };
	},

	/**
	 * Needs a confirmation within the last 5 minutes. The old codes stop working at once.
	 * The new ones are shown after a redirect, once: if this answered with the codes directly, a
	 * reload would re-send the form and replace them again.
	 */
	regenerate: async ({ locals, cookies, url, setHeaders }) => {
		const ownerId = requireOwner(locals);
		const sessionId = currentSessionId(cookies, url);
		const token = readSessionToken(cookies, url);
		const db = await getDb();
		if (!sessionId || !token || !(await stepUpAllows(db, cookies, url, 'regenerate-codes'))) {
			return fail(403, { message: STEP_UP_MESSAGE });
		}
		await regenerateRecoveryCodes(db, ownerId, new Date(), token);
		setHeaders({ 'cache-control': 'no-store' });
		redirect(303, '/settings/security');
	},

	/**
	 * Start over: deletes the budget and goes back to first-run setup; signing in is untouched (see
	 * erase.ts). Needs a confirmation within the last 5 minutes, and the word typed out, because there
	 * is no undo. The confirmation is checked before the form is read, and again just before the
	 * delete: a slow upload must not outlast a sign-out or the 5 minutes.
	 */
	erase: async ({ locals, request, cookies, url }) => {
		const ownerId = requireOwner(locals);
		const confirmed = async () => {
			const sessionId = currentSessionId(cookies, url);
			return (
				sessionId !== null &&
				(await sessionExists(await getDb(), sessionId)) &&
				stepUpAllows(await getDb(), cookies, url, 'erase-data')
			);
		};
		if (!(await confirmed())) return fail(403, { erase: STEP_UP_MESSAGE });
		const form = await request.formData();
		if (
			String(form.get('confirm') ?? '')
				.trim()
				.toUpperCase() !== ERASE_WORD
		) {
			return fail(400, {
				erase: `Type ${ERASE_WORD} to delete your budget. Nothing was deleted.`,
				field: 'confirm' as const
			});
		}
		// This answer can go stale while the delete waits for the owner lock, so the delete checks the
		// session again itself, inside its transaction, and refuses if it is gone.
		if (!(await confirmed())) return fail(403, { erase: STEP_UP_MESSAGE });
		let erased;
		try {
			erased = await eraseBudget(
				await getDb(),
				ownerId,
				currentSessionId(cookies, url) ?? undefined
			);
		} catch (error) {
			if (error instanceof SessionEndedError) return fail(403, { erase: STEP_UP_MESSAGE });
			throw error;
		}
		// The moment it happened: the only way back is a backup restored to just before it.
		log({ level: 'info', msg: 'budget erased by the owner', ...erased });
		setFlash(cookies, 'data-erased');
		redirect(303, '/setup');
	},

	signout: async ({ locals, cookies, url }) => {
		requireOwner(locals);
		const token = readSessionToken(cookies, url);
		if (token) await deleteSession(await getDb(), token);
		const sessionId = currentSessionId(cookies, url);
		if (sessionId) await stepUps.forget(await getDb(), sessionId);
		clearSessionCookie(cookies, url);
		redirect(303, '/signin');
	},

	signoutEverywhere: async ({ locals, cookies, url }) => {
		const ownerId = requireOwner(locals);
		await deleteAllSessions(await getDb(), ownerId);
		clearSessionCookie(cookies, url);
		redirect(303, '/signin');
	}
};
