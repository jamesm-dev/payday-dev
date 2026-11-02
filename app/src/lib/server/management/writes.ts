import type Database from 'better-sqlite3';
import { PRIORITIES, STATUSES, type Plan } from '#lib/management/api.ts';
import { ManagementError } from './store.ts';

/**
 * The seventeen writes of .management/design/API Surface.md. Each writes board.db only; none of
 * them touches .idea/. Validation lives here, not only in the forms, and every refusal is a
 * sentence the page renders verbatim.
 *
 * `null` is meaningful in three places — a status override, a priority override and an
 * assignment — and clears rather than meaning "no change".
 */

type Payload = Record<string, unknown>;
type Write = (db: Database.Database, plan: Plan, p: Payload) => unknown;

const now = () => new Date().toISOString();
const fail = (message: string): never => {
	throw new ManagementError(message);
};

function taskIdOf(db: Database.Database, plan: Plan, p: Payload): string {
	const id = typeof p.taskId === 'string' ? p.taskId.trim() : '';
	if (!id) fail('taskId required');
	const wanted = id.toUpperCase();
	const planned = plan.epics.some((e) => e.tasks.some((t) => t.id?.toUpperCase() === wanted));
	const authored = db.prepare('SELECT 1 FROM task_authored WHERE upper(task_id) = ?').get(wanted);
	if (!planned && !authored) fail(`no task ${id} on the board`);
	return id;
}

function authoredIdOf(db: Database.Database, plan: Plan, p: Payload): string {
	const id = taskIdOf(db, plan, p);
	if (!/^ADH-/i.test(id)) {
		fail('only an ad-hoc task can be changed this way — a derived task comes from the plan');
	}
	return id;
}

/** A whole, non-negative number, or null to clear. */
function amountOrNull(value: unknown, what: string): number | null {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0) fail(`${what} must be a whole number, zero or more`);
	return n;
}

function upsertMeta(db: Database.Database, taskId: string, fields: Record<string, unknown>): void {
	const at = now();
	db.prepare(
		`INSERT INTO task_meta (task_id, origin, created_at, updated_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT(task_id) DO NOTHING`
	).run(taskId, /^ADH-/i.test(taskId) ? 'authored' : 'derived', at, at);
	for (const [column, value] of Object.entries(fields)) {
		db.prepare(`UPDATE task_meta SET ${column} = ?, updated_at = ? WHERE task_id = ?`).run(
			value,
			at,
			taskId
		);
	}
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string =>
	typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function newAuthoredId(db: Database.Database): string {
	for (;;) {
		const hex = Math.floor(Math.random() * 0x10000)
			.toString(16)
			.toUpperCase()
			.padStart(4, '0');
		const id = `ADH-${hex}`;
		if (!db.prepare('SELECT 1 FROM task_authored WHERE task_id = ?').get(id)) return id;
	}
}

export const WRITES: Record<string, Write> = {
	task(db, plan, p) {
		const taskId = taskIdOf(db, plan, p);
		const fields: Record<string, unknown> = {};
		if ('points' in p) fields.points = amountOrNull(p.points, 'Points');
		if ('notes' in p) fields.notes = typeof p.notes === 'string' && p.notes ? p.notes : null;
		upsertMeta(db, taskId, fields);
		return {};
	},

	estimate(db, plan, p) {
		const taskId = taskIdOf(db, plan, p);
		upsertMeta(db, taskId, { estimate_min: amountOrNull(p.minutes, 'An estimate') });
		return {};
	},

	time(db, plan, p) {
		const taskId = taskIdOf(db, plan, p);
		const minutes = Number(p.minutes);
		if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 7 * 24 * 60) {
			fail('log a whole number of minutes, above zero and no more than a week');
		}
		const note = typeof p.note === 'string' && p.note.trim() ? p.note.trim() : null;
		db.prepare(
			'INSERT INTO time_entry (task_id, minutes, note, logged_at) VALUES (?, ?, ?, ?)'
		).run(taskId, minutes, note, now());
		return {};
	},

	assignee(db, _plan, p) {
		const name = typeof p.name === 'string' ? p.name.trim() : '';
		if (!name) fail('name required');
		const handle = typeof p.handle === 'string' && p.handle.trim() ? p.handle.trim() : null;
		const { lastInsertRowid } = db
			.prepare('INSERT INTO assignee (name, handle) VALUES (?, ?)')
			.run(name, handle);
		return { id: Number(lastInsertRowid) };
	},

	assign(db, plan, p) {
		const taskId = taskIdOf(db, plan, p);
		db.prepare('DELETE FROM task_assignee WHERE task_id = ?').run(taskId);
		if (p.assigneeId === null || p.assigneeId === undefined || p.assigneeId === '') return {};
		const id = Number(p.assigneeId);
		if (!db.prepare('SELECT 1 FROM assignee WHERE id = ? AND active = 1').get(id)) {
			fail('no such person — add them on the Team page first');
		}
		db.prepare(
			'INSERT INTO task_assignee (task_id, assignee_id, assigned_at) VALUES (?, ?, ?)'
		).run(taskId, id, now());
		return {};
	},

	authored(db, plan, p) {
		const title = typeof p.title === 'string' ? p.title.trim() : '';
		if (!title) fail('A task needs a title.');
		const epic = typeof p.epic === 'string' ? p.epic : '';
		if (!plan.epics.some((e) => e.title === epic)) fail('Pick the epic this belongs to.');
		const priority = p.priority ?? null;
		if (priority !== null && !PRIORITIES.includes(priority as never)) {
			fail('priority must be high, normal or low');
		}
		const taskId = newAuthoredId(db);
		const description =
			typeof p.description === 'string' && p.description.trim() ? p.description.trim() : null;
		db.prepare(
			`INSERT INTO task_authored (task_id, title, description, epic, status, created_at)
			 VALUES (?, ?, ?, ?, 'next-up', ?)`
		).run(taskId, title, description, epic, now());
		upsertMeta(db, taskId, {});
		if (priority) {
			db.prepare('INSERT INTO task_priority (task_id, priority, set_at) VALUES (?, ?, ?)').run(
				taskId,
				priority,
				now()
			);
		}
		return { taskId };
	},

	'authored/delete'(db, plan, p) {
		const taskId = authoredIdOf(db, plan, p);
		for (const table of [
			'task_authored',
			'task_meta',
			'task_assignee',
			'time_entry',
			'task_status',
			'task_priority',
			'task_pr'
		]) {
			db.prepare(`DELETE FROM ${table} WHERE task_id = ?`).run(taskId);
		}
		return {};
	},

	'authored/status'(db, plan, p) {
		const taskId = authoredIdOf(db, plan, p);
		if (!STATUSES.includes(p.status as never)) {
			fail(`status must be one of ${STATUSES.join(', ')}`);
		}
		db.prepare('UPDATE task_authored SET status = ? WHERE task_id = ?').run(p.status, taskId);
		return {};
	},

	status(db, plan, p) {
		const taskId = taskIdOf(db, plan, p);
		const row = db.prepare('SELECT * FROM task_status WHERE task_id = ?').get(taskId) as
			{ rejected_at: string | null } | undefined;

		if (p.status === null) {
			// Back to the plan. A rejected agent completion is kept, reset to the agent's, so it is
			// ignored again and the agent still knows it was rejected.
			if (row?.rejected_at) {
				db.prepare("UPDATE task_status SET source = 'agent' WHERE task_id = ?").run(taskId);
			} else {
				db.prepare('DELETE FROM task_status WHERE task_id = ?').run(taskId);
			}
			return {};
		}

		if (!STATUSES.includes(p.status as never)) {
			fail(`status must be one of ${STATUSES.join(', ')}`);
		}
		if (row) {
			// Keeps rejected_at and evidence_shas: a person's drop never erases a rejection.
			db.prepare(
				`UPDATE task_status SET status = ?, source = 'human', confirmed_by = NULL,
				 confirmed_at = NULL, set_at = ? WHERE task_id = ?`
			).run(p.status, now(), taskId);
		} else {
			db.prepare(
				"INSERT INTO task_status (task_id, status, source, set_at) VALUES (?, ?, 'human', ?)"
			).run(taskId, p.status, now());
		}
		return {};
	},

	priority(db, plan, p) {
		const taskId = taskIdOf(db, plan, p);
		if (p.priority === null) {
			db.prepare('DELETE FROM task_priority WHERE task_id = ?').run(taskId);
			return {};
		}
		if (!PRIORITIES.includes(p.priority as never)) fail('priority must be high, normal or low');
		db.prepare(
			`INSERT INTO task_priority (task_id, priority, set_at) VALUES (?, ?, ?)
			 ON CONFLICT(task_id) DO UPDATE SET priority = excluded.priority, set_at = excluded.set_at`
		).run(taskId, p.priority, now());
		return {};
	},

	pr(db, plan, p) {
		const taskId = taskIdOf(db, plan, p);
		const url = typeof p.url === 'string' ? p.url.trim() : '';
		if (!/^https?:\/\/\S+$/.test(url)) fail('a pull request link starts with https://');
		if (db.prepare('SELECT 1 FROM task_pr WHERE task_id = ? AND url = ?').get(taskId, url)) {
			fail('that pull request is already attached');
		}
		const number = /\/pull\/(\d+)/.exec(url)?.[1];
		db.prepare('INSERT INTO task_pr (task_id, url, number, added_at) VALUES (?, ?, ?, ?)').run(
			taskId,
			url,
			number ? Number(number) : null,
			now()
		);
		return {};
	},

	sprint(db, _plan, p) {
		const name = typeof p.name === 'string' ? p.name.trim() : '';
		if (!name) fail('a sprint needs a name');
		if (!isDate(p.startsOn) || !isDate(p.endsOn)) fail('dates look like 2026-08-31');
		const startsOn = p.startsOn as string;
		const endsOn = p.endsOn as string;
		if (endsOn <= startsOn) fail('the end date must follow the start date');
		if (db.prepare('SELECT 1 FROM sprint WHERE lower(name) = lower(?)').get(name)) {
			fail('there is already a sprint with that name');
		}
		const clash = db
			.prepare('SELECT name FROM sprint WHERE NOT (ends_on < ? OR starts_on > ?) LIMIT 1')
			.get(startsOn, endsOn) as { name: string } | undefined;
		if (clash) fail(`those dates overlap ${clash.name}`);
		const goal = typeof p.goal === 'string' && p.goal.trim() ? p.goal.trim() : null;
		const { lastInsertRowid } = db
			.prepare(
				'INSERT INTO sprint (name, starts_on, ends_on, goal, created_at) VALUES (?, ?, ?, ?, ?)'
			)
			.run(name, startsOn, endsOn, goal, now());
		return { id: Number(lastInsertRowid) };
	},

	'sprint/delete'(db, _plan, p) {
		if (p.sprintId === null || p.sprintId === undefined || p.sprintId === '') {
			fail('sprintId required');
		}
		const id = Number(p.sprintId);
		const { n } = db.prepare('SELECT count(*) AS n FROM task_meta WHERE sprint_id = ?').get(id) as {
			n: number;
		};
		if (n > 0) fail(`that sprint holds ${n} task${n === 1 ? '' : 's'} — move them off it first`);
		db.prepare('DELETE FROM sprint WHERE id = ?').run(id);
		return {};
	},

	'task/sprint'(db, plan, p) {
		const taskId = taskIdOf(db, plan, p);
		let sprintId: number | null = null;
		if (p.sprintId !== null && p.sprintId !== undefined && p.sprintId !== '') {
			sprintId = Number(p.sprintId);
			if (!db.prepare('SELECT 1 FROM sprint WHERE id = ?').get(sprintId)) fail('no such sprint');
		}
		upsertMeta(db, taskId, { sprint_id: sprintId });
		return {};
	},

	'criterion/park'(db, plan, p) {
		const phase = Number(p.phase);
		const text = typeof p.text === 'string' ? p.text : '';
		const known = plan.phases
			.find((ph) => ph.n === phase)
			?.exitCriteria.some((c) => c.text === text);
		if (!known) fail(`Phase ${p.phase} has no exit criterion with that text`);
		if (p.parked) {
			db.prepare(
				'INSERT OR IGNORE INTO criterion_park (phase, text, parked_at) VALUES (?, ?, ?)'
			).run(phase, text, now());
		} else {
			db.prepare('DELETE FROM criterion_park WHERE phase = ? AND text = ?').run(phase, text);
		}
		return {};
	},

	'phase/advance'(db, plan, p) {
		const phase = Number(p.phase);
		if (!plan.phases.some((ph) => ph.n === phase)) fail(`there is no Phase ${p.phase}`);
		if (!plan.phases.some((ph) => ph.n === phase + 1)) {
			fail('This is the last phase in the roadmap. /shape adds more.');
		}
		const eligible = p.eligible === true;
		if (!eligible && p.force !== true) {
			fail(`Phase ${phase} is not finished — advance anyway to record it as forced`);
		}
		const forced = eligible ? 0 : 1;
		const left = typeof p.leftUnfinished === 'string' && p.leftUnfinished ? p.leftUnfinished : null;
		// Upserts on phase: a phase /epic reopened can be advanced again, replacing the consumed row.
		db.prepare(
			`INSERT INTO phase_advance (phase, requested_at, consumed_at, forced, left_unfinished)
			 VALUES (?, ?, NULL, ?, ?)
			 ON CONFLICT(phase) DO UPDATE SET requested_at = excluded.requested_at, consumed_at = NULL,
			   forced = excluded.forced, left_unfinished = excluded.left_unfinished`
		).run(phase, now(), forced, left);
		return { forced: forced === 1 };
	},

	'phase/advance/withdraw'(db, _plan, p) {
		const phase = Number(p.phase);
		const { changes } = db
			.prepare('DELETE FROM phase_advance WHERE phase = ? AND consumed_at IS NULL')
			.run(phase);
		if (changes === 0) fail(`no pending advance from Phase ${p.phase} to step back`);
		return {};
	}
};

/** Applies one write in a transaction. Throws ManagementError with a sentence on refusal. */
export function applyWrite(db: Database.Database, plan: Plan, op: string, payload: Payload) {
	const write = WRITES[op];
	if (!write) throw new ManagementError(`unknown operation: ${op}`);
	return db.transaction(() => write(db, plan, payload))();
}
