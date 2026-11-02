import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** SHA-256 as hex. Tokens and recovery codes carry far too much entropy for a slow hash to matter. */
export const sha256Hex = (value: string): string =>
	createHash('sha256').update(value).digest('hex');

/** 32 random bytes, base64url: the value that lives in the session cookie. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/** Constant-time string comparison, for any place code (not the database) compares a secret. */
export function safeEqual(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}
