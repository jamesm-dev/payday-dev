import { describe, expect, it } from 'vitest';
import { reportError } from './errors';
import type { LogLine } from './log';

const request = { requestId: 'req-123', method: 'GET', path: '/' };

describe('TSK-AE10FB unexpected errors are logged with a request id and shown plainly', () => {
	it('logs an unknown error in full, with the request id', () => {
		const lines: LogLine[] = [];
		const cause = new Error('SQLITE_CORRUPT: database disk image is malformed');

		reportError({ kind: 'unknown', error: cause, ...request }, (line) => lines.push(line));

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			level: 'error',
			requestId: 'req-123',
			method: 'GET',
			path: '/',
			error: 'SQLITE_CORRUPT: database disk image is malformed'
		});
		expect(lines[0].stack).toContain('SQLITE_CORRUPT');
	});

	it('shows a plain message and the request id, never the error itself', () => {
		const body = reportError(
			{ kind: 'unknown', error: new Error('SQLITE_CORRUPT: secret detail'), ...request },
			() => {}
		);

		expect(body).toEqual({ message: 'Something went wrong on our side.', requestId: 'req-123' });
		expect(JSON.stringify(body)).not.toContain('SQLITE');
	});

	it('keeps the safe message of an expected error, such as a 404, and logs nothing', () => {
		const lines: LogLine[] = [];
		const body = reportError(
			{ kind: 'framework', error: { status: 404, message: 'Not Found' }, ...request },
			(line) => lines.push(line)
		);

		expect(body).toEqual({ requestId: 'req-123' });
		expect(lines).toEqual([]);
	});
});
