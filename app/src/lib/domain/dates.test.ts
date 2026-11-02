import { describe, expect, it } from 'vitest';
import {
	addDays,
	calDate,
	compareDates,
	daysBetween,
	lastDayOfMonth,
	parseCalDate as d,
	todayIn,
	weekday
} from './dates';

describe('TSK-94B259 calendar dates', () => {
	it('builds and parses ISO dates', () => {
		expect(calDate(2026, 1, 9)).toBe('2026-01-09');
		expect(d('2026-12-31')).toBe('2026-12-31');
	});

	it.each([
		'2026-02-29',
		'2026-13-01',
		'2026-00-10',
		'2026-04-31',
		'2026-1-9',
		'26-01-09',
		'x',
		''
	])('rejects %j', (text) => {
		expect(() => d(text)).toThrow();
	});

	it('knows leap years', () => {
		expect(lastDayOfMonth(2026, 2)).toBe(28);
		expect(lastDayOfMonth(2028, 2)).toBe(29);
		expect(lastDayOfMonth(2100, 2)).toBe(28);
		expect(lastDayOfMonth(2000, 2)).toBe(29);
		expect(lastDayOfMonth(2026, 4)).toBe(30);
		expect(lastDayOfMonth(2026, 12)).toBe(31);
	});

	it('adds days across month, year and leap boundaries', () => {
		expect(addDays(d('2026-01-31'), 1)).toBe('2026-02-01');
		expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
		expect(addDays(d('2028-02-28'), 1)).toBe('2028-02-29');
		expect(addDays(d('2027-02-28'), 1)).toBe('2027-03-01');
		expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28');
		expect(addDays(d('2026-01-09'), 0)).toBe('2026-01-09');
	});

	it('is not moved by daylight saving changes', () => {
		// US clocks changed on 2026-03-08 and 2026-11-01.
		expect(addDays(d('2026-03-07'), 2)).toBe('2026-03-09');
		expect(addDays(d('2026-10-31'), 2)).toBe('2026-11-02');
		expect(daysBetween(d('2026-03-01'), d('2026-04-01'))).toBe(31);
	});

	it('counts days between dates, signed', () => {
		expect(daysBetween(d('2026-01-09'), d('2026-01-23'))).toBe(14);
		expect(daysBetween(d('2026-01-23'), d('2026-01-09'))).toBe(-14);
		expect(daysBetween(d('2026-01-01'), d('2027-01-01'))).toBe(365);
		expect(daysBetween(d('2028-01-01'), d('2029-01-01'))).toBe(366);
	});

	it('compares dates', () => {
		expect(compareDates(d('2026-01-09'), d('2026-01-10'))).toBe(-1);
		expect(compareDates(d('2026-01-10'), d('2026-01-09'))).toBe(1);
		expect(compareDates(d('2026-01-09'), d('2026-01-09'))).toBe(0);
	});

	it('gives the weekday, 0 = Sunday', () => {
		expect(weekday(d('2026-01-09'))).toBe(5); // Friday
		expect(weekday(d('1970-01-01'))).toBe(4); // Thursday
		expect(weekday(d('1969-12-31'))).toBe(3); // Wednesday, before the epoch
		expect(weekday(d('2026-10-31'))).toBe(6); // Saturday
	});

	it('finds the calendar date in an IANA zone', () => {
		const now = new Date('2026-10-31T12:00:00Z');
		expect(todayIn('UTC', now)).toBe('2026-10-31');
		expect(todayIn('Pacific/Auckland', now)).toBe('2026-11-01');
		expect(todayIn('America/Los_Angeles', now)).toBe('2026-10-31');
		expect(todayIn('America/Los_Angeles', new Date('2026-11-01T03:00:00Z'))).toBe('2026-10-31');
		expect(todayIn('Asia/Tokyo', new Date('2026-12-31T15:30:00Z'))).toBe('2027-01-01');
	});
});
