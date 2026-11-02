import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	add,
	formatMinor,
	minor,
	neg,
	parseMinor,
	splitEvenly,
	sub,
	sum,
	type Minor
} from './money';

describe('TSK-213DCD formatMinor shows a minor-unit amount without float maths', () => {
	it.each([
		[41250, '412.50'],
		[5, '0.05'],
		[0, '0.00'],
		[123456789, '1,234,567.89'],
		[-123456, '-1,234.56']
	])('%i minor units reads %s', (minorUnits, expected) => {
		expect(formatMinor(minorUnits)).toBe(expected);
	});

	it('refuses an amount that is not a whole number of minor units', () => {
		expect(() => formatMinor(412.5)).toThrow(RangeError);
	});
});

describe('TSK-F859EA Minor is a branded integer', () => {
	it('accepts safe integers, including zero and negatives', () => {
		expect(minor(0)).toBe(0);
		expect(minor(-250)).toBe(-250);
		expect(minor(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
	});

	it.each([1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 0.1 + 0.2])('rejects %s', (n) => {
		expect(() => minor(n)).toThrow(RangeError);
	});

	it('never produces a negative zero', () => {
		expect(Object.is(minor(-0), 0)).toBe(true);
		expect(Object.is(neg(minor(0)), 0)).toBe(true);
	});

	it('does not let a plain number stand in for Minor', () => {
		// @ts-expect-error a plain number is not a Minor
		const bad: Minor = 5;
		expect(bad).toBe(5);
	});

	it('adds, subtracts, negates and sums whole units', () => {
		expect(add(minor(10), minor(5))).toBe(15);
		expect(sub(minor(10), minor(25))).toBe(-15);
		expect(neg(minor(7))).toBe(-7);
		expect(sum([minor(1), minor(2), minor(3)])).toBe(6);
		expect(sum([])).toBe(0);
	});

	it('refuses an overflow rather than losing precision', () => {
		expect(() => add(minor(Number.MAX_SAFE_INTEGER), minor(1))).toThrow(RangeError);
	});
});

describe('TSK-F859EA splitEvenly sums exactly to the total', () => {
	it('gives the remainder one unit each to the earliest parts', () => {
		expect(splitEvenly(minor(100), 3)).toEqual([34, 33, 33]);
		expect(splitEvenly(minor(12000), 7)).toEqual([1715, 1715, 1714, 1714, 1714, 1714, 1714]);
		expect(splitEvenly(minor(54000), 19).slice(0, 3)).toEqual([2843, 2843, 2842]);
	});

	it('splits evenly when there is no remainder', () => {
		expect(splitEvenly(minor(12000), 6)).toEqual([2000, 2000, 2000, 2000, 2000, 2000]);
	});

	it('handles one part, a zero total and a total smaller than the parts', () => {
		expect(splitEvenly(minor(99), 1)).toEqual([99]);
		expect(splitEvenly(minor(0), 3)).toEqual([0, 0, 0]);
		expect(splitEvenly(minor(2), 5)).toEqual([1, 1, 0, 0, 0]);
	});

	it('splits a negative total symmetrically', () => {
		expect(splitEvenly(minor(-100), 3)).toEqual([-34, -33, -33]);
	});

	it.each([
		[1, 1],
		[7, 3],
		[99999, 26],
		[Number.MAX_SAFE_INTEGER, 7],
		[Number.MAX_SAFE_INTEGER, 13],
		[-4321, 12]
	])('total %i over %i parts sums exactly and differs by at most one unit', (total, parts) => {
		const shares = splitEvenly(minor(total), parts);
		expect(shares).toHaveLength(parts);
		expect(sum(shares)).toBe(total);
		const magnitudes = shares.map((s) => Math.abs(s));
		expect(Math.max(...magnitudes) - Math.min(...magnitudes)).toBeLessThanOrEqual(1);
	});

	it.each([0, -1, 1.5, NaN])('refuses %s parts', (parts) => {
		expect(() => splitEvenly(minor(100), parts)).toThrow(RangeError);
	});
});

describe('TSK-F859EA parseMinor reads the string, not a float', () => {
	it.each([
		['1,234.56', 123456],
		['12', 1200],
		['12.5', 1250],
		['12.50', 1250],
		['-3.07', -307],
		['0.05', 5],
		['.5', 50],
		['0', 0],
		['-0', 0],
		['1,000', 100000],
		['1234567.89', 123456789],
		['  42.10  ', 4210],
		['19.99', 1999],
		['0.29', 29],
		['1.15', 115]
	])('accepts %j as %i', (text, expected) => {
		expect(Object.is(parseMinor(text), expected)).toBe(true);
	});

	it.each([
		'',
		'   ',
		'abc',
		'-',
		'.',
		'12.',
		'1.234',
		'12.345.6',
		'1,23',
		'1,2345',
		'1234,567',
		'--3',
		'+5',
		'1e3',
		'$5',
		'5 USD',
		'NaN',
		'Infinity',
		'1 000'
	])('rejects %j', (text) => {
		expect(() => parseMinor(text)).toThrow(SyntaxError);
	});

	it('rejects an amount too large to hold exactly', () => {
		expect(() => parseMinor('99999999999999999')).toThrow(RangeError);
	});

	it('round-trips with formatMinor', () => {
		for (const n of [0, 5, 99, 100, 123456, -307, 123456789]) {
			expect(parseMinor(formatMinor(n))).toBe(n);
		}
	});
});

describe('TSK-F859EA no floats anywhere in the domain', () => {
	it('uses neither parseFloat nor toFixed in any source file', () => {
		const dir = import.meta.dirname;
		const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
		expect(sources).toContain('money.ts');
		const offenders = sources.filter((f) =>
			/parseFloat|toFixed/.test(readFileSync(join(dir, f), 'utf8'))
		);
		expect(offenders).toEqual([]);
	});
});
