import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description:
			'Where the data lives: a postgres:// address (Supabase) in production; memory:// for a database that lives and dies with the process; any other value is a directory for a local database. Unset in development, it is .pglite/.',
		// Optional only so the build, which has no database, can run. getDb() refuses to start
		// without it outside development: a guessed address would silently put the data somewhere
		// nobody chose.
		schema: (value) => value || undefined
	},
	DATABASE_CA_CERT_PATH: {
		description:
			'Optional. Path of a CA certificate (PEM) that the Postgres server is verified against; without it a postgres:// connection is encrypted (sslmode=require) but not verified. No certificate ships with the app.',
		schema: (value) => value || undefined
	},
	OWNER_SETUP_CODE: {
		description:
			'One-time code that lets the first owner register in production. Set it as a Netlify environment variable, enter it on /signin, then it does nothing once an owner exists. Unset, first registration is refused.',
		// Optional so the build, which has no secret, can run. checkSetupCode() refuses when it is unset.
		schema: (value) => value || undefined
	},
	GOOGLE_CLIENT_ID: {
		description:
			'Optional. Google sign-in is switched off while this or GOOGLE_CLIENT_SECRET is empty; set both in Netlify to switch it on.',
		schema: (value) => value || undefined
	},
	GOOGLE_CLIENT_SECRET: {
		description:
			'Optional. The secret that goes with GOOGLE_CLIENT_ID. Set it as a secret Netlify variable; never put it in the repository.',
		schema: (value) => value || undefined
	},
	GOOGLE_TEST_PROVIDER: {
		description:
			'Browser tests only: the http://127.0.0.1:<port> address of a fake Google. Ignored by the Netlify build.',
		schema: (value) => value || undefined
	},
	MANAGEMENT_DIR: {
		description:
			'Where the dev-only /management dashboard reads state.json and board.db. Defaults to ../.management.',
		schema: (value) => value || undefined
	}
});
