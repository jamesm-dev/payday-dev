<script lang="ts">
	import {
		actualMinutes,
		boardColumns,
		COLUMNS,
		matches,
		type Board,
		type Client,
		type EpicColour,
		type Plan,
		type Status,
		type TaskState
	} from '../api.ts';
	import CreateTask from '../ui/CreateTask.svelte';
	import TaskCard from '../ui/TaskCard.svelte';

	let {
		plan,
		board,
		index,
		colours,
		client,
		run,
		openTask,
		query,
		setQuery
	}: {
		plan: Plan;
		board: Board;
		index: Map<string, TaskState>;
		colours: Map<string, EpicColour>;
		client: Client;
		run: (action: () => Promise<unknown>) => Promise<string | null>;
		openTask: (key: string) => void;
		query: Record<string, string>;
		setQuery: (key: string, value: string) => void;
	} = $props();

	const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();
	const assigneesOf = (key: string) =>
		board.taskAssignees
			.filter((r) => same(r.task_id, key))
			.map((r) => board.assignees.find((a) => a.id === r.assignee_id))
			.filter((a) => a !== undefined);
	const metaOf = (key: string) => board.meta.find((m) => same(m.task_id, key));

	const all = $derived([...index.values()]);
	const q = $derived(query.q ?? '');
	const epic = $derived(query.epic ?? '');
	const assignee = $derived(query.assignee ?? '');
	const sprint = $derived(query.sprint ?? '');
	const origin = $derived(query.origin ?? '');

	const shown = $derived(
		all.filter((t) => {
			const people = assigneesOf(t.key);
			const sprintId = metaOf(t.key)?.sprint_id ?? null;
			return (
				matches(q, t.title, t.description, t.epic, t.id, ...people.map((p) => p.name)) &&
				(!epic || t.epic === epic) &&
				(!assignee ||
					(assignee === 'unassigned'
						? people.length === 0
						: people.some((p) => String(p.id) === assignee))) &&
				(!sprint || (sprint === 'none' ? sprintId === null : String(sprintId) === sprint)) &&
				(!origin || (origin === 'authored' ? t.authored : !t.authored))
			);
		})
	);
	const columns = $derived(boardColumns(shown));
	const narrowing = $derived([q, epic, assignee, sprint, origin].filter(Boolean).length);

	function clearFilters() {
		for (const key of ['q', 'epic', 'assignee', 'sprint', 'origin']) setQuery(key, '');
	}

	// A drop announces through the polite live region; a refusal renders inline.
	let announcement = $state('');
	let refusal = $state<string | null>(null);
	let dragging = $state<string | null>(null);
	let over = $state<Status | null>(null);

	async function move(key: string, status: Status) {
		const task = index.get(key);
		const id = task?.id;
		if (!task || !id || task.status === status) return;
		const label = COLUMNS.find((c) => c.status === status)?.label ?? status;
		refusal = await run(() =>
			task.authored
				? client.setAuthoredStatus(id, status)
				: // Back to its derived column clears the override rather than writing that status.
					client.setStatus(id, status === task.planStatus ? null : status)
		);
		if (!refusal) announcement = `${task.title} moved to ${label}`;
	}

	async function assignFirst(task: TaskState) {
		const id = task.id;
		if (!id) return;
		const first = board.assignees[0];
		if (!first) {
			refusal = 'No people yet — add someone on the Team page first.';
			return;
		}
		refusal = await run(() => client.assign(id, first.id));
	}

	let creating = $state(false);
</script>

<section>
	<h2>Board</h2>
	<p class="lede">
		{all.length} tasks across {plan.epics.length} epics. Drag a card to move it — that records what you
		say is happening in board.db and never edits the plan.
	</p>
	<p class="note">
		A commit is evidence that work happened; only a verified exit criterion makes a derived task
		done. A card dropped into Done without one shows done · unverified and is not counted in
		readiness.
	</p>
	<p class="vh" aria-live="polite">{announcement}</p>
	{#if refusal}
		<p class="fail" role="alert">{refusal}</p>
	{/if}

	<div class="toolbar">
		<div class="filters">
			<label>
				<span class="vh">Search tasks</span>
				<input
					type="search"
					placeholder="Search title, epic, assignee, TSK-…"
					value={q}
					oninput={(event) => setQuery('q', event.currentTarget.value)}
				/>
			</label>
			<label>
				Epic
				<select value={epic} onchange={(event) => setQuery('epic', event.currentTarget.value)}>
					<option value="">All</option>
					{#each plan.epics as e (e.title)}<option value={e.title}>{e.title}</option>{/each}
				</select>
			</label>
			<label>
				Assignee
				<select
					value={assignee}
					onchange={(event) => setQuery('assignee', event.currentTarget.value)}
				>
					<option value="">Everyone</option>
					<option value="unassigned">Unassigned</option>
					{#each board.assignees as person (person.id)}
						<option value={String(person.id)}>{person.name}</option>
					{/each}
				</select>
			</label>
			{#if board.sprints.length}
				<label>
					Sprint
					<select
						value={sprint}
						onchange={(event) => setQuery('sprint', event.currentTarget.value)}
					>
						<option value="">All</option>
						<option value="none">No sprint</option>
						{#each board.sprints as s (s.id)}<option value={String(s.id)}>{s.name}</option>{/each}
					</select>
				</label>
			{/if}
			<label>
				Origin
				<select value={origin} onchange={(event) => setQuery('origin', event.currentTarget.value)}>
					<option value="">All</option>
					<option value="derived">From the plan</option>
					<option value="authored">Ad-hoc</option>
				</select>
			</label>
			{#if narrowing}
				<button type="button" class="clear num" onclick={clearFilters}>
					Clear {narrowing} filter{narrowing === 1 ? '' : 's'} · showing {shown.length} of {all.length}
				</button>
			{/if}
		</div>
		<button type="button" class="create" onclick={() => (creating = true)}>Create task</button>
	</div>

	<div class="board-columns">
		{#each COLUMNS as column (column.status)}
			<section
				class="col"
				class:over={over === column.status}
				aria-label={column.label}
				ondragover={(event) => {
					if (!dragging) return;
					event.preventDefault();
					over = column.status;
				}}
				ondragleave={() => {
					if (over === column.status) over = null;
				}}
				ondrop={(event) => {
					event.preventDefault();
					const key = dragging ?? event.dataTransfer?.getData('text/plain');
					over = null;
					dragging = null;
					if (key) void move(key, column.status);
				}}
			>
				<h3 class="num">{column.label} — {columns[column.status].length}</h3>
				<ul class="stack">
					{#each columns[column.status] as task (task.key)}
						<TaskCard
							{task}
							colour={colours.get(task.epic)}
							assignees={assigneesOf(task.key)}
							estimate={metaOf(task.key)?.estimate_min ?? null}
							actual={actualMinutes(board, task.key)}
							onopen={openTask}
							onassign={assignFirst}
							ondragstart={(key, event) => {
								dragging = key;
								event.dataTransfer?.setData('text/plain', key);
							}}
							ondragend={() => {
								dragging = null;
								over = null;
							}}
						/>
					{:else}
						<li class="empty">Nothing here.</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</section>

{#if creating}
	<CreateTask {plan} {client} {run} onclose={() => (creating = false)} />
{/if}
