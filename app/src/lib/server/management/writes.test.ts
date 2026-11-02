import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Plan } from '#lib/management/api.ts';
import { ManagementError, openBoard, readBoard } from './store';
import { applyWrite } from './writes';

// Always a temporary board.db: these tests never touch .management/board.db.
const plan: Plan = JSON.parse(
	readFileSync(
		new URL('../../../../../.management/contract/fixtures/plan.json', import.meta.url),
		'utf8'
	)
);

describe('dashboard writes go to board.db only, and refuse in sentences', () => {
	let dir: string;
	let db: Database.Database;
	const write = (op: string, payload: Record<string, unknown>) => applyWrite(db, plan, op, payload);

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'payday-board-'));
		db = openBoard(join(dir, 'board.db'));
	});
	afterEach(() => {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('creates an empty board with all thirteen tables on first open', () => {
		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all() as Array<{ name: string }>;
		expect(tables).toHaveLength(13);
		expect(readBoard(db)).toMatchObject({ statuses: [], assignees: [], pullRequests: null });
	});

	it('a status write overrides, and null clears the override rather than writing a status', () => {
		write('status', { taskId: 'TSK-000003', status: 'parked' });
		expect(readBoard(db).statuses).toMatchObject([
			{ task_id: 'TSK-000003', status: 'parked', source: 'human' }
		]);
		write('status', { taskId: 'TSK-000003', status: null });
		expect(readBoard(db).statuses).toEqual([]);
	});

	it('null on a rejected agent row hands it back to the agent, so the rejection is kept', () => {
		db.prepare(
			`INSERT INTO task_status (task_id, status, source, note, rejected_at, set_at)
			 VALUES ('TSK-000002', 'done', 'agent', 'Rejected: no test', '2026-01-02', '2026-01-01')`
		).run();
		write('status', { taskId: 'TSK-000002', status: 'in-progress' });
		expect(readBoard(db).statuses[0]).toMatchObject({ source: 'human', rejected_at: '2026-01-02' });
		write('status', { taskId: 'TSK-000002', status: null });
		expect(readBoard(db).statuses[0]).toMatchObject({ source: 'agent', rejected_at: '2026-01-02' });
	});

	it('null clears a priority override and unassigns', () => {
		write('priority', { taskId: 'TSK-000001', priority: 'low' });
		write('priority', { taskId: 'TSK-000001', priority: null });
		expect(readBoard(db).priorities).toEqual([]);

		const { id } = write('assignee', { name: 'Jamie Doe' }) as { id: number };
		write('assign', { taskId: 'TSK-000001', assigneeId: id });
		write('assign', { taskId: 'TSK-000001', assigneeId: null });
		expect(readBoard(db).taskAssignees).toEqual([]);
	});

	it('creates an ad-hoc task with an ADH- id, which only it can delete', () => {
		const { taskId } = write('authored', { title: 'Seed data', epic: 'Beta Epic' }) as {
			taskId: string;
		};
		expect(taskId).toMatch(/^ADH-[0-9A-F]{4}$/);
		expect(() => write('authored/delete', { taskId: 'TSK-000001' })).toThrow(ManagementError);
		write('authored/delete', { taskId });
		expect(readBoard(db).authored).toEqual([]);
	});

	it('refuses with the sentences the page renders verbatim', () => {
		expect(() => write('status', { status: 'done' })).toThrow('taskId required');
		expect(() => write('sprint', { startsOn: '2026-01-01', endsOn: '2026-01-14' })).toThrow(
			'a sprint needs a name'
		);
		expect(() => write('sprint', { name: 'S1', startsOn: '1 Jan', endsOn: '2026-01-14' })).toThrow(
			'dates look like 2026-08-31'
		);
		expect(() =>
			write('sprint', { name: 'S1', startsOn: '2026-01-14', endsOn: '2026-01-01' })
		).toThrow('the end date must follow the start date');

		const { id } = write('sprint', {
			name: 'Sprint 1',
			startsOn: '2026-01-01',
			endsOn: '2026-01-14'
		}) as { id: number };
		expect(() =>
			write('sprint', { name: 'Sprint 1', startsOn: '2026-02-01', endsOn: '2026-02-14' })
		).toThrow('there is already a sprint with that name');
		expect(() =>
			write('sprint', { name: 'Sprint 2', startsOn: '2026-01-10', endsOn: '2026-01-20' })
		).toThrow('those dates overlap Sprint 1');

		write('task/sprint', { taskId: 'TSK-000002', sprintId: id });
		expect(() => write('sprint/delete', { sprintId: id })).toThrow(
			'that sprint holds 1 task — move them off it first'
		);
		expect(() => write('sprint/delete', {})).toThrow('sprintId required');
		expect(() => write('assignee', { name: ' ' })).toThrow('name required');
	});

	it('records a forced advance with what was left, and steps it back while pending', () => {
		expect(
			write('phase/advance', {
				phase: 0,
				eligible: false,
				force: true,
				leftUnfinished: '1 task not done'
			})
		).toEqual({
			forced: true
		});
		expect(readBoard(db).advances).toMatchObject([
			{ phase: 0, consumed_at: null, forced: 1, left_unfinished: '1 task not done' }
		]);
		write('phase/advance/withdraw', { phase: 0 });
		expect(readBoard(db).advances).toEqual([]);
	});

	it('parks and unparks an exit criterion by its text', () => {
		write('criterion/park', { phase: 0, text: 'It is tested', parked: true });
		expect(readBoard(db).parkedCriteria).toMatchObject([{ phase: 0, text: 'It is tested' }]);
		write('criterion/park', { phase: 0, text: 'It is tested', parked: false });
		expect(readBoard(db).parkedCriteria).toEqual([]);
	});
});
