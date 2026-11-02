import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	actualMinutes,
	advancePending,
	attentionRef,
	boardColumns,
	buildTaskIndex,
	criteriaOf,
	effectivePhase,
	epicColours,
	humanDuration,
	lastPhase,
	liveGates,
	phaseGate,
	phaseProgress,
	planStatusOf,
	readinessPhase,
	sidebarCounts,
	sprintStatus,
	STATUSES,
	type Board,
	type Plan
} from './api';

/*
 * The derivation goldens from .management/contract/fixtures/: load two files, call the function,
 * compare. If one fails, the dashboard disagrees with the design about a number on screen.
 */

const fixtures = new URL('../../../../.management/contract/fixtures/', import.meta.url);
const load = (path: string) => JSON.parse(readFileSync(new URL(path, fixtures), 'utf8'));

/** The expectations without their `_` commentary keys. */
const strip = (o: Record<string, unknown>) =>
	Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

describe('dashboard derivations — main goldens', () => {
	const plan: Plan & { today: string } = load('plan.json');
	const board: Board = load('board.json');
	const expected = load('expected.json');
	const index = buildTaskIndex(plan, board);

	it('effective phase, pending advance, readiness phase and last phase', () => {
		expect(effectivePhase(plan, board)).toBe(expected.effectivePhase);
		expect(advancePending(plan, board)).toBe(expected.advancePending);
		expect(readinessPhase(plan, board)).toBe(expected.readinessPhase);
		expect(lastPhase(plan)).toBe(expected.lastPhase);
	});

	it('builds the task index: the plan with authored data on top', () => {
		const want = strip(expected.taskIndex);
		expect([...index.keys()].sort()).toEqual(Object.keys(want).sort());
		for (const [id, fields] of Object.entries(want)) {
			expect(index.get(id), id).toMatchObject(strip(fields as Record<string, unknown>));
		}
	});

	it("knows each task's plan status, ignoring overrides", () => {
		for (const [id, status] of Object.entries(strip(expected.planStatusOf))) {
			expect(planStatusOf(index, id), id).toBe(status);
		}
	});

	it('marks a parked criterion satisfied but never met', () => {
		expect(criteriaOf(plan, board, 0)).toMatchObject(expected.criteriaOfPhase0);
	});

	it('computes the phase gate, including the wording of what is left', () => {
		const gate = phaseGate(plan, board, index, 0);
		const want = strip(expected.phaseGatePhase0);
		expect({
			criteriaMet: gate.criteriaMet,
			criteriaParked: gate.criteriaParked,
			unmetCriteria: gate.unmetCriteria,
			outstandingTasks: gate.outstandingTasks,
			inFlight: gate.inFlight,
			parkedTasks: gate.parkedTasks,
			parkedPoints: gate.parkedPoints,
			open: gate.open,
			tasksSettled: gate.tasksSettled,
			leftUnfinished: gate.leftUnfinished
		}).toEqual(want);
	});

	it('colours epics by phase hue and position shade, sorted centrally', () => {
		expect(Object.fromEntries(epicColours(plan))).toEqual(strip(expected.epicColours));
	});

	it('sums actual time from its entries', () => {
		for (const [id, minutes] of Object.entries(expected.actualMinutes)) {
			expect(actualMinutes(board, id)).toBe(minutes);
		}
	});

	it('renders durations in human units', () => {
		for (const [input, out] of Object.entries(expected.humanDuration)) {
			expect(humanDuration(input === 'null' ? null : Number(input)), input).toBe(out);
		}
	});

	it('derives stable attention references', () => {
		for (const [title, ref] of Object.entries(expected.attentionRef)) {
			expect(attentionRef(title)).toBe(ref);
		}
	});

	it('derives sprint status from the dates', () => {
		const want = expected['sprintStatusOn2026-01-15'];
		for (const sprint of board.sprints) {
			expect(sprintStatus(sprint, plan.today)).toBe(want[sprint.name]);
		}
	});

	it('fills the five columns in order: priority, then phase, then epic', () => {
		const columns = boardColumns(index.values());
		const want = strip(expected.boardColumns);
		expect(Object.keys(want)).toEqual([...STATUSES]);
		for (const status of STATUSES) {
			expect(
				columns[status].map((t) => t.key),
				status
			).toEqual(want[status]);
		}
	});

	it('computes only Exit criteria and Tasks live', () => {
		const gates = liveGates(phaseGate(plan, board, index, readinessPhase(plan, board)));
		const want = strip(expected.liveGates);
		expect(Object.keys(gates)).toEqual(Object.keys(want));
		for (const [name, gate] of Object.entries(want)) {
			expect(gates[name as keyof typeof gates]).toMatchObject(gate as object);
		}
	});

	it('counts the sidebar: open tasks, current-phase epics, people, and nothing on Status', () => {
		expect(sidebarCounts(plan, board, index)).toEqual(strip(expected.sidebarCounts));
	});

	it('measures phase progress with parked work out of the denominator', () => {
		expect(phaseProgress(index, 0)).toBe(expected.phaseProgressPhase0);
	});
});

describe('dashboard derivations — lifecycle goldens', () => {
	const plan: Plan = load('lifecycle/plan.json');
	const board: Board = load('lifecycle/board.json');
	const expected = load('lifecycle/expected.json');
	const index = buildTaskIndex(plan, board);

	it('ignores a consumed advance, and reads readiness from the verified phase', () => {
		expect(effectivePhase(plan, board)).toBe(expected.effectivePhase);
		expect(advancePending(plan, board)).toBe(expected.advancePending);
		expect(readinessPhase(plan, board)).toBe(expected.readinessPhase);
	});

	it('tells unconfirmed, unverified, rejected and dragged completions apart', () => {
		for (const [id, fields] of Object.entries(expected.taskIndex)) {
			expect(index.get(id), id).toMatchObject(strip(fields as Record<string, unknown>));
		}
	});

	it('counts an at-release criterion as satisfied for the gate, never as met', () => {
		const criteria = criteriaOf(plan, board, 0);
		expect(criteria).toEqual(
			expected.criteriaOfPhase0.map((c: Record<string, unknown>) => strip(c))
		);
		const gate = phaseGate(plan, board, index, 0);
		expect(gate.criteriaMet).toBe(1);
		expect(gate.unmetCriteria).toEqual([]);
	});
});
