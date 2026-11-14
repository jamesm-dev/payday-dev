import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` needs no connection: it diffs schema.ts against the last snapshot. Migrations
// are applied by `pnpm db:migrate` (a postgres-js script), never by `drizzle-kit push`.
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	verbose: true,
	strict: true
});
