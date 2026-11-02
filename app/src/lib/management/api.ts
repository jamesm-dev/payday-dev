/**
 * The dashboard's data layer: types, the client for the reads and writes, and EVERY derivation.
 *
 * No section computes "is this task done" for itself. The task index is built once per load,
 * here, and every view reads it (.management/design/Derivations.md). These functions are pure, so
 * the goldens in .management/contract/fixtures/ test them directly.
 */

// --- vocabularies -------------------------------------------------------------

export const STATUSES = ['parked', 'blocked', 'in-progress', 'next-up', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['high', 'normal', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

/** Board columns, in their fixed order. Parked first: set aside sits left of work in flight. */
export const COLUMNS: ReadonlyArray<{ status: Status; label: string }> = [
	{ status: 'parked', label: 'Parked' },
	{ status: 'blocked', label: 'Blocked' },
	{ status: 'in-progress', label: 'In progress' },
	{ status: 'next-up', label: 'Next up' },
	{ status: 'done', label: 'Done' }
];

export const SECTIONS = [
	{ id: 'board', label: 'Board' },
	{ id: 'specs', label: 'Specs' },
	{ id: 'team', label: 'Team' },
	{ id: 'status', label: 'Status' }
] as const;
export type Section = (typeof SECTIONS)[number]['id'];

/** The only two gates a browser can compute honestly. Do not widen this set. */
export const LIVE_GATES = ['Exit criteria', 'Tasks'] as const;
export const GATE_NAMES = [
	'Exit criteria',
	'Tasks',
	'Tests',
	'Checks',
	'Pull requests',
	'Risks',
	'Deploy path'
] as const;

/** Four hue families by phase: green, blue, amber, violet. Never one generated hue per epic. */
export const PHASE_HUES = [152, 210, 32, 285];
const SHADE_STEP = 9;
const SHADE_CAP = 3;

// --- the plan: state.json -----------------------------------------------------

export interface PlanTask {
	id: string | null;
	text: string;
	description?: string;
	done: boolean;
	priority?: Priority;
	points?: number | null;
}
export interface PlanEpic {
	title: string;
	phase: number;
	status: string;
	theme?: string;
	sources?: string[];
	tasks: PlanTask[];
}
export interface PlanCriterion {
	text: string;
	done: boolean;
}
export interface PlanPhase {
	n: number;
	name: string;
	goal: string;
	demo?: string;
	status: string;
	exitCriteria: PlanCriterion[];
	nonGoals?: string[];
}
export interface Blocker {
	title: string;
	since: string;
	epic: string;
	nextAction: string;
	ref?: string;
	severity?: 'critical' | 'warning';
}
export interface Gate {
	name: string;
	met: boolean;
	why: string;
}
export interface Plan {
	generatedAt: string;
	project: { name: string; description?: string; currentPhase: number };
	phases: PlanPhase[];
	epics: PlanEpic[];
	blockers?: Blocker[];
	metrics?: Record<string, number>;
	readiness?: Gate[];
}

// --- the board: board.db ------------------------------------------------------

export interface MetaRow {
	task_id: string;
	points: number | null;
	estimate_min: number | null;
	sprint_id: number | null;
	notes: string | null;
}
export interface AuthoredRow {
	task_id: string;
	title: string;
	description: string | null;
	epic: string;
	status: Status;
}
export interface AssigneeRow {
	id: number;
	name: string;
	handle: string | null;
}
export interface TaskAssigneeRow {
	task_id: string;
	assignee_id: number;
}
export interface SprintRow {
	id: number;
	name: string;
	starts_on: string;
	ends_on: string;
	goal: string | null;
}
export interface TimeEntryRow {
	id: number;
	task_id: string;
	minutes: number;
	note: string | null;
	logged_at: string;
}
export interface PrRow {
	id: number;
	task_id: string;
	url: string;
	number: number | null;
	title?: string | null;
	author?: string | null;
	state: string | null;
	checks?: string | null;
	synced_at: string | null;
	added_at: string;
}
export interface TestRunRow {
	id: number;
	task_id: string | null;
	epic: string | null;
	name: string;
	status: 'passed' | 'failed' | 'skipped' | 'error';
	duration_ms: number | null;
	url: string | null;
	detail: string | null;
	ran_at: string;
	synced_at: string;
	source: string;
}
export interface AdvanceRow {
	phase: number;
	requested_at: string;
	consumed_at: string | null;
	forced: number;
	left_unfinished: string | null;
}
export interface ParkedCriterionRow {
	phase: number;
	text: string;
	parked_at: string;
}
export interface PriorityRow {
	task_id: string;
	priority: Priority;
	set_at: string;
}
export interface StatusRow {
	task_id: string;
	status: Status;
	source: 'human' | 'agent';
	note?: string | null;
	evidence_shas?: string | null;
	pr_url?: string | null;
	confirmed_by?: number | null;
	confirmed_at?: string | null;
	rejected_at?: string | null;
	set_at: string;
}
export interface Board {
	meta: MetaRow[];
	authored: AuthoredRow[];
	assignees: AssigneeRow[];
	taskAssignees: TaskAssigneeRow[];
	sprints: SprintRow[];
	epicSprints: unknown[];
	timeEntries: TimeEntryRow[];
	prs: PrRow[];
	testRuns: TestRunRow[];
	advances: AdvanceRow[];
	parkedCriteria: ParkedCriterionRow[];
	priorities: PriorityRow[];
	statuses: StatusRow[];
	/** null means no GitHub MCP is configured — never "no open pull requests". */
	pullRequests: unknown[] | null;
}

// --- the task index -------------------------------------------------------------

export interface TaskState {
	/** The reference id, or null when /setup found none: such a card is read-only. */
	id: string | null;
	key: string;
	title: string;
	description: string;
	epic: string;
	phase: number;
	planStatus: Status;
	status: Status;
	done: boolean;
	parked: boolean;
	overridden: boolean;
	unconfirmed: boolean;
	unverified: boolean;
	points: number | null;
	priority: Priority;
	priorityOverridden: boolean;
	authored: boolean;
	explicit: StatusRow | null;
}

const norm = (id: string) => id.toUpperCase();
const byTitle = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function lastPhase(plan: Plan): number {
	return plan.phases.length ? Math.max(...plan.phases.map((p) => p.n)) : 0;
}

export function effectivePhase(plan: Plan, board: Board): number {
	// A consumed advance is already in project.currentPhase.
	const advanced = board.advances.filter((a) => a.consumed_at == null).map((a) => a.phase + 1);
	return Math.min(lastPhase(plan), Math.max(plan.project.currentPhase, ...advanced, 0));
}

export function advancePending(plan: Plan, board: Board): boolean {
	return effectivePhase(plan, board) > plan.project.currentPhase;
}

/** The phase "can we ship yet" is about: the lowest verified one, otherwise the effective one. */
export function readinessPhase(plan: Plan, board: Board): number {
	const waiting = plan.phases.filter((p) => p.status === 'verified').map((p) => p.n);
	return waiting.length ? Math.min(...waiting) : effectivePhase(plan, board);
}

export function buildTaskIndex(plan: Plan, board: Board): Map<string, TaskState> {
	const statusById = new Map(board.statuses.map((r) => [norm(r.task_id), r]));
	const priorityById = new Map(board.priorities.map((r) => [norm(r.task_id), r]));
	const metaById = new Map(board.meta.map((r) => [norm(r.task_id), r]));
	const current = effectivePhase(plan, board);

	// Priority follows the phase the project is actually on, so advancing re-prioritises at once.
	const derivedPriority = (phase: number): Priority =>
		phase === current ? 'high' : phase === current + 1 ? 'normal' : 'low';

	const index = new Map<string, TaskState>();

	function put(
		id: string | null,
		key: string,
		f: {
			title: string;
			description: string;
			epic: string;
			phase: number;
			planStatus: Status;
			planPoints: number | null;
			planPriority: Priority | null;
			authored: boolean;
		}
	) {
		const row = id ? statusById.get(norm(id)) : undefined;
		// A rejected agent completion is kept, but never applied. A person's later drop applies.
		const explicit = row && !(row.source === 'agent' && row.rejected_at) ? row : null;
		const status = explicit?.status ?? f.planStatus;
		const unconfirmed =
			!!explicit &&
			explicit.source === 'agent' &&
			explicit.confirmed_by == null &&
			status === 'done';
		const unverified =
			!f.authored &&
			status === 'done' &&
			f.planStatus !== 'done' &&
			!!explicit &&
			(explicit.source === 'human' || explicit.confirmed_by != null);
		const priorityRow = id ? priorityById.get(norm(id)) : undefined;
		const meta = id ? metaById.get(norm(id)) : undefined;
		index.set(key, {
			id,
			key,
			title: f.title,
			description: f.description,
			epic: f.epic,
			phase: f.phase,
			planStatus: f.planStatus,
			status,
			done: status === 'done' && !unconfirmed && !unverified,
			parked: status === 'parked',
			overridden: !!explicit,
			unconfirmed,
			unverified,
			points: meta?.points ?? f.planPoints,
			priority: priorityRow?.priority ?? f.planPriority ?? derivedPriority(f.phase),
			priorityOverridden: !!priorityRow,
			authored: f.authored,
			explicit
		});
	}

	for (const epic of plan.epics) {
		epic.tasks.forEach((task, i) => {
			put(task.id, task.id ?? `no-id:${epic.title}:${i}`, {
				title: task.text,
				description: task.description ?? '',
				epic: epic.title,
				phase: epic.phase,
				planStatus: task.done ? 'done' : 'next-up',
				planPoints: task.points ?? null,
				planPriority: task.priority ?? null,
				authored: false
			});
		});
	}
	for (const a of board.authored) {
		put(a.task_id, a.task_id, {
			title: a.title,
			description: a.description ?? '',
			epic: a.epic,
			phase: plan.epics.find((e) => e.title === a.epic)?.phase ?? 0,
			planStatus: a.status,
			planPoints: null,
			planPriority: null,
			authored: true
		});
	}
	return index;
}

/** The plan's own status, ignoring any override. Dragging a task back here clears the override. */
export function planStatusOf(index: Map<string, TaskState>, key: string): Status | null {
	return index.get(key)?.planStatus ?? null;
}

// --- exit criteria and the phase gate ---------------------------------------------

export interface CriterionState {
	text: string;
	done: boolean;
	parked: boolean;
	atRelease: boolean;
	satisfied: boolean;
}

export function criteriaOf(plan: Plan, board: Board, phase: number): CriterionState[] {
	const parked = new Set(board.parkedCriteria.filter((c) => c.phase === phase).map((c) => c.text));
	const criteria = plan.phases.find((p) => p.n === phase)?.exitCriteria ?? [];
	return criteria.map((c) => {
		// /ship proves these after the deploy; no work before a release can meet them.
		const atRelease = c.text.endsWith(' — at release');
		const isParked = parked.has(c.text);
		return {
			text: c.text,
			done: c.done,
			parked: isParked,
			atRelease,
			satisfied: c.done || isParked || atRelease
		};
	});
}

export interface PhaseGate {
	phase: number;
	criteria: CriterionState[];
	criteriaMet: number;
	criteriaParked: number;
	unmetCriteria: string[];
	tasks: TaskState[];
	outstandingTasks: string[];
	inFlight: string[];
	parkedTasks: string[];
	parkedPoints: number;
	open: boolean;
	tasksSettled: boolean;
	leftUnfinished: string;
}

const s = (n: number, one = '', many = 's') => (n === 1 ? one : many);

export function phaseGate(
	plan: Plan,
	board: Board,
	index: Map<string, TaskState>,
	phase: number
): PhaseGate {
	const criteria = criteriaOf(plan, board, phase);
	const unmet = criteria.filter((c) => !c.satisfied);
	const tasks = [...index.values()].filter((t) => t.phase === phase);

	const parked = tasks.filter((t) => t.parked);
	const outstanding = tasks.filter((t) => !t.done && !t.parked);
	const inFlight = tasks.filter((t) => t.status === 'blocked' || t.status === 'in-progress');

	const parts: string[] = [];
	if (unmet.length) parts.push(`${unmet.length} exit criteri${s(unmet.length, 'on', 'a')} unmet`);
	if (outstanding.length) {
		parts.push(`${outstanding.length} task${s(outstanding.length)} not done`);
	}
	if (inFlight.length) parts.push(`${inFlight.length} blocked or in progress`);

	return {
		phase,
		criteria,
		// Met means done. A parked criterion is satisfied but never met.
		criteriaMet: criteria.filter((c) => c.done).length,
		criteriaParked: criteria.filter((c) => c.parked && !c.done).length,
		unmetCriteria: unmet.map((c) => c.text),
		tasks,
		outstandingTasks: outstanding.map((t) => t.key),
		inFlight: inFlight.map((t) => t.key),
		parkedTasks: parked.map((t) => t.key),
		parkedPoints: parked.reduce((sum, t) => sum + (t.points ?? 0), 0),
		open: criteria.length > 0 && !unmet.length && !outstanding.length && !inFlight.length,
		// Tasks are the work: this, not `open`, is what moves a phase on.
		tasksSettled: tasks.length > 0 && !outstanding.length && !inFlight.length,
		leftUnfinished: parts.join(', ')
	};
}

/** Exit criteria and Tasks, recomputed; every other gate exactly as /setup wrote it. */
export function liveGates(gate: PhaseGate): Record<(typeof LIVE_GATES)[number], Gate> {
	const total = gate.criteria.length;
	const parkedNote = gate.criteriaParked ? `, ${gate.criteriaParked} parked` : '';
	const tasksParked = gate.parkedTasks.length ? `, ${gate.parkedTasks.length} parked` : '';
	return {
		'Exit criteria': {
			name: 'Exit criteria',
			met: total > 0 && gate.unmetCriteria.length === 0,
			why: `${gate.criteriaMet} of ${total} met${parkedNote}`
		},
		Tasks: {
			name: 'Tasks',
			met: gate.inFlight.length === 0,
			why: gate.inFlight.length
				? `${gate.inFlight.length} blocked or in progress`
				: `none blocked or in progress${tasksParked}`
		}
	};
}

export interface ReadinessRow extends Gate {
	live: boolean;
}

export function readiness(plan: Plan, gate: PhaseGate): ReadinessRow[] {
	const live = liveGates(gate);
	// With nothing written yet, the seven gates, all unmet: no evidence is never green.
	const rows: Gate[] = plan.readiness?.length
		? plan.readiness
		: GATE_NAMES.map((name) => ({ name, met: false, why: 'not enough data' }));
	return rows.map((g) =>
		g.name in live ? { ...live[g.name as keyof typeof live], live: true } : { ...g, live: false }
	);
}

// --- the board -----------------------------------------------------------------------

export function sortCards(tasks: TaskState[]): TaskState[] {
	return [...tasks].sort(
		(a, b) =>
			PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
			a.phase - b.phase ||
			byTitle(a.epic, b.epic)
	);
}

export function boardColumns(tasks: Iterable<TaskState>): Record<Status, TaskState[]> {
	const columns = Object.fromEntries(STATUSES.map((st) => [st, [] as TaskState[]])) as Record<
		Status,
		TaskState[]
	>;
	for (const t of tasks) columns[t.status].push(t);
	for (const st of STATUSES) columns[st] = sortCards(columns[st]);
	return columns;
}

/** Open means neither done nor parked: a card in the Done column is not open work. */
export const isOpen = (t: TaskState) => t.status !== 'done' && !t.parked;

export function sidebarCounts(plan: Plan, board: Board, index: Map<string, TaskState>) {
	const current = effectivePhase(plan, board);
	return {
		board: [...index.values()].filter(isOpen).length,
		specs: plan.epics.filter((e) => e.phase === current).length,
		team: board.assignees.length,
		// No count, ever: it would read as a problem count that changes meaning.
		status: null
	};
}

/** Percentage of a phase's required tasks done; parked work leaves the denominator. */
export function phaseProgress(index: Map<string, TaskState>, phase: number): number {
	const tasks = [...index.values()].filter((t) => t.phase === phase);
	const required = tasks.filter((t) => !t.parked).length;
	if (required === 0) return 0;
	return Math.round((tasks.filter((t) => t.done).length * 100) / required);
}

// --- colours, references, durations, sprints -----------------------------------------

export interface EpicColour {
	hue: number;
	shade: number;
}

export function epicColours(plan: Plan): Map<string, EpicColour> {
	const out = new Map<string, EpicColour>();
	const seen = new Map<number, number>();
	const sorted = [...plan.epics].sort((a, b) => a.phase - b.phase || byTitle(a.title, b.title));
	for (const epic of sorted) {
		const n = seen.get(epic.phase) ?? 0;
		out.set(epic.title, {
			hue: PHASE_HUES[((epic.phase % 4) + 4) % 4],
			shade: Math.min(n, SHADE_CAP) * SHADE_STEP
		});
		seen.set(epic.phase, n + 1);
	}
	return out;
}

/** CSS custom properties for an epic's colour; management.css turns them into hsl(). */
export function epicStyle(colour: EpicColour | undefined): string {
	const c = colour ?? { hue: PHASE_HUES[0], shade: 0 };
	return `--epic-h: ${c.hue}; --epic-shade: ${c.shade};`;
}

/** FNV-1a, 32-bit, over UTF-16 code units: the same warning keeps the same reference. */
export function attentionRef(title: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < title.length; i++) {
		h = Math.imul(h ^ title.charCodeAt(i), 0x01000193) >>> 0;
	}
	return `ATT-${h.toString(16).toUpperCase().padStart(8, '0').slice(0, 6)}`;
}

export function humanDuration(minutes: number | null | undefined): string {
	if (minutes === null || minutes === undefined) return '—';
	const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
	if (minutes < 60) return `${minutes}m`;
	if (minutes < 24 * 60) return `${one(minutes / 60)}h`;
	return `${one(minutes / (24 * 60))}d`;
}

export function actualMinutes(board: Board, key: string): number | null {
	const entries = board.timeEntries.filter((e) => norm(e.task_id) === norm(key));
	return entries.length ? entries.reduce((sum, e) => sum + e.minutes, 0) : null;
}

export type SprintState = 'planned' | 'active' | 'closed';

/** Derived from the dates, never stored. Both ends are inclusive. */
export function sprintStatus(sprint: SprintRow, today: string): SprintState {
	if (today < sprint.starts_on) return 'planned';
	if (today > sprint.ends_on) return 'closed';
	return 'active';
}

/** One pill per phase group, chosen by where it sits against the effective phase. */
export function phasePill(
	phase: PlanPhase,
	current: number,
	roadmapPhase: number
): { label: string; tone: 'warn' | 'ok' | 'accent' | 'muted' } {
	if (phase.status === 'verified') return { label: 'verified · not shipped', tone: 'warn' };
	if (phase.n < current) {
		const pending = phase.n >= roadmapPhase;
		return { label: pending ? 'advanced past, roadmap pending' : 'advanced past', tone: 'ok' };
	}
	if (phase.n === current) return { label: 'current', tone: 'accent' };
	return { label: phase.status, tone: 'muted' };
}

// --- words --------------------------------------------------------------------------

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const criteria = (n: number) => `${n} exit criteri${n === 1 ? 'on' : 'a'}`;
export const points = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;

/** Whether text matches a search, case-insensitively, across every field joined. */
export function matches(query: string, ...fields: Array<string | null | undefined>): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return fields.filter(Boolean).join(' ').toLowerCase().includes(q);
}

// --- the client: two reads and seventeen writes ---------------------------------------

export class WriteFailed extends Error {}

/** Every write posts, and only on success does the caller re-read both stores. */
export function createClient(base: string) {
	async function post<T = Record<string, unknown>>(op: string, payload: object): Promise<T> {
		const response = await fetch(`${base}/api/${op}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new WriteFailed(body?.error ?? `The server refused the write (${response.status}).`);
		}
		return body as T;
	}

	return {
		setPoints: (taskId: string, points: number | null, notes?: string | null) =>
			post('task', { taskId, points, ...(notes === undefined ? {} : { notes }) }),
		setEstimate: (taskId: string, minutes: number | null) => post('estimate', { taskId, minutes }),
		logTime: (taskId: string, minutes: number, note?: string) =>
			post('time', { taskId, minutes, note }),
		addAssignee: (name: string, handle?: string) => post('assignee', { name, handle }),
		assign: (taskId: string, assigneeId: number | null) => post('assign', { taskId, assigneeId }),
		createAuthored: (title: string, epic: string, description?: string, priority?: Priority) =>
			post<{ taskId: string }>('authored', { title, epic, description, priority }),
		deleteAuthored: (taskId: string) => post('authored/delete', { taskId }),
		setAuthoredStatus: (taskId: string, status: Status) =>
			post('authored/status', { taskId, status }),
		/** null clears the override, so the task follows the plan again. */
		setStatus: (taskId: string, status: Status | null) => post('status', { taskId, status }),
		/** null reverts to the phase-derived priority. */
		setPriority: (taskId: string, priority: Priority | null) =>
			post('priority', { taskId, priority }),
		attachPr: (taskId: string, url: string) => post('pr', { taskId, url }),
		createSprint: (name: string, startsOn: string, endsOn: string, goal?: string) =>
			post('sprint', { name, startsOn, endsOn, goal }),
		deleteSprint: (sprintId: number) => post('sprint/delete', { sprintId }),
		setTaskSprint: (taskId: string, sprintId: number | null) =>
			post('task/sprint', { taskId, sprintId }),
		parkCriterion: (phase: number, text: string, parked: boolean) =>
			post('criterion/park', { phase, text, parked }),
		advancePhase: (phase: number, eligible: boolean, force: boolean, leftUnfinished?: string) =>
			post<{ forced: boolean }>('phase/advance', { phase, eligible, force, leftUnfinished }),
		withdrawAdvance: (phase: number) => post('phase/advance/withdraw', { phase })
	};
}

export type Client = ReturnType<typeof createClient>;
