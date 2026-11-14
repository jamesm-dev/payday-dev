import { isPostgresUrl } from './open.ts';

export type MigrationTarget =
	| { ok: true; url: string; source: 'DATABASE_MIGRATION_URL' | 'DATABASE_URL' }
	| { ok: false; message: string };

/**
 * Which database `pnpm db:migrate` changes (ADR-0015). The deploy's build runs it with
 * `DATABASE_MIGRATION_URL`, Supabase's session pooler (port 5432), because migrations need a
 * connection that holds its session; the running app uses `DATABASE_URL`, the transaction pooler.
 * Only when no migration address is set does it fall back to `DATABASE_URL`.
 *
 * A value that is set but is not a postgres address is refused, not skipped over: guessing which
 * database was meant would be worse than failing the deploy. The message never repeats the value,
 * because it is a password-bearing address and the build log is not private.
 */
export function chooseMigrationUrl(env: {
	DATABASE_MIGRATION_URL?: string;
	DATABASE_URL?: string;
	NETLIFY?: string;
	CONTEXT?: string;
}): MigrationTarget {
	// A migration changes the real database, so only a production deploy may run one. Netlify sets
	// NETLIFY=true and CONTEXT to production, deploy-preview, branch-deploy or dev. (netlify.toml also
	// stops previews and branch builds before they start; this is the second lock.)
	if (env.NETLIFY === 'true' && env.CONTEXT !== 'production') {
		return {
			ok: false,
			message:
				'Refusing to migrate: this is not a production deploy ' +
				`(CONTEXT is ${JSON.stringify(env.CONTEXT ?? 'unset')}). Payday deploys only from the deploy branch.`
		};
	}
	const migration = env.DATABASE_MIGRATION_URL?.trim();
	const runtime = env.DATABASE_URL?.trim();
	const source = migration ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
	const url = migration || runtime;

	if (!url) {
		return {
			ok: false,
			message:
				'Refusing to migrate: neither DATABASE_MIGRATION_URL nor DATABASE_URL is set. ' +
				'Set DATABASE_MIGRATION_URL to the Supabase session pooler address.'
		};
	}
	if (!isPostgresUrl(url)) {
		return {
			ok: false,
			message:
				`Refusing to migrate: ${source} must be a postgres:// or postgresql:// address. ` +
				'(Local and test databases migrate themselves when they open.)'
		};
	}
	return { ok: true, url, source };
}
