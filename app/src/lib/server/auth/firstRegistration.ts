import { dev } from '$app/env';
import { OWNER_SETUP_CODE } from '$app/env/private';
import type { Db } from '#lib/server/db/open.ts';
import { signInFailures } from './rateLimit.ts';
import { checkSetupCode } from './setupCode.ts';

/**
 * The gate in front of the FIRST registration. Returns the refusal to show, or null to carry on.
 * It charges the old entry-time limit `signInFailures` (10 a minute per address), now used by this
 * door and sign-up only. Passwords, recovery codes and passkey confirmations count failures after
 * the answer instead (signInAttempt.ts). Only a wrong code keeps its charge.
 */
export async function refuseFirstRegistration(
	db: Db,
	provided: unknown,
	key: string
): Promise<{ status: number; message: string } | null> {
	// Charged FIRST, in one atomic statement, so requests fired together cannot all get their code
	// checked: only as many as the limit allows get past this line.
	if (!(await signInFailures.hit(db, key))) {
		return { status: 429, message: 'Too many tries. Wait a minute, then try again.' };
	}
	const result = checkSetupCode({ dev, expected: OWNER_SETUP_CODE, provided });
	// Only a wrong code keeps its charge.
	if (!result.ok && result.reason === 'wrong') return { status: 403, message: result.message };
	await signInFailures.refund(db, key);
	return result.ok ? null : { status: 403, message: result.message };
}
