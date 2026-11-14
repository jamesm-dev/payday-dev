import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';
import {
	DATABASE_UNREACHABLE_MESSAGE,
	isDatabaseUnreachable,
	loggable,
	reportError
} from './errors';
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

describe('TSK-10C918 a failed query is logged without its parameters or its SQL', () => {
	const failure = () =>
		new DrizzleQueryError(
			'update "payday"."owner" set "password_hash" = $1',
			['scrypt$32768$8$3$salt$hash'],
			new Error('canceling statement due to statement timeout')
		);

	it('loggable gives the driver error beneath, not the wrapper', () => {
		const { message, stack } = loggable(failure());
		expect(message).toBe('canceling statement due to statement timeout');
		expect(`${message} ${stack}`).not.toContain('scrypt$');
		expect(`${message} ${stack}`).not.toContain('password_hash');
	});

	it('reportError logs neither the parameters nor the SQL', () => {
		const lines: LogLine[] = [];
		reportError({ kind: 'unknown', error: failure(), ...request }, (line) => lines.push(line));
		expect(JSON.stringify(lines)).not.toContain('scrypt$');
		expect(JSON.stringify(lines)).not.toContain('password_hash');
		expect(lines[0].error).toBe('canceling statement due to statement timeout');
	});

	it('a wrapper with no cause still logs nothing from it', () => {
		const bare = new DrizzleQueryError('select 1', ['secret'], undefined);
		expect(loggable(bare).message).toBe('A database query failed.');
	});
});

describe('TSK-13D3EB a paused or unreachable database is explained in plain words', () => {
	const coded = (code: string, message = 'secret driver text postgres://u:hunter2@h/db') =>
		Object.assign(new Error(message), { code });
	const wrapped = (cause: unknown) =>
		new DrizzleQueryError('select 1 /* hunter2 */', ['hunter2'], cause as Error);

	it('recognises refused, unknown-host, timed-out, shut-down and pooler "tenant or user not found"', () => {
		for (const code of [
			'ECONNREFUSED',
			'ENOTFOUND',
			'EAI_AGAIN',
			'ETIMEDOUT',
			'ECONNRESET',
			'EHOSTUNREACH',
			'ENETUNREACH',
			'CONNECT_TIMEOUT',
			'CONNECTION_CLOSED',
			'CONNECTION_ENDED',
			'57P01',
			'57P02',
			'57P03',
			'08006',
			'08001'
		]) {
			expect(isDatabaseUnreachable(coded(code)), code).toBe(true);
		}
		expect(isDatabaseUnreachable(coded('XX000', 'Tenant or user not found'))).toBe(true);
	});

	it('looks through the query wrapper and a socket AggregateError', () => {
		expect(isDatabaseUnreachable(wrapped(coded('ECONNREFUSED')))).toBe(true);
		const many = Object.assign(new AggregateError([coded('ECONNREFUSED')]), {});
		expect(isDatabaseUnreachable(many)).toBe(true);
	});

	it('leaves an ordinary failed query, and junk, alone', () => {
		expect(isDatabaseUnreachable(coded('23505', 'duplicate key'))).toBe(false);
		expect(
			isDatabaseUnreachable(coded('57014', 'canceling statement due to statement timeout'))
		).toBe(false);
		expect(isDatabaseUnreachable(new Error('boom'))).toBe(false);
		for (const junk of [null, undefined, 'ECONNREFUSED', 42]) {
			expect(isDatabaseUnreachable(junk)).toBe(false);
		}
	});

	it('shows the plain message and the request id, never the address or the driver words', () => {
		const lines: LogLine[] = [];
		const body = reportError(
			{ kind: 'unknown', error: wrapped(coded('ECONNREFUSED')), ...request },
			(line) => lines.push(line)
		);
		expect(body).toEqual({ message: DATABASE_UNREACHABLE_MESSAGE, requestId: 'req-123' });
		expect(DATABASE_UNREACHABLE_MESSAGE).toContain('Supabase');
		expect(DATABASE_UNREACHABLE_MESSAGE).toContain('Restore');
		expect(JSON.stringify(body)).not.toMatch(/hunter2|postgres:|secret driver/);
		// The log holds the driver's error beneath, not the wrapper's query or parameters.
		expect(JSON.stringify(lines)).not.toContain('hunter2 */');
	});
});
