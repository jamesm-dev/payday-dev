/**
 * The calendar fallback for reminders: an iCalendar file with one event per payday, each with an
 * alarm at the reminder time. RFC 5545: CRLF line endings, lines folded at 75 octets, text escaped,
 * every event with a UID and a DTSTAMP. Times are "floating" (no zone), so the alarm goes off at
 * the same wall-clock time wherever the phone is. Pure.
 */
import type { CalDate } from '#lib/domain/dates.ts';

const CRLF = '\r\n';
const MAX_OCTETS = 75;
const encoder = new TextEncoder();

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(text: string): string {
	return text
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds one content line: each physical line is at most 75 octets, continuations start with a space. */
export function foldLine(line: string): string {
	if (encoder.encode(line).length <= MAX_OCTETS) return line;
	const out: string[] = [];
	let current = '';
	let size = 0;
	// The first line holds 75 octets; each continuation starts with a space, so holds 74 more.
	let limit = MAX_OCTETS;
	for (const char of line) {
		const bytes = encoder.encode(char).length;
		if (size + bytes > limit) {
			out.push(current);
			current = ' ';
			size = 1;
			limit = MAX_OCTETS;
		}
		current += char;
		size += bytes;
	}
	out.push(current);
	return out.join(CRLF);
}

const compactDate = (date: CalDate) => date.replaceAll('-', '');

/** `20261031T120000Z` */
export function utcStamp(now: Date): string {
	return now
		.toISOString()
		.replace(/\.\d{3}Z$/, 'Z')
		.replace(/[-:]/g, '');
}

export type CalendarInput = {
	paydays: readonly CalDate[];
	/** `HH:MM`, the owner's reminder time. */
	time: string;
	now: Date;
	/** Where the check-in lives, such as `https://payday.example/checkin`. Optional. */
	checkInUrl?: string;
};

const TITLE = "It's payday: check in";
const NOTE = 'Open Payday and do your check-in. It takes about five minutes.';

export function buildCalendar(input: CalendarInput): string {
	const stamp = utcStamp(input.now);
	const time = input.time.replace(':', '') + '00';
	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Payday//Payday reminders//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'X-WR-CALNAME:Payday'
	];
	for (const payday of input.paydays) {
		lines.push(
			'BEGIN:VEVENT',
			`UID:payday-${compactDate(payday)}@payday`,
			`DTSTAMP:${stamp}`,
			`DTSTART:${compactDate(payday)}T${time}`,
			'DURATION:PT15M',
			`SUMMARY:${escapeText(TITLE)}`,
			`DESCRIPTION:${escapeText(NOTE)}`
		);
		if (input.checkInUrl) lines.push(`URL:${input.checkInUrl}`);
		lines.push(
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			`DESCRIPTION:${escapeText(TITLE)}`,
			'TRIGGER:PT0S',
			'END:VALARM',
			'END:VEVENT'
		);
	}
	lines.push('END:VCALENDAR');
	return lines.map(foldLine).join(CRLF) + CRLF;
}
