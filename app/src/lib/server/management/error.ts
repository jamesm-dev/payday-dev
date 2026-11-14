/**
 * Kept apart from store.ts so the routes can name it without loading better-sqlite3: the dashboard
 * is development-only, and production's server bundle must never reach that native module.
 */
export class ManagementError extends Error {}
