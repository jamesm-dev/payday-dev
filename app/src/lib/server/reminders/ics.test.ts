import { describe, expect, it } from 'vitest';
import { addDays, parseCalDate as d } from '#lib/domain/dates.ts';
import { fixtureItems, fixtureOverrides } from '#lib/domain/fixture.ts';
import { paydays } from '#lib/domain/periods.ts';
import { buildCalendar, escapeText, foldLine, utcStamp } from './ics.ts';

const NOW = new Date('2026-10-31T12:34:56.789Z');

/** Undoes line folding: a CRLF followed by one space joins the next line to this one. */
export const unfold = (text: string) => text.replace(/\r\n[ \t]/g, '');

export function parseEvents(text: string) {
	const lines = unfold(text).split('\r\n');
	expect(lines.at(-1)).toBe('');
	const events: Record<string, string>[] = [];
	let current: Record<string, string> | null = null;
	for (const line of lines.slice(0, -1)) {
		if (line === 'BEGIN:VEVENT') current = {};
		else if (line === 'END:VEVENT') {
			events.push(current!);
			current = null;
		} else if (current && !line.startsWith('BEGIN:') && !line.startsWith('END:')) {
			const colon = line.indexOf(':');
			current[line.slice(0, colon)] = line.slice(colon + 1);
		}
	}
	return events;
}

const next12Months = () =>
	paydays(fixtureItems, fixtureOverrides, d('2026-10-31'), addDays(d('2026-10-31'), 365));

describe('TSK-E03C29 the calendar file is valid iCalendar with every payday for a year', () => {
	const days = next12Months();
	const text = buildCalendar({ paydays: days, time: '09:00', now: NOW });

	it('has a calendar wrapper, a version and a product id', () => {
		expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:')).toBe(true);
		expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
	});

	it('uses CRLF everywhere: there is no bare LF', () => {
		expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
	});

	it('folds no line past 75 octets', () => {
		for (const line of text.split('\r\n')) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
	});

	it('has one event per payday for the next 12 months: 26 or 27 of them, every 14 days', () => {
		const events = parseEvents(text);
		expect(events).toHaveLength(days.length);
		expect([26, 27]).toContain(days.length);
		expect(events[0].DTSTART).toBe('20261113T090000');
		expect(events.map((e) => e.DTSTART.slice(0, 8))).toEqual(
			days.map((x) => x.replaceAll('-', ''))
		);
	});

	it('gives every event a unique UID and a UTC DTSTAMP', () => {
		const events = parseEvents(text);
		expect(new Set(events.map((e) => e.UID)).size).toBe(events.length);
		expect(events[0].UID).toBe('payday-20261113@payday');
		for (const e of events) expect(e.DTSTAMP).toBe('20261031T123456Z');
	});

	it('gives every event an alarm that goes off at the start', () => {
		expect(text.match(/BEGIN:VALARM/g)).toHaveLength(days.length);
		expect(text.match(/TRIGGER:PT0S/g)).toHaveLength(days.length);
		expect(text.match(/ACTION:DISPLAY/g)).toHaveLength(days.length);
	});

	it('balances every BEGIN with an END', () => {
		for (const part of ['VCALENDAR', 'VEVENT', 'VALARM']) {
			const begins = text.match(new RegExp(`^BEGIN:${part}$`, 'gm'))?.length ?? 0;
			const ends = text.match(new RegExp(`^END:${part}$`, 'gm'))?.length ?? 0;
			expect(begins, part).toBe(ends);
			expect(begins, part).toBeGreaterThan(0);
		}
	});

	it('uses the reminder time the owner chose', () => {
		const evening = buildCalendar({ paydays: [d('2026-11-13')], time: '17:45', now: NOW });
		expect(parseEvents(evening)[0].DTSTART).toBe('20261113T174500');
	});

	it('links to the check-in when it is given a place to link to', () => {
		const linked = buildCalendar({
			paydays: [d('2026-11-13')],
			time: '09:00',
			now: NOW,
			checkInUrl: 'https://payday.example/checkin'
		});
		expect(parseEvents(linked)[0].URL).toBe('https://payday.example/checkin');
	});

	it('is a valid empty calendar when no pay is scheduled', () => {
		const empty = buildCalendar({ paydays: [], time: '09:00', now: NOW });
		expect(empty).toBe(
			'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Payday//Payday reminders//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Payday\r\nEND:VCALENDAR\r\n'
		);
	});
});

describe('TSK-E03C29 text is escaped and long lines are folded without breaking a character', () => {
	it('escapes backslash, semicolon, comma and newlines', () => {
		expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
	});

	it('leaves a short line alone and folds a long one at 75 octets with a leading space', () => {
		expect(foldLine('SHORT:line')).toBe('SHORT:line');
		const long = `DESCRIPTION:${'x'.repeat(200)}`;
		const folded = foldLine(long);
		const parts = folded.split('\r\n');
		expect(parts[0]).toHaveLength(75);
		for (const part of parts.slice(1)) {
			expect(part.startsWith(' ')).toBe(true);
			expect(part.length).toBeLessThanOrEqual(75);
		}
		expect(unfold(folded)).toBe(long);
	});

	it('never splits a multi-byte character across two lines', () => {
		const long = `SUMMARY:${'é'.repeat(100)}${'—'.repeat(50)}`;
		const folded = foldLine(long);
		for (const part of folded.split('\r\n')) {
			expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
			expect(part).not.toContain('�');
		}
		expect(unfold(folded)).toBe(long);
	});

	it('formats a UTC timestamp as basic ISO 8601 with a Z', () => {
		expect(utcStamp(NOW)).toBe('20261031T123456Z');
	});
});
