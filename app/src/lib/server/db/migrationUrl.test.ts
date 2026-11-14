import { describe, expect, it } from 'vitest';
import { chooseMigrationUrl } from './migrationUrl.ts';

const SESSION = 'postgres://postgres.abc:secret@aws-0-eu.pooler.supabase.com:5432/postgres';
const TRANSACTION = 'postgres://postgres.abc:secret@aws-0-eu.pooler.supabase.com:6543/postgres';

describe('TSK-7975B9 the deploy migrates the database the migration address names', () => {
	it('prefers DATABASE_MIGRATION_URL over DATABASE_URL', () => {
		expect(
			chooseMigrationUrl({ DATABASE_MIGRATION_URL: SESSION, DATABASE_URL: TRANSACTION })
		).toEqual({ ok: true, url: SESSION, source: 'DATABASE_MIGRATION_URL' });
	});

	it('falls back to DATABASE_URL when no migration address is set, or it is blank', () => {
		for (const blank of [undefined, '', '   ']) {
			expect(
				chooseMigrationUrl({ DATABASE_MIGRATION_URL: blank, DATABASE_URL: TRANSACTION })
			).toEqual({ ok: true, url: TRANSACTION, source: 'DATABASE_URL' });
		}
	});

	it('accepts postgresql:// as well as postgres://', () => {
		const url = 'postgresql://u:p@host:5432/db';
		expect(chooseMigrationUrl({ DATABASE_MIGRATION_URL: url }).ok).toBe(true);
	});

	it('refuses when nothing is set', () => {
		const result = chooseMigrationUrl({});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain('DATABASE_MIGRATION_URL');
	});

	it('refuses a local or SQLite address, and does not fall back past a bad migration address', () => {
		for (const bad of ['memory://', '.pglite', './local.db', 'mysql://u:p@h/db']) {
			expect(chooseMigrationUrl({ DATABASE_URL: bad }).ok, bad).toBe(false);
			expect(
				chooseMigrationUrl({ DATABASE_MIGRATION_URL: bad, DATABASE_URL: TRANSACTION }).ok,
				bad
			).toBe(false);
		}
	});

	it('on Netlify, migrates only for a production deploy', () => {
		const env = { DATABASE_MIGRATION_URL: SESSION, NETLIFY: 'true' };
		expect(chooseMigrationUrl({ ...env, CONTEXT: 'production' }).ok).toBe(true);
		for (const context of ['deploy-preview', 'branch-deploy', 'dev', '', undefined]) {
			const result = chooseMigrationUrl({ ...env, CONTEXT: context });
			expect(result.ok, String(context)).toBe(false);
			if (!result.ok) expect(result.message).toContain('not a production deploy');
		}
	});

	it('off Netlify (a local run) the context does not matter', () => {
		expect(
			chooseMigrationUrl({ DATABASE_MIGRATION_URL: SESSION, CONTEXT: 'deploy-preview' }).ok
		).toBe(true);
	});

	it('never repeats the address, which holds a password, in the refusal', () => {
		const result = chooseMigrationUrl({ DATABASE_MIGRATION_URL: 'mysql://u:hunter2@h/db' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).not.toContain('hunter2');
	});
});
