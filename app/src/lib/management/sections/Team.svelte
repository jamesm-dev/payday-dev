<script lang="ts">
	import {
		epicStyle,
		isOpen,
		matches,
		type Board,
		type Client,
		type EpicColour,
		type TaskState
	} from '../api.ts';
	import SearchBox from '../ui/SearchBox.svelte';

	/*
	 * Who is on what. Load is points across a task count, never a percentage of an invented
	 * capacity; unpointed open work is counted and named, because it makes the load wrong.
	 */
	let {
		board,
		index,
		colours,
		client,
		run,
		query,
		setQuery,
		openTask
	}: {
		board: Board;
		index: Map<string, TaskState>;
		colours: Map<string, EpicColour>;
		client: Client;
		run: (action: () => Promise<unknown>) => Promise<string | null>;
		query: Record<string, string>;
		setQuery: (key: string, value: string) => void;
		openTask: (key: string) => void;
	} = $props();

	const tq = $derived(query.tq ?? '');
	const s = (n: number) => (n === 1 ? '' : 's');

	const members = $derived(
		board.assignees.map((person) => {
			const tasks = board.taskAssignees
				.filter((r) => r.assignee_id === person.id)
				.map((r) => index.get(r.task_id) ?? index.get(r.task_id.toUpperCase()))
				.filter((t) => t !== undefined);
			const open = tasks.filter(isOpen);
			return {
				person,
				tasks,
				open: open.length,
				// Set aside is not pending: parked work leaves the load but stays in the list.
				load: open.reduce((sum, t) => sum + (t.points ?? 0), 0),
				unpointed: open.filter((t) => t.points === null).length,
				// Credited on done, whole, to each assignee: splitting invents precision.
				completed: tasks.filter((t) => t.done).reduce((sum, t) => sum + (t.points ?? 0), 0)
			};
		})
	);
	const visible = $derived(
		members.filter((m) =>
			matches(
				tq,
				m.person.name,
				m.person.handle,
				...m.tasks.flatMap((t) => [t.id, t.title, t.epic])
			)
		)
	);

	let name = $state('');
	let handle = $state('');
	let refusal = $state<string | null>(null);

	async function add(event: SubmitEvent) {
		event.preventDefault();
		refusal = await run(() => client.addAssignee(name, handle || undefined));
		if (!refusal) {
			name = '';
			handle = '';
		}
	}
</script>

<section>
	<h2>Team</h2>
	<p class="lede">Who is on what. Names live in board.db, never in .idea/.</p>
	{#if board.assignees.length === 0}
		<p class="note">
			No one has been added yet. This is a single-person project by design — SPECS.md names one user
			and rules out accounts entirely — so this section may stay empty, and that is a correct result
			rather than missing data.
		</p>
	{/if}
	<SearchBox
		value={tq}
		placeholder="Search people, tasks, epics, TSK-…"
		noun="people"
		shown={visible.length}
		total={members.length}
		onsearch={(value) => setQuery('tq', value)}
	/>

	<div class="columns">
		{#each visible as m (m.person.id)}
			<article class="card member list">
				<div>
					<strong>{m.person.name}</strong>
					{#if m.person.handle}<span class="ref">@{m.person.handle}</span>{/if}
				</div>
				<div class="row">
					<span class="load">{m.load} pts</span>
					<span class="meta num">across {m.open} open task{s(m.open)}</span>
				</div>
				<div class="meta num">
					{m.completed} pts completed · {m.tasks.length} task{s(m.tasks.length)} assigned
				</div>
				{#if m.unpointed}
					<div class="warn num">
						{m.unpointed} open task{s(m.unpointed)} unpointed — the load above is short by an unknown
						amount
					</div>
				{/if}
				{#if m.tasks.length}
					<ul class="list">
						{#each m.tasks as task (task.key)}
							<li class="row">
								<button type="button" class="copy ref" onclick={() => openTask(task.key)}
									>{task.id ?? 'no id'}</button
								>
								<span>{task.title}</span>
								<span class="chip epic-c" style={epicStyle(colours.get(task.epic))}
									>{task.epic}</span
								>
								<!-- Named where the gap distorts a number: this person's load. -->
								{#if isOpen(task) && task.points === null}
									<span class="pill parked">unpointed</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">Nothing assigned.</p>
				{/if}
			</article>
		{/each}
	</div>

	<form class="card row" onsubmit={add}>
		<label>Name <input bind:value={name} required /></label>
		<label>GitHub handle (optional) <input bind:value={handle} /></label>
		<button type="submit" class="action">Add person</button>
		{#if refusal}<span class="fail">{refusal}</span>{/if}
	</form>
</section>
