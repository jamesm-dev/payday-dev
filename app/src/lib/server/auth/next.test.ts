import { describe, expect, it } from 'vitest';
import { safeNext } from './next.ts';
import { HOSTILE_NEXT } from '../../../../tests/support/hostile.ts';

describe('TSK-EF5663 the sign-in redirect target cannot leave the site', () => {
	it('keeps a same-origin path with its query', () => {
		expect(safeNext('/settings/security')).toBe('/settings/security');
		expect(safeNext('/a/b?c=1&d=2')).toBe('/a/b?c=1&d=2');
	});

	it.each([
		null,
		undefined,
		'',
		'https://evil.example/',
		'http://evil.example',
		'//evil.example',
		'///evil.example',
		'/\\evil.example',
		'\\\\evil.example',
		'javascript:alert(1)',
		'evil.example',
		'/\t/evil.example',
		'/\n/evil.example'
	])('falls back to / for %j', (raw) => {
		expect(safeNext(raw)).toBe('/');
	});

	it.each(HOSTILE_NEXT)('falls back to / for the hostile target %j', (raw) => {
		expect(safeNext(raw)).toBe('/');
	});

	it('resolves dot-segments to the path a browser would load', () => {
		expect(safeNext('/a/../b')).toBe('/b');
		expect(safeNext('/./x?y=1')).toBe('/x?y=1');
	});

	it('never sends the owner back to the sign-in page', () => {
		expect(safeNext('/signin')).toBe('/');
		expect(safeNext('/signin?next=/x')).toBe('/');
	});
});
