import { describe, expect, it } from 'vitest';
import { checkSetupCode } from './setupCode.ts';

describe('TSK-D7D015 the first owner needs the setup code in production', () => {
	const prod = { dev: false, expected: 'let-me-in' };

	it('accepts the right code, ignoring surrounding spaces', () => {
		expect(checkSetupCode({ ...prod, provided: 'let-me-in' }).ok).toBe(true);
		expect(checkSetupCode({ ...prod, provided: '  let-me-in ' }).ok).toBe(true);
	});

	it.each([undefined, null, '', '   ', 42])('refuses a missing code (%j)', (provided) => {
		const result = checkSetupCode({ ...prod, provided });
		expect(result).toMatchObject({ ok: false, reason: 'missing' });
	});

	it.each(['wrong', 'let-me-in!', 'LET-ME-IN', 'let-me'])(
		'refuses the wrong code %j',
		(provided) => {
			expect(checkSetupCode({ ...prod, provided })).toMatchObject({ ok: false, reason: 'wrong' });
		}
	);

	it('refuses everything, with a plain message, when the variable is not set', () => {
		for (const expected of [undefined, '']) {
			const result = checkSetupCode({ dev: false, expected, provided: 'anything' });
			expect(result).toMatchObject({ ok: false, reason: 'not-configured' });
			expect(!result.ok && result.message).toContain('OWNER_SETUP_CODE must be set');
		}
	});

	it('needs no code in development', () => {
		expect(checkSetupCode({ dev: true, expected: undefined, provided: undefined }).ok).toBe(true);
		expect(checkSetupCode({ dev: true, expected: 'x', provided: 'nope' }).ok).toBe(true);
	});
});
