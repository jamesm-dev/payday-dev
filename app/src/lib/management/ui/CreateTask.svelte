<script lang="ts">
	import { PRIORITIES, type Client, type Plan, type Priority } from '../api.ts';
	import Drawer from './Drawer.svelte';

	/*
	 * Creating an ad-hoc task: one button on the board opens this, in the same drawer the task
	 * drawer uses. Title, epic and points are all required — a task belonging to nothing cannot be
	 * placed, and one with no points makes a member's load wrong by an unknown amount.
	 */
	let {
		plan,
		client,
		run,
		onclose
	}: {
		plan: Plan;
		client: Client;
		run: (action: () => Promise<unknown>) => Promise<string | null>;
		onclose: () => void;
	} = $props();

	let title = $state('');
	let epic = $state('');
	let points = $state('3');
	let priority = $state<Priority>('normal');
	let description = $state('');
	let refusal = $state<string | null>(null);

	const epics = $derived([...plan.epics].sort((a, b) => a.phase - b.phase));

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!title.trim()) return (refusal = 'A task needs a title.');
		if (!epic) return (refusal = 'Pick the epic this belongs to.');
		if (points.trim() === '' || !Number.isInteger(Number(points)) || Number(points) < 0) {
			return (refusal = 'Give it points — capacity is the sum of points on open tasks.');
		}
		// Written with an ADH- id, then its points, then both stores are re-read.
		refusal = await run(async () => {
			const { taskId } = await client.createAuthored(title, epic, description, priority);
			await client.setPoints(taskId, Number(points));
		});
		if (!refusal) onclose();
	}
</script>

<Drawer label="Create task" {onclose}>
	<p class="help">
		This is an ad-hoc task. It lives in board.db only and stays invisible to /shape and /setup until
		promoted, so it is never mistaken for the agreed plan.
	</p>
	<p class="live fail" aria-live="polite">{refusal ?? ''}</p>
	<form class="createform list" onsubmit={submit}>
		<label class="field">Title <input bind:value={title} placeholder="What needs doing" /></label>
		<label class="field"
			>Epic
			<select bind:value={epic}>
				<option value="" disabled>Choose an epic…</option>
				{#each epics as e (e.title)}<option value={e.title}>Phase {e.phase} — {e.title}</option
					>{/each}
			</select>
		</label>
		<label class="field">Points <input type="number" min="0" bind:value={points} /></label>
		<label class="field"
			>Priority
			<select bind:value={priority}>
				{#each PRIORITIES as p (p)}<option value={p}>{p}</option>{/each}
			</select>
		</label>
		<label class="field"
			>Description <textarea bind:value={description} placeholder="Optional" rows="2"
			></textarea></label
		>
		<div class="row">
			<button type="submit" class="create">Create task</button>
			<button type="button" class="action" onclick={onclose}>Cancel</button>
		</div>
	</form>
</Drawer>
