// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			/** Shown on the error page so a report can be matched to its log line. */
			requestId?: string;
		}
		interface Locals {
			requestId: string;
			/** The signed-in owner, or null. Set by the guard in hooks.server.ts on every request. */
			ownerId: number | null;
		}
		// interface PageData {}
		interface PageState {
			/** The task open in the dev-only /management drawer; the back button closes it. */
			task?: string;
		}
		// interface Platform {}
	}
}

export {};
