import { fail, redirect } from '@sveltejs/kit';
import { OWNER_SETUP_CODE } from '$app/env/private';
import { changePassword } from '#lib/server/auth/account.ts';
import { clientKey, currentSessionId } from '#lib/server/auth/cookie.ts';
import { failureBrake } from '#lib/server/auth/failureBrake.ts';
import { safeNext } from '#lib/server/auth/next.ts';
import { hasPassword } from '#lib/server/auth/password.ts';
import { beginAttempt, TOO_MANY } from '#lib/server/auth/signInAttempt.ts';
import { stepUps } from '#lib/server/auth/stepUp.ts';
import { stepUpAllows } from '#lib/server/auth/stepUpGate.ts';
import { getDb } from '#lib/server/db/index.ts';
import type { Actions, PageServerLoad } from './$types';

/** Where to go afterwards: the page asked for, if it is on this site, else the security page. */
const after = (raw: unknown) => {
	const next = safeNext(typeof raw === 'string' ? raw : '');
	return next === '/' && raw !== '/' ? '/settings/security' : next;
};

export const load: PageServerLoad = ({ locals, cookies, url }) => {
	if (locals.ownerId === null) redirect(303, '/signin');
	const sessionId = currentSessionId(cookies, url);
	return {
		hasPassword: hasPassword(getDb(), locals.ownerId),
		// A recovery-code sign-in, within its 10 minutes: the forgotten-password path.
		recovering: sessionId ? stepUps.hasRecoveryWindow(sessionId) : false,
		// May the old password be left out? Only after a fresh confirmation or a recovery sign-in.
		canSkipCurrent: stepUpAllows(cookies, url, 'change-password'),
		next: after(url.searchParams.get('next'))
	};
};

export const actions: Actions = {
	/**
	 * Sets a new password. The current one is needed unless this session just confirmed it is the
	 * owner or just signed in with a recovery code. Every OTHER session ends.
	 */
	change: async (event) => {
		const { locals, cookies, url, request } = event;
		if (locals.ownerId === null) redirect(303, '/signin');
		const sessionId = currentSessionId(cookies, url);
		if (!sessionId) redirect(303, '/signin');

		const form = await request.formData();
		const current = form.get('current');
		const typedCurrent = typeof current === 'string' && current.length > 0;

		// Typing the old password is a guess at it: charged at entry and given a queue place, like a
		// sign-in. Without it (a step-up or the recovery window) there is nothing to guess.
		const attempt = typedCurrent ? beginAttempt(clientKey(event)) : null;
		if (attempt && !attempt.ok) return fail(429, { message: TOO_MANY });

		let result;
		try {
			// Guessing the old password is slowed like any other guess (see failureBrake.ts).
			if (typedCurrent) await failureBrake.wait();
			result = await changePassword(getDb(), {
				ownerId: locals.ownerId,
				sessionId,
				current,
				password: form.get('password'),
				again: form.get('again'),
				stepUpOk: stepUpAllows(cookies, url, 'change-password'),
				setupCode: OWNER_SETUP_CODE
			});
		} finally {
			// A wrong guess keeps its charge; anything else gives it back.
			if (attempt?.ok) attempt.done(!(result && !result.ok && result.refusal.guess));
		}
		if (!result.ok) {
			if (result.refusal.guess) failureBrake.recordFailure();
			return fail(result.refusal.status, { message: result.refusal.message });
		}

		// The new password is set: the recovery window has done its job and must not open it again.
		stepUps.clearRecoveryWindow(sessionId);
		for (const id of result.endedSessions) stepUps.forget(id);
		// Typing the old password right is a confirmation, like signing in with it.
		if (result.provedWithPassword) stepUps.markAssertion(sessionId);
		redirect(303, after(String(form.get('next') ?? '')));
	}
};
