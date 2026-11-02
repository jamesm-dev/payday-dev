import { safeEqual, sha256Hex } from './tokens.ts';

/**
 * Until the owner registers, anyone who finds the hostname could become the owner. In production
 * the first registration therefore needs a one-time code that only the operator knows
 * (OWNER_SETUP_CODE, set as a Fly secret). In development there is nothing to protect.
 */
export type SetupCodeResult =
	{ ok: true } | { ok: false; reason: 'not-configured' | 'missing' | 'wrong'; message: string };

export const SETUP_CODE_NOT_CONFIGURED =
	'First registration is refused: OWNER_SETUP_CODE must be set on the server before the owner can register.';

export function checkSetupCode(opts: {
	dev: boolean;
	expected: string | undefined;
	provided: unknown;
}): SetupCodeResult {
	if (opts.dev) return { ok: true };
	if (!opts.expected) {
		return { ok: false, reason: 'not-configured', message: SETUP_CODE_NOT_CONFIGURED };
	}
	const provided = typeof opts.provided === 'string' ? opts.provided.trim() : '';
	if (!provided) {
		return { ok: false, reason: 'missing', message: 'Enter the setup code to create the owner.' };
	}
	// Compare digests, so the length of the real code does not leak and the comparison is constant time.
	if (!safeEqual(sha256Hex(provided), sha256Hex(opts.expected.trim()))) {
		return { ok: false, reason: 'wrong', message: 'That setup code is not right.' };
	}
	return { ok: true };
}
