import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '#lib/server/db/open.ts';
import { owner } from '#lib/server/db/schema.ts';
import { isCommonPassword } from './commonPasswords.ts';
import {
	isCharacterRun,
	isKeyboardWalk,
	isWordThenDigits,
	repeatedBlockSize
} from './weakPatterns.ts';

/*
 * The owner's password (ADR-0010), hashed with scrypt from node:crypto: no dependency.
 *
 * The stored value describes itself, so the cost can be raised later and old hashes still verify:
 *
 *     scrypt$N=32768,r=8,p=3$<salt, base64url>$<key, base64url>
 *
 * N=2^15, r=8, p=3 is OWASP's memory-light setting. It needs about 32 MiB for the table while it
 * runs, which fits a 256 MB Fly machine, and `maxmem` is raised just enough to allow it. Hashing
 * runs on libuv's thread pool, so it never blocks the event loop, and at most MAX_CONCURRENT
 * hashes run at once so a flood cannot use up the machine's memory.
 */

export const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const ALGORITHM = 'scrypt';

export type ScryptParams = { N: number; r: number; p: number };
export type ParsedHash = { params: ScryptParams; salt: Buffer; key: Buffer };

/** Bounds on what a stored string may ask for, so a damaged row cannot ask for gigabytes. */
const MAX_N = 2 ** 17;
const MAX_R = 16;
const MAX_P = 16;
/** scrypt's table is 128*N*r bytes; a string asking for more than this is malformed, not just costly. */
const MAX_TABLE_BYTES = 64 * 1024 * 1024;

const maxmemFor = ({ N, r, p }: ScryptParams) => 256 * N * r + 128 * r * p + 1024 * 1024;

// ---------------------------------------------------------------------------------- policy

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

/** Unicode-normalised, so the same password typed on two keyboards is the same password. */
const normalise = (password: string) => password.normalize('NFKC');

/**
 * Raw input longer than this (UTF-16 code units) is refused BEFORE it is normalised or split into
 * characters: NFKC can grow a string many times over, and a 100 MB field must not become several.
 * Four times the longest allowed password, which is roughly what a legitimate one can reach.
 */
export const MAX_RAW_INPUT = 1024;

const EASY = 'try a phrase only you would think of';

/**
 * The rules, in the spirit of NIST 800-63B: a length, a ceiling, and refusing the obviously bad:
 * a pattern, or a password on the list of common ones. No "one capital and one symbol" rules.
 * Returns a sentence for the owner, or null when it is fine.
 */
export function passwordProblem(password: unknown, setupCode?: string): string | null {
	if (typeof password !== 'string' || password.length === 0) return 'Enter a password.';
	if (password.length > MAX_RAW_INPUT) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
	const text = normalise(password);
	const chars = [...text];
	if (chars.length < MIN_PASSWORD_LENGTH) {
		return `Use at least ${MIN_PASSWORD_LENGTH} characters. A few words in a row make a good password.`;
	}
	if (chars.length > MAX_PASSWORD_LENGTH) {
		return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
	}
	if (new Set(chars).size === 1) return 'A password cannot be one character repeated.';
	const block = repeatedBlockSize(chars);
	if (block !== null) {
		return block <= 4
			? 'A password cannot be a short pattern repeated.'
			: `A password cannot be the same words repeated. Please ${EASY}.`;
	}
	if (isCharacterRun(chars)) {
		return `A password cannot be letters or numbers in a row. Please ${EASY}.`;
	}
	if (isKeyboardWalk(text)) {
		return `A password cannot be keys in a row on the keyboard. Please ${EASY}.`;
	}
	if (isCommonPassword(text) || isWordThenDigits(text, isCommonPassword)) {
		return `This one is too common — ${EASY}.`;
	}
	const code = setupCode?.trim().toLowerCase();
	if (code && text.toLowerCase().includes(code)) {
		return 'A password cannot contain the setup code.';
	}
	return null;
}

// ------------------------------------------------------------------------------- hashing

const derive = (password: string, salt: Buffer, params: ScryptParams, keyLength: number) =>
	new Promise<Buffer>((resolve, reject) => {
		scrypt(
			normalise(password),
			salt,
			keyLength,
			{ N: params.N, r: params.r, p: params.p, maxmem: maxmemFor(params) },
			(error, key) => (error ? reject(error) : resolve(key))
		);
	});

/** At most this many hashes at once; the rest wait, up to MAX_WAITING, then are turned away. */
const MAX_CONCURRENT = 2;
const MAX_WAITING = 16;

export class PasswordBusyError extends Error {
	constructor() {
		super('Payday is busy checking passwords. Wait a moment, then try again.');
	}
}

export type Gate = <T>(work: () => Promise<T>) => Promise<T>;

export function createGate(maxConcurrent = MAX_CONCURRENT, maxWaiting = MAX_WAITING): Gate {
	let running = 0;
	const waiting: Array<() => void> = [];
	return async (work) => {
		if (running >= maxConcurrent) {
			if (waiting.length >= maxWaiting) throw new PasswordBusyError();
			await new Promise<void>((resume) => waiting.push(resume));
		} else {
			running++;
		}
		try {
			return await work();
		} finally {
			// Hand the slot straight to the next waiter, or free it.
			const next = waiting.shift();
			if (next) next();
			else running--;
		}
	};
}

const gate = createGate();
/** The queue every hash goes through. Exported so a test can hold it full. */
export const passwordGate: Gate = gate;

const b64 = (bytes: Buffer) => bytes.toString('base64url');

/** Hashes a password into the self-describing stored string. */
export function hashPassword(password: string, params: ScryptParams = SCRYPT_PARAMS) {
	return gate(async () => {
		const salt = randomBytes(SALT_BYTES);
		const key = await derive(password, salt, params, KEY_BYTES);
		return `${ALGORITHM}$N=${params.N},r=${params.r},p=${params.p}$${b64(salt)}$${b64(key)}`;
	});
}

const isPowerOfTwo = (n: number) => Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0;

/** Reads a stored string back into its parts; null when it is not one of ours. */
export function parseHash(stored: string): ParsedHash | null {
	const parts = stored.split('$');
	if (parts.length !== 4 || parts[0] !== ALGORITHM) return null;
	const match = /^N=(\d{1,7}),r=(\d{1,3}),p=(\d{1,3})$/.exec(parts[1]);
	if (!match) return null;
	const params = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) };
	if (!isPowerOfTwo(params.N) || params.N > MAX_N) return null;
	if (params.r < 1 || params.r > MAX_R || params.p < 1 || params.p > MAX_P) return null;
	if (128 * params.N * params.r > MAX_TABLE_BYTES) return null;
	if (!/^[A-Za-z0-9_-]+$/.test(parts[2]) || !/^[A-Za-z0-9_-]+$/.test(parts[3])) return null;
	const salt = Buffer.from(parts[2], 'base64url');
	const key = Buffer.from(parts[3], 'base64url');
	if (salt.length < 8 || key.length < 16) return null;
	return { params, salt, key };
}

/** Whether a stored hash was made with weaker parameters than today's, so it can be re-hashed. */
export function needsRehash(stored: string): boolean {
	const parsed = parseHash(stored);
	if (!parsed) return true;
	const { N, r, p } = parsed.params;
	return N < SCRYPT_PARAMS.N || r < SCRYPT_PARAMS.r || p < SCRYPT_PARAMS.p;
}

/** Checks a password against a stored string, in constant time. A malformed string never matches. */
export function verifyPassword(password: string, stored: string): Promise<boolean> {
	// Too long to be anyone's password: refused before it is normalised, copied or queued.
	if (password.length > MAX_RAW_INPUT) return Promise.resolve(false);
	return gate(async () => {
		const parsed = parseHash(stored);
		if (!parsed) return false;
		const key = await derive(password, parsed.salt, parsed.params, parsed.key.length);
		return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
	});
}

// ------------------------------------------------------------------- the owner's password

/**
 * A lazily built hash of a random password, checked when there is nothing real to check, so the
 * time is the same. A failed build (the queue was full on first use) is forgotten, not kept: if it
 * were cached, every later no-password request would fail at once, uncounted, and the instant
 * answer would say whether a password is set.
 */
export function createDummyHash(make: () => Promise<string>): () => Promise<string> {
	let dummy: Promise<string> | null = null;
	return () => {
		if (!dummy) {
			const attempt = make();
			dummy = attempt;
			attempt.catch(() => {
				if (dummy === attempt) dummy = null;
			});
		}
		return dummy;
	};
}

const dummyHash = createDummyHash(() => hashPassword(randomBytes(16).toString('hex')));

export const getPasswordHash = (db: Db, ownerId: number): string | null =>
	db.select({ hash: owner.passwordHash }).from(owner).where(eq(owner.id, ownerId)).get()?.hash ??
	null;

export const hasPassword = (db: Db, ownerId: number): boolean =>
	getPasswordHash(db, ownerId) !== null;

export type OwnerPasswordCheck = {
	ok: boolean;
	/** The exact stored string that matched: what a later write must still find in the row. Null unless ok. */
	hash: string | null;
	/** True when the work was done against the dummy hash (no password set, or unusable input). */
	dummy: boolean;
};

/**
 * Whether `password` is the owner's. Always does the same work: with no password set (or a
 * password too long to be one) it checks against a dummy, so the time says nothing. Returns the
 * hash it verified against, so the caller can refuse to act if the password changed meanwhile.
 */
export async function verifyOwnerPassword(
	db: Db,
	ownerId: number,
	password: unknown
): Promise<OwnerPasswordCheck> {
	const stored = getPasswordHash(db, ownerId);
	const text = typeof password === 'string' ? password : '';
	const usable = stored !== null && text.length > 0 && text.length <= MAX_RAW_INPUT;
	const match = await verifyPassword(usable ? text : '', usable ? stored : await dummyHash());
	const ok = usable && match;
	return { ok, hash: ok ? stored : null, dummy: !usable };
}

export async function checkOwnerPassword(
	db: Db,
	ownerId: number,
	password: unknown
): Promise<boolean> {
	return (await verifyOwnerPassword(db, ownerId, password)).ok;
}

/** True while the owner's stored hash is still exactly `hash`. Synchronous, so it can sit in a transaction. */
export const passwordUnchanged = (db: Db, ownerId: number, hash: string | null): boolean =>
	getPasswordHash(db, ownerId) === hash;

export function setPasswordHash(db: Db, ownerId: number, hash: string): void {
	db.update(owner).set({ passwordHash: hash }).where(eq(owner.id, ownerId)).run();
}
