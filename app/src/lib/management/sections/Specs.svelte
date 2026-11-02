<script lang="ts">
	import {
		advancePending,
		effectivePhase,
		epicStyle,
		matches,
		phasePill,
		points,
		type Board,
		type EpicColour,
		type Plan,
		type TaskState
	} from '../api.ts';
	import SearchBox from '../ui/SearchBox.svelte';

	/* Entirely read-only: the plan's face on the dashboard. Changing an epic is /shape. */
	let {
		plan,
		board,
		index,
		colours,
		query,
		setQuery
	}: {
		plan: Plan;
		board: Board;
		index: Map<string, TaskState>;
		colours: Map<string, EpicColour>;
		query: Record<string, string>;
		setQuery: (key: string, value: string) => void;
	} = $props();

	const sq = $derived(query.sq ?? '');
	const current = $derived(effectivePhase(plan, board));
	const pending = $derived(advancePending(plan, board));
	const tasksOf = (title: string) => [...index.values()].filter((t) => t.epic === title);

	const visible = $derived(
		plan.epics.filter((e) =>
			matches(
				sq,
				e.title,
				e.theme,
				...(e.sources ?? []),
				...tasksOf(e.title).flatMap((t) => [t.id, t.title])
			)
		)
	);
</script>

<section>
	<h2>Specs</h2>
	<p class="lede">
		Every epic, derived from .idea/epics/. Structure is never editable here — changing the plan is
		/shape. Counts read done / still required: parked work leaves the denominator, and is shown
		separately rather than vanishing.
	</p>
	<SearchBox
		value={sq}
		placeholder="Search epics, tasks, themes, TSK-…"
		noun="epics"
		shown={visible.length}
		total={plan.epics.length}
		onsearch={(value) => setQuery('sq', value)}
	/>
	{#if sq && visible.length === 0}
		<p class="empty">Nothing matches that search.</p>
	{/if}

	{#each plan.phases as phase (phase.n)}
		{@const pill = phasePill(phase, current, plan.project.currentPhase)}
		{@const epics = plan.epics.filter((e) => e.phase === phase.n)}
		<h3>
			Phase {phase.n} — {phase.name}
			<span
				class="pill"
				class:done={pill.tone === 'ok'}
				class:parked={pill.tone === 'warn'}
				class:current={pill.tone === 'accent'}
				title={pill.label.includes('pending')
					? 'Advanced here; the roadmap catches up on the next /setup'
					: undefined}
				>{pending && phase.n === current ? `${pill.label} · roadmap pending` : pill.label}</span
			>
		</h3>
		<p class="lede">{phase.goal}</p>
		{#if epics.length === 0}
			<p class="empty">No epics in this phase.</p>
		{/if}
		{#each epics.filter((e) => visible.includes(e)) as epic (epic.title)}
			{@const tasks = tasksOf(epic.title)}
			{@const parked = tasks.filter((t) => t.parked).length}
			<details
				class="epic epic-c"
				style={epicStyle(colours.get(epic.title))}
				open={phase.n === current}
			>
				<summary>
					<span class="epic-title">{epic.title}</span>
					<span class="pill num">{tasks.filter((t) => t.done).length}/{tasks.length - parked}</span>
					{#if parked}<span class="pill parked num">{parked} parked</span>{/if}
					<span class="pill">{epic.status}</span>
				</summary>
				<p class="meta">
					Theme: {epic.theme || '—'}{#if epic.sources?.length}&nbsp;· From: {epic.sources.join(
							', '
						)}{/if}
				</p>
				<ul class="crit">
					{#each tasks as task (task.key)}
						<li class:parked-row={task.parked}>
							{#if task.done}<span class="mark ok" aria-hidden="true">✓</span>
							{:else if task.parked}<span class="mark warn" aria-hidden="true">⏸</span>
							{:else}<span class="mark empty" aria-hidden="true">·</span>{/if}
							<span class="body">
								<span class:empty={!task.done && !task.parked}>{task.title}</span>
								{#if task.done && !task.authored && task.description}
									<span class="meta">{task.description}</span>
								{/if}
							</span>
							<span class="tags">
								<span class="ref">{task.id ?? 'no id'}</span>
								{#if task.points !== null}<span class="pill num">{points(task.points)}</span>{/if}
							</span>
						</li>
					{/each}
				</ul>
			</details>
		{/each}
	{/each}
</section>
