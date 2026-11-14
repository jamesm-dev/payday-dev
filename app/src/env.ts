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
	LITESTREAM_METRICS_URL: {
		description:
			"Litestream's metrics endpoint, polled for the backup age on /health. Unset locally, where nothing is replicated.",
		schema: (value) => value || undefined
	},
	OWNER_SETUP_CODE: {
		description:
			'One-time code that lets the first owner register in production. Set it as a Fly secret, enter it on /signin, then it does nothing once an owner exists. Unset, first registration is refused.',
		// Optional so the build, which has no secret, can run. checkSetupCode() refuses when it is unset.
		schema: (value) => value || undefined
	},
	VAPID_PUBLIC_KEY: {
		description:
			'The public half of the Web Push (VAPID) key pair. Generate the pair once with `npx web-push generate-vapid-keys`. Unset, payday reminders are off and the settings page says so.',
		// Optional so the build, which has no key, can run. vapidConfig() checks all three together.
		schema: (value) => value || undefined
	},
	VAPID_PRIVATE_KEY: {
		description:
			'The private half of the VAPID key pair. A Fly secret, never committed. Unset, payday reminders are off.',
		schema: (value) => value || undefined
	},
	VAPID_SUBJECT: {
		description:
			'Who is sending the reminders, as a mailto:you@example.com or an https:// address, so a push service can reach the sender. Unset, payday reminders are off.',
		schema: (value) => value || undefined
	},
	MANAGEMENT_DIR: {
		description:
			'Where the dev-only /management dashboard reads state.json and board.db. Defaults to ../.management.',
		schema: (value) => value || undefined
	}
});
