import list from './common-passwords.txt?raw';

/*
 * Common passwords (NIST 800-63B: check a new password against a list of common and breached ones).
 *
 * The list is SecLists' Pwdb_top-1000000 (MIT), filtered to the entries that would pass the length
 * rule; the header of common-passwords.txt names the source. It is imported with `?raw`, so it is
 * part of the SERVER bundle only: this file is never imported by client code. The Set is built once,
 * on first use.
 */
let words: Set<string> | null = null;

const load = (): Set<string> => {
	if (words) return words;
	const set = new Set<string>();
	for (const line of list.split(/\r?\n/)) {
		if (line && !line.startsWith('#')) set.add(line);
	}
	return (words = set);
};

/** `text` must already be NFKC-normalised. Matches case-insensitively. */
export const isCommonPassword = (text: string): boolean => load().has(text.toLowerCase());

export const commonPasswordCount = (): number => load().size;
