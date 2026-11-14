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
	logger({
		level: 'error',
		msg: 'unexpected error',
		requestId,
		method,
		path,
		error: message,
		stack
	});

	return { message: 'Something went wrong on our side.', requestId };
}
