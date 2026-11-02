import { describe, expect, it } from 'vitest';
import { createStepUpStore, RECOVERY_ADD_MS, STEP_UP_MS, type StepUpAction } from './stepUp.ts';

const ACTIONS: StepUpAction[] = [
	'add-passkey',
	'remove-passkey',
	'regenerate-codes',
	'change-password'
];

describe('TSK-D7D015 step-up gates adding or removing a passkey and new recovery codes', () => {
	it('refuses every action to a session that never proved who it is', () => {
		const store = createStepUpStore();
		for (const action of ACTIONS) expect(store.allows('s1', action, 0)).toBe(false);
	});

	it('allows every action for 5 minutes after a password or passkey proof, and not a moment longer', () => {
		const store = createStepUpStore();
		store.markAssertion('s1', 1000);
		for (const action of ACTIONS) {
			expect(store.allows('s1', action, 1000 + STEP_UP_MS - 1)).toBe(true);
			expect(store.allows('s1', action, 1000 + STEP_UP_MS)).toBe(false);
		}
	});

	it('is per session: one session confirming does nothing for another', () => {
		const store = createStepUpStore();
		store.markAssertion('s1', 0);
		expect(store.allows('s2', 'remove-passkey', 1)).toBe(false);
	});

	it('does not count a recovery-code sign-in as a step-up', () => {
		const store = createStepUpStore();
		store.markRecoverySignIn('r', 0);
		expect(store.hasAssertion('r', 1)).toBe(false);
		expect(store.allows('r', 'remove-passkey', 1)).toBe(false);
		expect(store.allows('r', 'regenerate-codes', 1)).toBe(false);
	});

	it('lets a recovery session add a passkey or set a new password for 10 minutes, and only those', () => {
		const store = createStepUpStore();
		store.markRecoverySignIn('r', 0);
		for (const action of ['add-passkey', 'change-password'] as const) {
			expect(store.allows('r', action, RECOVERY_ADD_MS - 1)).toBe(true);
			expect(store.allows('r', action, RECOVERY_ADD_MS)).toBe(false);
		}
		expect(store.hasRecoveryWindow('r', RECOVERY_ADD_MS - 1)).toBe(true);
		expect(store.hasRecoveryWindow('r', RECOVERY_ADD_MS)).toBe(false);
		expect(store.hasRecoveryWindow('other', 1)).toBe(false);
	});

	it('lets a recovery session do everything once it proves a passkey', () => {
		const store = createStepUpStore();
		store.markRecoverySignIn('r', 0);
		store.markAssertion('r', 400_000);
		for (const action of ACTIONS) expect(store.allows('r', action, 400_001)).toBe(true);
		// Past the recovery window, the assertion alone still carries it for its own 5 minutes.
		expect(store.allows('r', 'add-passkey', RECOVERY_ADD_MS + 50_000)).toBe(true);
	});

	it('forgets a session on request and stays bounded', () => {
		const store = createStepUpStore(3);
		for (let i = 0; i < 10; i++) store.markAssertion(`s${i}`, i);
		expect(store.size()).toBe(3);
		store.forget('s9');
		expect(store.allows('s9', 'add-passkey', 10)).toBe(false);
	});
});

describe('TSK-2F1582 the recovery window closes once the password is set', () => {
	it('clears only the recovery window, keeping a fresh proof', () => {
		const store = createStepUpStore();
		store.markRecoverySignIn('r', 0);
		expect(store.allows('r', 'change-password', 1)).toBe(true);
		store.clearRecoveryWindow('r');
		expect(store.hasRecoveryWindow('r', 1)).toBe(false);
		expect(store.allows('r', 'change-password', 1)).toBe(false);
		expect(store.allows('r', 'add-passkey', 1)).toBe(false);

		store.markRecoverySignIn('both', 0);
		store.markAssertion('both', 0);
		store.clearRecoveryWindow('both');
		expect(store.hasRecoveryWindow('both', 1)).toBe(false);
		expect(store.hasAssertion('both', 1)).toBe(true);
		store.clearRecoveryWindow('unknown');
	});
});
