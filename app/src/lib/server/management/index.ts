import { error } from '@sveltejs/kit';
import type Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { dev } from '$app/env';
import { MANAGEMENT_DIR } from '$app/env/private';
import type { Board, Plan } from '#lib/management/api.ts';
import { ManagementError } from './error.ts';

export { ManagementError };

/*
 * The dashboard is development-only. Nothing here imports better-sqlite3 (a native module) or the
 * store that uses it until a request has passed assertDev(): the production server bundle then has
 * no static import of it, and on Netlify it is never loaded.
 */

/**
 * Every route under /management calls this first, so the page and its writable endpoints fail
 * closed together: outside the dev server they are a 404, never an open door.
 */
export function assertDev(): void {
	if (!dev) error(404, 'Not Found');
}

/**
 * The store, loaded on first use, and only in development. Vite replaces `import.meta.env.DEV` with
 * `false` in a production build and drops the branch, so the production bundle holds no chunk that
 * imports better-sqlite3 at all, not even one that is never loaded.
 */
async function stores() {
	assertDev();
	if (import.meta.env.DEV) {
		const [store, writes] = await Promise.all([import('./store.ts'), import('./writes.ts')]);
		return { ...store, applyWrite: writes.applyWrite };
	}
	return error(404, 'Not Found');
}

/** Where state.json and board.db live: MANAGEMENT_DIR, else ../.management beside app/. */
function managementDir(): string {
	return resolve(MANAGEMENT_DIR ?? resolve(process.cwd(), '..', '.management'));
}

const boards = new Map<string, Database.Database>();

async function board(dir: string): Promise<Database.Database> {
	const file = resolve(dir, 'board.db');
	let db = boards.get(file);
	if (!db) {
		db = (await stores()).openBoard(file);
		boards.set(file, db);
	}
	return db;
}

/** Local calendar date: a sprint is active on the owner's today, not UTC's. */
function today(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type DashboardData =
	| { plan: Plan; board: Board; today: string; failure: null }
	| { plan: null; board: null; today: string; failure: string };

/** Both reads, together. Re-run after every successful write. */
export async function loadDashboard(): Promise<DashboardData> {
	const dir = managementDir();
	try {
		const { readBoard, readState } = await stores();
		return {
			plan: readState(dir),
			board: readBoard(await board(dir)),
			today: today(),
			failure: null
		};
	} catch (e) {
		const failure = e instanceof ManagementError ? e.message : String(e);
		return { plan: null, board: null, today: today(), failure };
	}
}

export async function readStateOnly(): Promise<Plan> {
	return (await stores()).readState(managementDir());
}

export async function readBoardOnly(): Promise<Board> {
	return (await stores()).readBoard(await board(managementDir()));
}

export async function write(op: string, payload: Record<string, unknown>): Promise<unknown> {
	const dir = managementDir();
	const { applyWrite, readState } = await stores();
	return applyWrite(await board(dir), readState(dir), op, payload);
}
