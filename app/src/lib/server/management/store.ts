import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Board, Plan } from '#lib/management/api.ts';

/**
 * The dashboard's two reads: the plan from state.json, and everything authored or synced from
 * board.db. board.db is tooling data, never product data: it is a separate file, outside the app's
 * own migrations and backups (.management/design/Requirements.md).
 */

export class ManagementError extends Error {}

/** The thirteen tables of .management/design/Database Schema.md, applied on every open. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS task_meta (
  task_id TEXT PRIMARY KEY, origin TEXT NOT NULL, points INTEGER, estimate_min INTEGER,
  sprint_id INTEGER, notes TEXT, orphaned_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_authored (
  task_id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, epic TEXT NOT NULL,
  status TEXT NOT NULL, promote_requested INTEGER NOT NULL DEFAULT 0, promoted_to TEXT,
  created_by INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sprint (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
  goal TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS epic_sprint (
  epic TEXT PRIMARY KEY, sprint_id INTEGER NOT NULL, notes TEXT, assigned_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assignee (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, handle TEXT, avatar_url TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS task_assignee (
  task_id TEXT NOT NULL, assignee_id INTEGER NOT NULL, assigned_at TEXT NOT NULL,
  PRIMARY KEY (task_id, assignee_id)
);
CREATE TABLE IF NOT EXISTS time_entry (
  id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, minutes INTEGER NOT NULL, note TEXT,
  assignee_id INTEGER, logged_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_pr (
  id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, url TEXT NOT NULL, number INTEGER, title TEXT,
  author TEXT, state TEXT, checks TEXT, synced_at TEXT, added_at TEXT NOT NULL,
  UNIQUE (task_id, url)
);
CREATE TABLE IF NOT EXISTS test_run (
  id INTEGER PRIMARY KEY, task_id TEXT, epic TEXT, name TEXT NOT NULL, status TEXT NOT NULL,
  duration_ms INTEGER, url TEXT, detail TEXT, ran_at TEXT NOT NULL, synced_at TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_status (
  task_id TEXT PRIMARY KEY, status TEXT NOT NULL, source TEXT NOT NULL, note TEXT,
  evidence_shas TEXT, pr_url TEXT, confirmed_by INTEGER, confirmed_at TEXT, rejected_at TEXT,
  set_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_priority (
  task_id TEXT PRIMARY KEY, priority TEXT NOT NULL, set_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS criterion_park (
  phase INTEGER NOT NULL, text TEXT NOT NULL, parked_at TEXT NOT NULL, PRIMARY KEY (phase, text)
);
CREATE TABLE IF NOT EXISTS phase_advance (
  phase INTEGER PRIMARY KEY, requested_at TEXT NOT NULL, consumed_at TEXT,
  forced INTEGER NOT NULL DEFAULT 0, left_unfinished TEXT
);
`;

/**
 * Columns added after the first release. CREATE TABLE IF NOT EXISTS never migrates, so every
 * column added later is listed here and added to an older board.db on open. None yet.
 */
const ADDED_COLUMNS: Array<[table: string, column: string, definition: string]> = [];

export function ensureColumn(
	db: Database.Database,
	table: string,
	column: string,
	definition: string
): void {
	const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
	if (columns.length === 0) return; // the schema statement creates the table
	if (columns.some((c) => c.name === column)) return;
	db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** Opens board.db, creating it empty with the schema when it does not exist yet. */
export function openBoard(file: string): Database.Database {
	const db = new Database(file);
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 2000');
	db.exec(SCHEMA);
	for (const [table, column, definition] of ADDED_COLUMNS)
		ensureColumn(db, table, column, definition);
	return db;
}

export function readState(dir: string): Plan {
	const file = join(dir, 'state.json');
	if (!existsSync(file)) throw new ManagementError('no state.json — run /setup');
	return JSON.parse(readFileSync(file, 'utf8')) as Plan;
}

export function readBoard(db: Database.Database): Board {
	const all = <T>(sql: string) => db.prepare(sql).all() as T[];
	return {
		meta: all('SELECT task_id, points, estimate_min, sprint_id, notes FROM task_meta'),
		authored: all(
			'SELECT task_id, title, description, epic, status FROM task_authored ORDER BY created_at'
		),
		assignees: all('SELECT id, name, handle FROM assignee WHERE active = 1 ORDER BY id'),
		taskAssignees: all('SELECT task_id, assignee_id FROM task_assignee ORDER BY assigned_at'),
		sprints: all('SELECT id, name, starts_on, ends_on, goal FROM sprint ORDER BY starts_on'),
		epicSprints: all('SELECT epic, sprint_id, notes, assigned_at FROM epic_sprint'),
		timeEntries: all('SELECT id, task_id, minutes, note, logged_at FROM time_entry ORDER BY id'),
		prs: all('SELECT * FROM task_pr ORDER BY id'),
		testRuns: all('SELECT * FROM test_run ORDER BY ran_at DESC, id'),
		advances: all('SELECT * FROM phase_advance ORDER BY phase'),
		parkedCriteria: all('SELECT phase, text, parked_at FROM criterion_park ORDER BY parked_at'),
		priorities: all('SELECT task_id, priority, set_at FROM task_priority'),
		statuses: all('SELECT * FROM task_status'),
		// No GitHub MCP is configured, so pull request status is not synced: null means
		// "not configured", never "no open pull requests" (API Surface.md).
		pullRequests: null
	};
}
