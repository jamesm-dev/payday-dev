import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { OWNER_SETUP_CODE } from '$app/env/private';
import { registerWithPassword } from '#lib/server/auth/account.ts';
import { clientKey, startPasswordSession, startSession } from '#lib/server/auth/cookie.ts';
import { failureBrake } from '#lib/server/auth/failureBrake.ts';
import { refuseFirstRegistration } from '#lib/server/auth/firstRegistration.ts';
import { safeNext } from '#lib/server/auth/next.ts';
import { PasswordBusyError, verifyOwnerPassword } from '#lib/server/auth/password.ts';
import { hasPasskeys, OWNER_ID, ownerExists } from '#lib/server/auth/passkeys.ts';
import { beginAttempt, PASSWORD_CHANGED, TOO_MANY } from '#lib/server/auth/signInAttempt.ts';
import { redeemRecoveryCode } from '#lib/server/auth/recovery.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url, request, setHeaders }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (locals.ownerId !== null) redirect(303, next);
	// Never kept by the browser, so Back after signing in asks the server again, which sends a
	// signed-in owner on (above) instead of showing a stale sign-in page from the back-forward
	// cache. Only on a plain visit: after a form post the action may already have set this header
	// (registration does), and SvelteKit refuses to set one twice.
	if (request.method === 'GET') setHeaders({ 'cache-control': 'no-store' });
	const db = getDb();
	const open = !ownerExists(db);
	// "Create your password" shows only while nobody has registered; then it is sign-in.
	// In production the first owner also needs the setup code (OWNER_SETUP_CODE); development does not.
	// The device button shows only once the owner has added one.
	return {
		registrationOpen: open,
		needsSetupCode: !dev,
		hasPasskey: !open && hasPasskeys(db, OWNER_ID),
		next
	};
};

export const actions: Actions = {
	/** The first registration. Works without JavaScript: a plain form post. */
	register: async (event) => {
		const form = await event.request.formData();
		const key = clientKey(event);
		const refusal = refuseFirstRegistration(form.get('setupCode'), key);
		if (refusal)
			return fail(refusal.status, {
				which: 'register' as const,
				field: 'setupCode' as const,
				message: refusal.message
			});

		const result = await registerWithPassword(
			getDb(),
			form.get('password'),
			form.get('again'),
			OWNER_SETUP_CODE
		);
		if (!result.ok) {
			return fail(result.refusal.status, {
				which: 'register' as const,
				field: 'password' as const,
				message: result.refusal.message
			});
		}
		startSession(getDb(), event, result.ownerId, 'registration');
		// The only time the codes exist in plain text; only their hashes are stored.
		event.setHeaders({ 'cache-control': 'no-store' });
		return { which: 'register' as const, recoveryCodes: result.recoveryCodes };
	},

	/** Works without JavaScript: a plain form post. */
	password: async (event) => {
		const form = await event.request.formData();
		const next = safeNext(String(form.get('next') ?? ''));
		const key = clientKey(event);
		// Charged and given a queue place now, before the brake or the hash (see signInAttempt.ts).
		const attempt = beginAttempt(key);
		if (!attempt.ok)
			return fail(429, {
				which: 'password' as const,
				field: 'password' as const,
				next,
				message: TOO_MANY
			});

		let success = false;
		try {
			// Spread-out guessing is slowed here, for everyone alike (see failureBrake.ts).
			await failureBrake.wait();
			const db = getDb();
			let check;
			try {
				check = await verifyOwnerPassword(db, OWNER_ID, form.get('password'));
			} catch (error) {
				if (error instanceof PasswordBusyError) {
					return fail(503, {
						which: 'password' as const,
						field: 'password' as const,
						next,
						message: error.message
					});
				}
				throw error;
			}
			if (!check.ok) {
				failureBrake.recordFailure();
				return fail(400, {
					which: 'password' as const,
					field: 'password' as const,
					next,
					message: 'That password is not right.'
				});
			}

			// The password may have been changed while this one waited: then it is the OLD one.
			if (!startPasswordSession(db, event, OWNER_ID, check.hash as string)) {
				failureBrake.recordFailure();
				return fail(400, {
					which: 'password' as const,
					field: 'password' as const,
					next,
					message: PASSWORD_CHANGED
				});
			}
			success = true;
		} finally {
			attempt.done(success);
		}
		redirect(303, next);
	},

	/** Works without JavaScript: a plain form post. */
	recovery: async (event) => {
		const form = await event.request.formData();
		const next = safeNext(String(form.get('next') ?? ''));
		const code = String(form.get('code') ?? '');

		const attempt = beginAttempt(clientKey(event));
		if (!attempt.ok)
			return fail(429, {
				which: 'recovery' as const,
				field: 'code' as const,
				next,
				message: TOO_MANY
			});

		let ownerId: number | null = null;
		try {
			await failureBrake.wait();
			const db = getDb();
			ownerId = redeemRecoveryCode(db, code);
			if (ownerId !== null) startSession(db, event, ownerId, 'recovery');
		} finally {
			attempt.done(ownerId !== null);
		}
		if (ownerId === null) {
			failureBrake.recordFailure();
			return fail(400, {
				which: 'recovery' as const,
				field: 'code' as const,
				next,
				message: 'That recovery code did not work. Each one can be used once.'
			});
		}

		// A recovery code means the password is forgotten (or the devices are lost): go straight to
		// setting a new one. The page does the rest; it is allowed without the old password for 10 minutes.
		redirect(303, `/settings/security/password?next=${encodeURIComponent(next)}`);
	}
};
