import { eq, sql } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { session } from '#lib/server/db/schema.ts';

/**
 * Step-up: proof that the person at the keyboard knows the password, or holds a passkey, right now,
 * not just a session cookie that might have been left on a borrowed device. A password sign-in, a
 * passkey sign-in and a fresh confirmation each count. Adding or removing a passkey, changing the
 * password and regenerating the recovery codes all need it, because each one hands over the account.
 * So does deleting the budget to start over, or replacing it by restoring a backup, because it
 * cannot be undone, and so does downloading a full backup, because the file holds the whole budget
 * in plain text.
 *
 * Kept in the database, on the session's own row (`session.step_up_at` and `recovery_at`), keyed by
 * session id (the hash of the cookie, as the database stores it): on Netlify any request may run in
 * a fresh function instance, so memory cannot hold it. Living on the session row means it ends with
 * the session, however the session ends, and a session that no longer exists can neither be marked
 * nor read as confirmed. Every read compares the stored instant with `now`, so a stale one is never
 * current; every mark also clears the other instant if it has run out.
 */
export type StepUpAction =
	| 'add-passkey'
	| 'remove-passkey'
	| 'regenerate-codes'
	| 'change-password'
	| 'erase-data'
	| 'export-data'
	| 'connect-google'
	| 'disconnect-google';

/** A password or passkey proof is good for this long. */
export const STEP_UP_MS = 5 * 60 * 1000;
/**
 * A "Confirm with Google" is good for this long, shorter than a password proof (ADR-0028): Google
 * cannot be forced to ask again (its only prompts are none, consent and select_account), so a
 * person already signed in to Google on a borrowed phone can pass it. The weaker proof is kept
 * short, in the same single instant on the session row, by recording it backdated.
 */
export const GOOGLE_STEP_UP_MS = 2 * 60 * 1000;
/**
 * After signing in with a recovery code the owner may set a new password, or add a passkey, for
 * this long: the way back in after a forgotten password or a lost device.
 */
export const RECOVERY_ADD_MS = 10 * 60 * 1000;

export type StepUpStore = {
	/** The session just proved who it is: a password or passkey sign-in, or a fresh confirmation. */
	markAssertion(db: Db, sessionId: string, now?: number): Promise<void>;
	/**
	 * The session just came back from a fresh Google round trip with the same account id. Weaker than
	 * a password (see GOOGLE_STEP_UP_MS): it lasts only that long, and never shortens a fresher
	 * password or passkey proof already on record.
	 */
	markGoogleConfirmation(db: Db, sessionId: string, now?: number): Promise<void>;
	/** The session was opened with a recovery code. That is NOT a step-up. */
	markRecoverySignIn(db: Db, sessionId: string, now?: number): Promise<void>;
	allows(db: Db, sessionId: string, action: StepUpAction, now?: number): Promise<boolean>;
	/** True when a fresh assertion is on record (what the page shows as "confirmed"). */
	hasAssertion(db: Db, sessionId: string, now?: number): Promise<boolean>;
	/** True while a recovery-code sign-in's 10-minute window is open. */
	hasRecoveryWindow(db: Db, sessionId: string, now?: number): Promise<boolean>;
	/** Closes the recovery window early: the new password is set, so it is no longer needed. */
	clearRecoveryWindow(db: Db, sessionId: string): Promise<void>;
	/** Takes back both records. (Ending the session does that by itself: they are on its row.) */
	forget(db: Db, sessionId: string): Promise<void>;
};

export function createStepUpStore(): StepUpStore {
	const read = async (db: Db, sessionId: string, now: number) => {
		const [row] = await db
			.select({ assertedAt: session.stepUpAt, recoveryAt: session.recoveryAt })
			.from(session)
			.where(eq(session.id, sessionId));
		return {
			asserted: row?.assertedAt != null && now - row.assertedAt < STEP_UP_MS,
			recovery: row?.recoveryAt != null && now - row.recoveryAt < RECOVERY_ADD_MS
		};
	};

	return {
		async markAssertion(db, sessionId, now = Date.now()) {
			await db
				.update(session)
				.set({
					stepUpAt: now,
					recoveryAt: sql`case when ${session.recoveryAt} > ${now - RECOVERY_ADD_MS}::bigint then ${session.recoveryAt} end`
				})
				.where(eq(session.id, sessionId));
		},
		async markGoogleConfirmation(db, sessionId, now = Date.now()) {
			// Stored as an instant that expires after GOOGLE_STEP_UP_MS, not STEP_UP_MS.
			const instant = now - (STEP_UP_MS - GOOGLE_STEP_UP_MS);
			await db
				.update(session)
				.set({
					stepUpAt: sql`greatest(${session.stepUpAt}, ${instant}::bigint)`,
					recoveryAt: sql`case when ${session.recoveryAt} > ${now - RECOVERY_ADD_MS}::bigint then ${session.recoveryAt} end`
				})
				.where(eq(session.id, sessionId));
		},
		async markRecoverySignIn(db, sessionId, now = Date.now()) {
			await db
				.update(session)
				.set({
					recoveryAt: now,
					stepUpAt: sql`case when ${session.stepUpAt} > ${now - STEP_UP_MS}::bigint then ${session.stepUpAt} end`
				})
				.where(eq(session.id, sessionId));
		},
		hasAssertion: async (db, sessionId, now = Date.now()) =>
			(await read(db, sessionId, now)).asserted,
		hasRecoveryWindow: async (db, sessionId, now = Date.now()) =>
			(await read(db, sessionId, now)).recovery,
		async allows(db, sessionId, action, now = Date.now()) {
			const { asserted, recovery } = await read(db, sessionId, now);
			if (asserted) return true;
			// Connecting Google is allowed like adding a passkey: a person back in with a recovery code
			// may attach a way in. Disconnecting is not (it removes one).
			if (action !== 'add-passkey' && action !== 'change-password' && action !== 'connect-google') {
				return false;
			}
			return recovery;
		},
		async clearRecoveryWindow(db, sessionId) {
			await db.update(session).set({ recoveryAt: null }).where(eq(session.id, sessionId));
		},
		async forget(db, sessionId) {
			await db
				.update(session)
				.set({ stepUpAt: null, recoveryAt: null })
				.where(eq(session.id, sessionId));
		}
	};
}

export const stepUps = createStepUpStore();

export const STEP_UP_MESSAGE = 'Confirm it is you first, then try again.';
