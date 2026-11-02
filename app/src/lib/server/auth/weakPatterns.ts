/*
 * Patterns that are weak however long they are: a block repeated, a run of neighbouring characters,
 * a walk along the keyboard, or a common word with only digits after it. They look at the WHOLE
 * password, so a long phrase that merely contains one is fine. `text` is NFKC-normalised.
 */

/** The whole password is one block repeated: "abcabcabcabc", "passwordpassword". Returns the block size. */
export function repeatedBlockSize(chars: string[]): number | null {
	const whole = chars.join('');
	// Short blocks may be cut off mid-way ("wxyzwxyzwxyzwx"); longer ones must repeat exactly.
	for (let size = 1; size <= Math.floor(chars.length / 2); size++) {
		const block = chars.slice(0, size).join('');
		if (
			size <= 4 &&
			block.repeat(Math.ceil(chars.length / size)).slice(0, whole.length) === whole
		) {
			return size;
		}
		if (chars.length % size === 0 && block.repeat(chars.length / size) === whole) return size;
	}
	return null;
}

export const MIN_RUN = 12;

/** Every character is one code point above (or below) the one before: "123456789012", "abcdefghijkl". */
export function isCharacterRun(chars: string[]): boolean {
	if (chars.length < MIN_RUN) return false;
	const points = chars.map((c) => c.codePointAt(0) as number);
	for (const step of [1, -1]) {
		if (points.every((p, i) => i === 0 || p - points[i - 1] === step)) return true;
	}
	return false;
}

/** QWERTY, read row by row, with and without the punctuation keys. */
const KEYBOARD = [
	"1234567890-=qwertyuiop[]asdfghjkl;'zxcvbnm,./",
	'1234567890qwertyuiopasdfghjklzxcvbnm',
	"qwertyuiop[]asdfghjkl;'zxcvbnm,./",
	'qwertyuiopasdfghjklzxcvbnm'
];
const reversed = (s: string) => [...s].reverse().join('');
const WALKS = KEYBOARD.flatMap((row) => [row, reversed(row)]);

/** The whole password is a stretch of keys in a row, going either way: "qwertyuiopasdfgh". */
export const isKeyboardWalk = (text: string): boolean => {
	const lower = text.toLowerCase();
	return lower.length >= MIN_RUN && WALKS.some((walk) => walk.includes(lower));
};

const COMMON_WORDS = new Set([
	'password',
	'passw0rd',
	'p4ssword',
	'letmein',
	'welcome',
	'admin',
	'administrator',
	'qwerty',
	'iloveyou',
	'monkey',
	'dragon',
	'football',
	'baseball',
	'master',
	'sunshine',
	'princess',
	'login',
	'hello',
	'shadow',
	'superman',
	'batman',
	'trustno',
	'changeme',
	'secret',
	'summer',
	'winter',
	'freedom',
	'whatever',
	'starwars',
	'computer',
	'internet',
	'michael',
	'jennifer',
	'charlie',
	'mustang',
	'access',
	'flower',
	'passphrase',
	'qwertyuiop',
	'asdfghjkl',
	'abc',
	'abcdef'
]);

/** A common word, then only digits: "password1234", "welcome2026". */
export function isWordThenDigits(text: string, isCommon: (stem: string) => boolean): boolean {
	const match = /^(\D+?)(\d+)$/u.exec(text.toLowerCase());
	if (!match) return false;
	return COMMON_WORDS.has(match[1]) || isCommon(match[1]);
}
