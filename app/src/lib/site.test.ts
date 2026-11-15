import { describe, expect, it } from 'vitest';
import { assertContactSet } from './site.ts';

describe('TSK-99efff a deploy cannot ship the placeholder contact', () => {
	it('fails on Netlify while the contact is the placeholder', () => {
		expect(() => assertContactSet('CONTACT-PENDING', 'true')).toThrow(/no contact yet/);
	});
	it('passes locally with the placeholder, and on Netlify with a real contact', () => {
		expect(() => assertContactSet('CONTACT-PENDING', undefined)).not.toThrow();
		expect(() => assertContactSet('hello@example.org', 'true')).not.toThrow();
	});
});
