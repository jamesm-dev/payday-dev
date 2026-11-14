import { DrizzleQueryError } from 'drizzle-orm/errors';
import type { Logger } from './log';

type Caught = {
	kind: 'app' | 'framework' | 'unknown' | 'validation';
	error: unknown;
	requestId: string;
	method: string;
	path: string;
};

/**
 * What may be logged about an error. Drizzle wraps a failed query in an error whose message carries
 * the query's parameters, which can be a password hash or a value from the budget. The driver's own
 * error beneath it says what went wrong without them, so that is what gets logged.
 */
export function loggable(error: unknown): { message: string; stack: string | undefined } {
	const inner =
		error instanceof DrizzleQueryError
			? (error.cause ?? new Error('A database query failed.'))
			: error;
	return inner instanceof Error
		? { message: inner.message, stack: inner.stack }
		: { message: String(inner), stack: undefined };
}

/** What the page says when the database cannot be reached. Never the address, never the driver's words. */
export const DATABASE_UNREACHABLE_MESSAGE =
	"Payday can't reach its database right now. If nobody has used it for a week, Supabase may have paused it: open the Supabase dashboard and press Restore, then try again.";

// Node's socket errors and postgres-js's own connection codes.
const UNREACHABLE_CODES = new Set([
	'ECONNREFUSED',
	'ECONNRESET',
	'ENOTFOUND',
	'EAI_AGAIN',
	'ETIMEDOUT',
	'EHOSTUNREACH',
	'ENETUNREACH',
	'CONNECT_TIMEOUT',
	'CONNECTION_CLOSED',
	'CONNECTION_ENDED',
	'CONNECTION_DESTROYED'
]);

/**
 * True when an error means the database cannot be reached at all, as opposed to a query that went
 * wrong: the connection was refused, the host is unknown or unreachable, it timed out, the server
 * was shut down (SQLSTATE 57P01 to 57P03, or class 08), or Supabase's pooler says "tenant or user
 * not found", which is what a paused project answers. Looks through Drizzle's wrapper and an
 * AggregateError's members. Reads codes and the one pooler phrase only; nothing is returned from it.
 */
export function isDatabaseUnreachable(error: unknown, depth = 0): boolean {
	if (depth > 5 || typeof error !== 'object' || error === null) return false;
	const e = error as {
		code?: unknown;
		message?: unknown;
		cause?: unknown;
		errors?: unknown;
	};
	if (typeof e.code === 'string') {
		if (UNREACHABLE_CODES.has(e.code)) return true;
		if (/^(57P0[123]|08[0-9A-Z]{3})$/.test(e.code)) return true;
	}
	if (typeof e.message === 'string' && /tenant or user not found/i.test(e.message)) return true;
	if (
		Array.isArray(e.errors) &&
		e.errors.some((inner) => isDatabaseUnreachable(inner, depth + 1))
	) {
		return true;
	}
	return isDatabaseUnreachable(e.cause, depth + 1);
}

/** Overrides for the error the page receives; omitted fields keep SvelteKit's safe defaults. */
export type ErrorBody = { message?: string; requestId: string };

/**
 * Turns an error caught while serving a request into what the page may show, and logs it.
 *
 * Unknown errors are logged in full but shown only as a plain message and the request id, so a
 * stack trace or a database message never reaches the browser.
 */
export function reportError(caught: Caught, logger: Logger): ErrorBody {
	const { kind, error, requestId, method, path } = caught;

	// App, framework and validation errors already carry a safe message, such as a 404's.
	if (kind !== 'unknown') return { requestId };

	const { message, stack } = loggable(error);
	const unreachable = isDatabaseUnreachable(error);
	logger({
		level: 'error',
		msg: 'unexpected error',
		requestId,
		method,
		path,
		error: message,
		stack
	});

	if (unreachable) return { message: DATABASE_UNREACHABLE_MESSAGE, requestId };
	return { message: 'Something went wrong on our side.', requestId };
}
