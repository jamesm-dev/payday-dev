import { dev } from '$app/env';
import { OWNER_SETUP_CODE } from '$app/env/private';
import { signInFailures } from './rateLimit.ts';
import { checkSetupCode } from './setupCode.ts';

/**
 * The gate in front of the FIRST registration. Returns the refusal to show, or null to carry on.
 * A wrong code counts against the same per-IP limit as a wrong password or recovery code.
 */
export function refuseFirstRegistration(
	provided: unknown,
	key: string
): { status: number; message: string } | null {
	if (signInFailures.isLimited(key)) {
		return { status: 429, message: 'Too many tries. Wait a minute, then try again.' };
	}
	const result = checkSetupCode({ dev, expected: OWNER_SETUP_CODE, provided });
	if (result.ok) return null;
	if (result.reason === 'wrong') signInFailures.recordFailure(key);
	return { status: 403, message: result.message };
}
