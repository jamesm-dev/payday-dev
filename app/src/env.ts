import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Path to the SQLite file: local.db in development, /data/payday.db on Fly.io.',
		// Optional only so the build, which has no database, can run. getDb() refuses to start
		// without it: a default path would silently put the data somewhere a deploy erases.
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
