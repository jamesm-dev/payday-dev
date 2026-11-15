import { describe, expect, it } from 'vitest';
import { MAX_EMAIL_LENGTH, normaliseEmail } from './email.ts';

describe('TSK-ea2432 normaliseEmail', () => {
	it('trims and lower-cases', () => {
		expect(normaliseEmail('  Ana.Cruz@Example.COM ')).toEqual({
			ok: true,
			email: 'ana.cruz@example.com'
		});
	});

	it('refuses an empty value, whitespace and anything that is not text', () => {
		for (const raw of ['', '   ', undefined, null, 42]) {
			expect(normaliseEmail(raw)).toEqual({ ok: false, message: 'Enter your email address.' });
		}
	});

	it('refuses a value with no @, or with nothing on one side of it', () => {
		for (const raw of [
			'ana',
			'ana.example.com',
			'@example.com',
			'ana@',
			'a@b@c.com',
			'a b@c.com'
		]) {
			const result = normaliseEmail(raw);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.message).toContain('@');
		}
	});

	it('refuses an address longer than 254 characters, and takes one of exactly 254', () => {
		const at254 = `${'a'.repeat(MAX_EMAIL_LENGTH - '@x.co'.length)}@x.co`;
		expect(at254).toHaveLength(254);
		expect(normaliseEmail(at254).ok).toBe(true);
		expect(normaliseEmail(`a${at254}`)).toEqual({
			ok: false,
			message: 'That email address is too long.'
		});
	});
});
