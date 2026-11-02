import { error } from '@sveltejs/kit';
import type Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { dev } from '$app/env';
import { MANAGEMENT_DIR } from '$app/env/private';
import type { Board, Plan } from '#lib/management/api.ts';
import { ManagementError, openBoard, readBoard, readState } from './store.ts';
import { applyWrite } from './writes.ts';

export { ManagementError };

/**
 * The dashboard is development-only (the owner's choice at /setup). Every route under
 * /management calls this first, so the page and its writable endpoints fail closed together:
 * outside the dev server they are a 404, never an open door.
 */
export function assertDev(): void {
	if (!dev) error(404, 'Not Found');
}

/** Where state.json and board.db live: MANAGEMENT_DIR, else ../.management beside app/. */
function managementDir(): string {
	return resolve(MANAGEMENT_DIR ?? resolve(process.cwd(), '..', '.management'));
}

const boards = new Map<string, Database.Database>();

function board(dir: string): Database.Database {
	const file = resolve(dir, 'board.db');
	let db = boards.get(file);
	if (!db) {
		db = openBoard(file);
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
export function loadDashboard(): DashboardData {
	const dir = managementDir();
	try {
		return { plan: readState(dir), board: readBoard(board(dir)), today: today(), failure: null };
	} catch (e) {
		const failure = e instanceof ManagementError ? e.message : String(e);
		return { plan: null, board: null, today: today(), failure };
	}
}

export function readStateOnly(): Plan {
	return readState(managementDir());
}

export function readBoardOnly(): Board {
	return readBoard(board(managementDir()));
}

export function write(op: string, payload: Record<string, unknown>): unknown {
	const dir = managementDir();
	return applyWrite(board(dir), readState(dir), op, payload);
}
