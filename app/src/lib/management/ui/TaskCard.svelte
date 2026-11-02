<script lang="ts">
	import {
		epicStyle,
		humanDuration,
		points,
		type AssigneeRow,
		type EpicColour,
		type TaskState
	} from '../api.ts';

	/*
	 * A list item containing a full-bleed button under the content: a button inside a button is
	 * invalid, and the assign control is a real control above it. Draggable, always.
	 */
	let {
		task,
		colour,
		assignees,
		estimate,
		actual,
		onopen,
		onassign,
		ondragstart,
		ondragend
	}: {
		task: TaskState;
		colour: EpicColour | undefined;
		assignees: AssigneeRow[];
		estimate: number | null;
		actual: number | null;
		onopen: (key: string) => void;
		onassign: (task: TaskState) => void;
		ondragstart: (key: string, event: DragEvent) => void;
		ondragend: () => void;
	} = $props();

	const initials = (name: string) =>
		name
			.split(/\s+/)
			.slice(0, 2)
			.map((word) => word[0]?.toUpperCase() ?? '')
			.join('');

	function names(list: AssigneeRow[]): string {
		const all = list.map((a) => a.name);
		return all.length < 2 ? (all[0] ?? '') : `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`;
	}

	const over = $derived(estimate !== null && actual !== null && actual > estimate);
</script>

<li
	class="task epic-c"
	style={epicStyle(colour)}
	draggable="true"
	ondragstart={(event) => ondragstart(task.key, event)}
	{ondragend}
>
	<button type="button" class="open" onclick={() => onopen(task.key)}>
		<span class="vh">Open {task.title}</span>
	</button>

	<div class="head">
		<span class="ref">{task.id ?? 'no id'}</span>
		<span class="prio">{task.priority}</span>
		{#if task.priorityOverridden}
			<span title="Priority set by a person" aria-label="Priority set by a person">•</span>
		{/if}
		{#if task.parked}
			<span class="pill parked" title="Set aside; excluded from the phase requirement">parked</span>
		{:else if task.overridden}
			<span class="pill" title="Status set by a person, not the plan">moved</span>
		{/if}
	</div>

	<div class="title">{task.title}</div>
	{#if task.description}
		<div class="desc">{task.description}</div>
	{/if}
	<div><span class="chip">{task.epic}</span></div>

	<div class="foot">
		{#if assignees.length}
			<span class="avatars" role="img" aria-label={`Assigned to ${names(assignees)}`}>
				{#each assignees.slice(0, 3) as person (person.id)}
					<span class="avatar" aria-hidden="true">{initials(person.name)}</span>
				{/each}
				{#if assignees.length > 3}
					<span class="avatar num" aria-hidden="true">+{assignees.length - 3}</span>
				{/if}
			</span>
		{:else}
			<button type="button" class="assign" disabled={!task.id} onclick={() => onassign(task)}>
				<span class="vh">Assign {task.title}</span>
			</button>
		{/if}
		{#if task.points !== null}
			<span class="pts num meta">{points(task.points)}</span>
		{/if}
		{#if estimate !== null || actual !== null}
			<span class="num meta"
				>{humanDuration(estimate)} /
				<span class:over-estimate={over}>{humanDuration(actual)}</span></span
			>
		{/if}
		{#if task.unverified}
			<span class="pill parked">done · unverified</span>
		{:else if task.unconfirmed}
			<span class="pill parked">done · unconfirmed</span>
		{/if}
	</div>
</li>
