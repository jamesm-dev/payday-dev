/*
 * A small iCalendar reader for the tests: enough to prove a file is well formed and to read its
 * events. No imports from the app, so Playwright can load it on its own.
 */

export type ParsedCalendar = {
	/** The properties of each VEVENT, by name. */
	events: Record<string, string>[];
	alarms: number;
	text: string;
};

export function parseCalendar(text: string): ParsedCalendar {
	// CRLF throughout, and nothing but CRLF.
	if (/(?<!\r)\n|\r(?!\n)/.test(text)) throw new Error('A line ending is not CRLF');
	if (!text.endsWith('\r\n')) throw new Error('The file does not end with CRLF');

	const physical = text.slice(0, -2).split('\r\n');
	for (const line of physical) {
		if (new TextEncoder().encode(line).length > 75)
			throw new Error(`A line is over 75 octets: ${line}`);
	}
	const lines = text
		.replace(/\r\n[ \t]/g, '')
		.slice(0, -2)
		.split('\r\n');
	if (lines[0] !== 'BEGIN:VCALENDAR' || lines.at(-1) !== 'END:VCALENDAR') {
		throw new Error('Not wrapped in VCALENDAR');
	}
	if (!lines.includes('VERSION:2.0')) throw new Error('No VERSION:2.0');

	const events: Record<string, string>[] = [];
	const stack: string[] = [];
	let current: Record<string, string> | null = null;
	let alarms = 0;
	for (const line of lines) {
		if (line.startsWith('BEGIN:')) {
			stack.push(line.slice(6));
			if (line === 'BEGIN:VEVENT') current = {};
			if (line === 'BEGIN:VALARM') alarms += 1;
		} else if (line.startsWith('END:')) {
			if (stack.pop() !== line.slice(4)) throw new Error(`Unbalanced ${line}`);
			if (line === 'END:VEVENT' && current) {
				events.push(current);
				current = null;
			}
		} else if (current && stack.at(-1) === 'VEVENT') {
			const colon = line.indexOf(':');
			current[line.slice(0, colon)] = line.slice(colon + 1);
		}
	}
	if (stack.length > 0) throw new Error('Unbalanced BEGIN and END');
	for (const e of events) {
		if (!e.UID) throw new Error('An event has no UID');
		if (!/^\d{8}T\d{6}Z$/.test(e.DTSTAMP ?? '')) throw new Error('An event has no UTC DTSTAMP');
		if (!/^\d{8}T\d{6}$/.test(e.DTSTART ?? '')) throw new Error('An event has no DTSTART');
	}
	return { events, alarms, text };
}
