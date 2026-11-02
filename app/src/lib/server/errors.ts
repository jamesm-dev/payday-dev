import type { Logger } from './log';

type Caught = {
	kind: 'app' | 'framework' | 'unknown' | 'validation';
	error: unknown;
	requestId: string;
	method: string;
	path: string;
};

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

	logger({
		level: 'error',
		msg: 'unexpected error',
		requestId,
		method,
		path,
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined
	});

	return { message: 'Something went wrong on our side.', requestId };
}
