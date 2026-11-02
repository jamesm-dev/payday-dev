import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { open } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import {
	checkOwnerPassword,
	createDummyHash,
	createGate,
	hashPassword,
	MAX_PASSWORD_LENGTH,
	MAX_RAW_INPUT,
	needsRehash,
	parseHash,
	PasswordBusyError,
	passwordProblem,
	SCRYPT_PARAMS,
	setPasswordHash,
	verifyOwnerPassword,
	verifyPassword
} from './password.ts';
import { commonPasswordCount } from './commonPasswords.ts';

/** Cheap parameters, so the tests that do not test the cost do not pay it. */
const FAST = { N: 2 ** 10, r: 8, p: 1 };
const GOOD = 'correct horse battery staple';

describe('TSK-46617D the stored password hash describes itself', () => {
	let stored: string;
	beforeAll(async () => {
		stored = await hashPassword(GOOD, FAST);
	});

	it('is scrypt, its parameters, a salt and a key, in that order', () => {
		const parts = stored.split('$');
		expect(parts).toHaveLength(4);
		expect(parts[0]).toBe('scrypt');
		expect(parts[1]).toBe('N=1024,r=8,p=1');
		expect(Buffer.from(parts[2], 'base64url')).toHaveLength(16);
		expect(Buffer.from(parts[3], 'base64url')).toHaveLength(64);
		expect(stored).not.toContain(GOOD);
	});

	it('uses the OWASP memory-light setting by default: N=2^15, r=8, p=3', async () => {
		expect(SCRYPT_PARAMS).toEqual({ N: 32768, r: 8, p: 3 });
		const real = await hashPassword(GOOD);
		expect(real.startsWith('scrypt$N=32768,r=8,p=3$')).toBe(true);
		expect(needsRehash(real)).toBe(false);
		expect(needsRehash(stored)).toBe(true);
		expect(await verifyPassword(GOOD, real)).toBe(true);
	});

	it('gives the same password a different salt and hash each time', async () => {
		const other = await hashPassword(GOOD, FAST);
		expect(other).not.toBe(stored);
		expect(await verifyPassword(GOOD, other)).toBe(true);
	});

	it('verifies the right password and refuses a wrong one', async () => {
		expect(await verifyPassword(GOOD, stored)).toBe(true);
		expect(await verifyPassword(GOOD + ' ', stored)).toBe(false);
		expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false);
		expect(await verifyPassword('', stored)).toBe(false);
	});

	it('treats a password typed in another Unicode form as the same one', async () => {
		const composed = await hashPassword('café au lait 1234', FAST);
		expect(await verifyPassword('café au lait 1234', composed)).toBe(true);
	});

	it('compares the keys with timingSafeEqual, not ===', () => {
		const source = readFileSync(new URL('./password.ts', import.meta.url), 'utf8');
		expect(source).toContain('timingSafeEqual(key, parsed.key)');
		expect(source).not.toMatch(/key\.toString\(\)\s*===|\bkey === parsed\.key/);
	});

	it('still verifies a hash made with other parameters, because it reads them from the string', async () => {
		const cheaper = await hashPassword(GOOD, { N: 2 ** 12, r: 8, p: 2 });
		expect(parseHash(cheaper)?.params).toEqual({ N: 4096, r: 8, p: 2 });
		expect(await verifyPassword(GOOD, cheaper)).toBe(true);
	});

	it('refuses a damaged or foreign string rather than throwing', async () => {
		const [a, , c, d] = stored.split('$');
		const bad = [
			'',
			'plain',
			`bcrypt$N=1024,r=8,p=1$${c}$${d}`,
			`${a}$N=1000,r=8,p=1$${c}$${d}`, // not a power of two
			`${a}$N=1024,r=8$${c}$${d}`,
			`${a}$N=4194304,r=8,p=1$${c}$${d}`, // asks for too much memory
			`${a}$N=1024,r=999,p=1$${c}$${d}`,
			`${a}$N=1024,r=8,p=1$!!$${d}`,
			`${a}$N=1024,r=8,p=1$${c}`,
			`${stored}$extra`
		];
		for (const value of bad) {
			expect(parseHash(value), value).toBeNull();
			expect(await verifyPassword(GOOD, value), value).toBe(false);
		}
		expect(needsRehash('plain')).toBe(true);
	});

	it('parses its own output back into the exact salt and key', () => {
		const parsed = parseHash(stored)!;
		expect(parsed.params).toEqual(FAST);
		expect(parsed.salt.toString('base64url')).toBe(stored.split('$')[2]);
		expect(parsed.key.toString('base64url')).toBe(stored.split('$')[3]);
	});
});

describe('TSK-46617D the password policy', () => {
	const table: Array<[string, string, string | null]> = [
		['a plain passphrase', 'correct horse battery', null],
		['exactly 12 characters', 'zebra-cloud9', null],
		['spaces and no symbols', 'the quick brown fox', null],
		['no composition rules: lower case only is fine', 'purpletractorsdance', null],
		['a keyboard walk is refused', 'qwertyuiopasdfgh', 'keys in a row'],
		['emoji count as characters', '🔑🔒🏠🌳🚲📚🍎🎸🧭🪴🛶🧩', null],
		['11 characters', 'abcdefghijk', 'Use at least 12 characters'],
		['empty', '', 'Enter a password'],
		['one character repeated', 'aaaaaaaaaaaaaaaa', 'one character repeated'],
		['one repeated space', ' '.repeat(20), 'one character repeated'],
		['two characters repeated', 'abababababab', 'short pattern repeated'],
		['three characters repeated', '123123123123123', 'short pattern repeated'],
		['four characters repeated, cut short', 'wxyzwxyzwxyzwx', 'short pattern repeated'],
		['too long', 'x1'.repeat(MAX_PASSWORD_LENGTH), 'at most 256'],
		['257 characters', 'abcdefgh'.repeat(33), 'at most 256']
	];
	for (const [name, password, message] of table) {
		it(name, () => {
			const problem = passwordProblem(password);
			if (message === null) expect(problem).toBeNull();
			else expect(problem).toContain(message);
		});
	}

	// TSK-2F1582 (security review, finding 3): the policy refuses the obviously weak.
	const weak: Array<[string, string, string]> = [
		['a common word and digits', 'password1234', 'too common'],
		['digits in a row (it is also on the list)', '123456789012', 'too common'],
		['letters counting down', 'zyxwvutsrqpo', 'in a row'],
		['letters in a row', 'abcdefghijkl', 'in a row'],
		['one word twice', 'passwordpassword', 'same words repeated'],
		['a block of three repeated', 'abcabcabcabc', 'short pattern repeated'],
		['a keyboard row walk', 'qwertyuiopasdfgh', 'keys in a row'],
		['a keyboard walk with punctuation', "asdfghjkl;'zxcv", 'keys in a row'],
		['a keyboard walk backwards', 'mnbvcxzlkjhgfdsa', 'keys in a row'],
		['a common word and a year', 'welcome202612', 'too common']
	];
	for (const [name, password, message] of weak) {
		it(`refuses ${name}`, () => expect(passwordProblem(password), password).toContain(message));
	}

	it('gives plain words, not codes', () => {
		expect(passwordProblem('password1234')).toBe(
			'This one is too common — try a phrase only you would think of.'
		);
	});

	const good = [
		'correct horse battery staple',
		'my-cat-likes-mangoes-2026',
		'the quick brown fox',
		'a different long passphrase 77',
		'Tuesday-lanterns-over-the-bridge',
		'zebra-cloud9'
	];
	for (const password of good) {
		it(`still accepts ${password}`, () => expect(passwordProblem(password)).toBeNull());
	}

	it('checks a real list of common passwords, filtered to the length rule', () => {
		// Filtered from SecLists Pwdb_top-1000000: long enough to pass the length rule, so thousands.
		expect(commonPasswordCount()).toBeGreaterThan(20_000);
		expect(passwordProblem('1q2w3e4r5t6y')).toContain('too common');
		expect(passwordProblem('1Q2W3E4R5T6Y')).toContain('too common');
	});

	it('allows exactly 256 characters', () => {
		const long = Array.from({ length: 256 }, (_, i) => String.fromCodePoint(0x4e00 + i * 3)).join(
			''
		);
		expect(passwordProblem(long)).toBeNull();
		expect(passwordProblem(long + 'x')).toContain('at most 256');
	});

	it('refuses a password containing the setup code, in any case', () => {
		expect(passwordProblem('my e2e-setup-code is long', 'e2e-setup-code')).toContain('setup code');
		expect(passwordProblem('MY E2E-SETUP-CODE IS LONG', 'e2e-setup-code')).toContain('setup code');
		expect(passwordProblem('a quite different phrase', 'e2e-setup-code')).toBeNull();
		// No code configured (development): nothing to compare with.
		expect(passwordProblem('my e2e-setup-code is long', undefined)).toBeNull();
		expect(passwordProblem('some long phrase here', '')).toBeNull();
	});

	it('is not a string: refused with a sentence, not a crash', () => {
		expect(passwordProblem(undefined)).toContain('Enter a password');
		expect(passwordProblem(42)).toContain('Enter a password');
		expect(passwordProblem(null)).toContain('Enter a password');
	});
});

describe('TSK-D7D015 the owner password check', () => {
	it('matches the right password only, and never for an owner with no password', async () => {
		const db = open(':memory:');
		db.insert(owner).values({ id: 1 }).run();
		expect(await checkOwnerPassword(db, 1, GOOD)).toBe(false);

		setPasswordHash(db, 1, await hashPassword(GOOD, FAST));
		expect(await checkOwnerPassword(db, 1, GOOD)).toBe(true);
		expect(await checkOwnerPassword(db, 1, 'wrong wrong wrong')).toBe(false);
		expect(await checkOwnerPassword(db, 1, '')).toBe(false);
		expect(await checkOwnerPassword(db, 1, undefined)).toBe(false);
		expect(await checkOwnerPassword(db, 1, ['array'])).toBe(false);
	});

	it('does not hash a huge input at all', async () => {
		const db = open(':memory:');
		db.insert(owner).values({ id: 1 }).run();
		setPasswordHash(db, 1, await hashPassword(GOOD, FAST));
		expect(await checkOwnerPassword(db, 1, randomBytes(100_000).toString('hex'))).toBe(false);
	});
});

describe('TSK-2F1582 the empty and the missing password take the same work', () => {
	it('hashes an empty or missing password against the dummy, and says no', async () => {
		const db = open(':memory:');
		db.insert(owner).values({ id: 1 }).run();
		setPasswordHash(db, 1, await hashPassword(GOOD, FAST));
		for (const typed of ['', undefined, ['array'], 'x'.repeat(MAX_RAW_INPUT + 1)]) {
			expect(await verifyOwnerPassword(db, 1, typed)).toEqual({
				ok: false,
				hash: null,
				dummy: true
			});
		}
		// A real, wrong guess is checked against the real hash, not the dummy.
		expect(await verifyOwnerPassword(db, 1, 'wrong wrong wrong')).toMatchObject({
			ok: false,
			dummy: false
		});
		// And with no password set at all, still the dummy.
		db.update(owner).set({ passwordHash: null }).run();
		expect((await verifyOwnerPassword(db, 1, GOOD)).dummy).toBe(true);
	});

	it('returns the exact hash string it verified against', async () => {
		const db = open(':memory:');
		db.insert(owner).values({ id: 1 }).run();
		const stored = await hashPassword(GOOD, FAST);
		setPasswordHash(db, 1, stored);
		expect(await verifyOwnerPassword(db, 1, GOOD)).toEqual({
			ok: true,
			hash: stored,
			dummy: false
		});
	});
});

describe('TSK-2F1582 a failed dummy hash is not kept', () => {
	it('builds again after a rejection, instead of failing every later request at once', async () => {
		let calls = 0;
		const dummy = createDummyHash(async () => {
			calls++;
			if (calls === 1) throw new PasswordBusyError();
			return 'built';
		});
		await expect(dummy()).rejects.toBeInstanceOf(PasswordBusyError);
		await new Promise((r) => setImmediate(r));
		await expect(dummy()).resolves.toBe('built');
		await expect(dummy()).resolves.toBe('built');
		expect(calls).toBe(2);
	});
});

describe('TSK-2F1582 input and parameter limits', () => {
	it('refuses raw input over 1,024 code units before normalising, as a problem and as a miss', async () => {
		// U+FDFA normalises to 18 characters: it must be refused before that happens.
		const huge = 'ﷺ'.repeat(MAX_RAW_INPUT + 1);
		expect(passwordProblem(huge)).toContain('at most 256');
		expect(passwordProblem('a'.repeat(MAX_RAW_INPUT + 1))).toContain('at most 256');
		const stored = await hashPassword(GOOD, FAST);
		// Refused before any copy is made: nothing is normalised and nothing is queued.
		const normalise = vi.spyOn(String.prototype, 'normalize');
		try {
			expect(await verifyPassword(huge, stored)).toBe(false);
			expect(passwordProblem(huge)).toContain('at most 256');
			expect(normalise).not.toHaveBeenCalled();
		} finally {
			normalise.mockRestore();
		}
	});

	it('refuses stored parameters that ask for more than 64 MiB (128*N*r)', async () => {
		const [a, , c, d] = (await hashPassword(GOOD, FAST)).split('$');
		const make = (N: number, r: number, p = 1) => `${a}$N=${N},r=${r},p=${p}$${c}$${d}`;
		expect(parseHash(make(2 ** 16, 8))).not.toBeNull(); // exactly 64 MiB
		expect(parseHash(make(2 ** 17, 8))).toBeNull(); // 128 MiB
		expect(parseHash(make(2 ** 16, 16))).toBeNull();
		expect(parseHash(make(2 ** 15, 8, 3))).not.toBeNull(); // today's setting
		expect(await verifyPassword(GOOD, make(2 ** 17, 16))).toBe(false);
	});
});

describe('TSK-D7D015 only a few passwords are hashed at once', () => {
	it('runs at most N at a time, queues the rest, and turns away a flood', async () => {
		const gate = createGate(2, 3);
		let running = 0;
		let peak = 0;
		const release: Array<() => void> = [];
		const job = () =>
			gate(async () => {
				running++;
				peak = Math.max(peak, running);
				await new Promise<void>((resolve) => release.push(resolve));
				running--;
			});

		const jobs = Array.from({ length: 5 }, job);
		await new Promise((r) => setImmediate(r));
		expect(running).toBe(2);
		await expect(job()).rejects.toBeInstanceOf(PasswordBusyError);

		while (jobs.length && release.length) {
			release.shift()!();
			await new Promise((r) => setImmediate(r));
		}
		while (release.length) release.shift()!();
		await Promise.all(jobs);
		expect(peak).toBe(2);
		expect(running).toBe(0);
	});
});
