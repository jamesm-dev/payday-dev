/**
 * The list as a plain text file for Notepad: UTF-8, a tab between amount and name, and Windows line
 * breaks, so it opens exactly as written on any version of Notepad (ADR-0011).
 */
export function textFile(lines: readonly string[]): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(lines.map((l) => `${l}\r\n`).join(''));
}

/** Tabs replaced by spaces up to the next stop, as Notepad shows them; for fixed-width layouts. */
export function expandTabs(line: string, stop = 8): string {
	let out = '';
	for (const ch of line) {
		if (ch === '\t') out += ' '.repeat(stop - (out.length % stop));
		else out += ch;
	}
	return out;
}
