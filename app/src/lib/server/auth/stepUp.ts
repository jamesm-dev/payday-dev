/**
 * Step-up: proof that the person at the keyboard knows the password, or holds a passkey, right now,
 * not just a session cookie that might have been left on a borrowed device. A password sign-in, a
 * passkey sign-in and a fresh confirmation each count. Adding or removing a passkey, changing the
 * password and regenerating the recovery codes all need it, because each one hands over the account.
 * So does deleting the budget to start over, because it cannot be undone.
 *
 * Kept in memory, keyed by session id (the hash of the cookie, as the database stores it). There is
 * one machine, and a restart only means verifying again, so no table is needed.
 */
export type StepUpAction =
	'add-passkey' | 'remove-passkey' | 'regenerate-codes' | 'change-password' | 'erase-data';

/** A password or passkey proof is good for this long. */
export const STEP_UP_MS = 5 * 60 * 1000;
/**
 * After signing in with a recovery code the owner may set a new password, or add a passkey, for
 * this long: the way back in after a forgotten password or a lost device.
 */
export const RECOVERY_ADD_MS = 10 * 60 * 1000;

type Entry = { assertedAt: number | null; recoveryAt: number | null };

export type StepUpStore = {
	/** The session just proved who it is: a password or passkey sign-in, or a fresh confirmation. */
	markAssertion(sessionId: string, now?: number): void;
	/** The session was opened with a recovery code. That is NOT a step-up. */
	markRecoverySignIn(sessionId: string, now?: number): void;
	allows(sessionId: string, action: StepUpAction, now?: number): boolean;
	/** True when a fresh assertion is on record (what the page shows as "confirmed"). */
	hasAssertion(sessionId: string, now?: number): boolean;
	/** True while a recovery-code sign-in's 10-minute window is open. */
	hasRecoveryWindow(sessionId: string, now?: number): boolean;
	/** Closes the recovery window early: the new password is set, so it is no longer needed. */
	clearRecoveryWindow(sessionId: string): void;
	forget(sessionId: string): void;
	size(): number;
};

export function createStepUpStore(maxSessions = 1000): StepUpStore {
	const entries = new Map<string, Entry>();

	const live = (e: Entry, now: number) =>
		(e.assertedAt !== null && now - e.assertedAt < STEP_UP_MS) ||
		(e.recoveryAt !== null && now - e.recoveryAt < RECOVERY_ADD_MS);

	const touch = (sessionId: string, now: number, patch: Partial<Entry>) => {
		for (const [id, e] of entries) if (!live(e, now)) entries.delete(id);
		const previous = entries.get(sessionId) ?? { assertedAt: null, recoveryAt: null };
		entries.delete(sessionId);
		entries.set(sessionId, { ...previous, ...patch });
		while (entries.size > maxSessions) entries.delete(entries.keys().next().value as string);
	};

	const fresh = (sessionId: string, now: number) => {
		const at = entries.get(sessionId)?.assertedAt;
		return at !== null && at !== undefined && now - at < STEP_UP_MS;
	};

	const recoveryOpen = (sessionId: string, now: number) => {
		const at = entries.get(sessionId)?.recoveryAt;
		return at !== null && at !== undefined && now - at < RECOVERY_ADD_MS;
	};

	return {
		markAssertion: (sessionId, now = Date.now()) => touch(sessionId, now, { assertedAt: now }),
		markRecoverySignIn: (sessionId, now = Date.now()) => touch(sessionId, now, { recoveryAt: now }),
		hasAssertion: (sessionId, now = Date.now()) => fresh(sessionId, now),
		hasRecoveryWindow: (sessionId, now = Date.now()) => recoveryOpen(sessionId, now),
		allows(sessionId, action, now = Date.now()) {
			if (fresh(sessionId, now)) return true;
			if (action !== 'add-passkey' && action !== 'change-password') return false;
			return recoveryOpen(sessionId, now);
		},
		clearRecoveryWindow(sessionId) {
			const e = entries.get(sessionId);
			if (!e) return;
			if (e.assertedAt === null) entries.delete(sessionId);
			else entries.set(sessionId, { ...e, recoveryAt: null });
		},
		forget: (sessionId) => void entries.delete(sessionId),
		size: () => entries.size
	};
}

export const stepUps = createStepUpStore();

export const STEP_UP_MESSAGE = 'Confirm it is you first, then try again.';
