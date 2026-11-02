<script lang="ts">
	import { untrack } from 'svelte';
	import {
		actualMinutes,
		COLUMNS,
		epicStyle,
		humanDuration,
		PRIORITIES,
		type Board,
		type Client,
		type EpicColour,
		type Priority,
		type Status,
		type TaskState
	} from '../api.ts';
	import Drawer from './Drawer.svelte';

	let {
		taskKey,
		board,
		index,
		colours,
		client,
		run,
		onclose
	}: {
		taskKey: string;
		board: Board;
		index: Map<string, TaskState>;
		colours: Map<string, EpicColour>;
		client: Client;
		run: (action: () => Promise<unknown>) => Promise<string | null>;
		onclose: () => void;
	} = $props();

	const task = $derived(index.get(taskKey)!);
	const id = $derived(task.id);
	const same = (a: string) => a.toUpperCase() === taskKey.toUpperCase();
	const meta = $derived(board.meta.find((m) => same(m.task_id)));
	const assigneeId = $derived(
		board.taskAssignees.find((r) => same(r.task_id))?.assignee_id ?? null
	);
	const entries = $derived(board.timeEntries.filter((e) => same(e.task_id)));
	const actual = $derived(actualMinutes(board, taskKey));
	const runs = $derived(
		board.testRuns.filter(
			(r) => (r.task_id && same(r.task_id)) || (!r.task_id && r.epic === task.epic)
		)
	);
	const prs = $derived(board.prs.filter((p) => same(p.task_id)));
	const date = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

	// One polite live region for every write: a brief confirmation, or the server's own sentence.
	let live = $state<{ tone: 'ok' | 'fail'; text: string } | null>(null);
	let clearing: ReturnType<typeof setTimeout> | undefined;
	function say(text: string, tone: 'ok' | 'fail') {
		live = { tone, text };
		clearTimeout(clearing);
		if (tone === 'ok') clearing = setTimeout(() => (live = null), 1600);
	}
	async function save(action: () => Promise<unknown>, confirmation: string): Promise<boolean> {
		const failure = await run(action);
		say(failure ?? confirmation, failure ? 'fail' : 'ok');
		return !failure;
	}

	let copied = $state(false);
	async function copyReference() {
		try {
			await navigator.clipboard.writeText(id ?? '');
			copied = true;
			setTimeout(() => (copied = false), 1400);
		} catch {
			say('Could not copy to the clipboard.', 'fail');
		}
	}

	function move(status: Status) {
		if (!id) return;
		if (task.authored) void save(() => client.setAuthoredStatus(id, status), 'Moved');
		else if (status === task.planStatus) {
			// Back to where the plan puts it: clear the override, never write the opposite status.
			void save(() => client.setStatus(id, null), 'Following the plan again');
		} else void save(() => client.setStatus(id, status), 'Moved');
	}

	// Seeded once and then the person's: a failed write, or a re-read, never discards what was typed.
	let pointsInput = $state(untrack(() => String(index.get(taskKey)?.points ?? '')));
	let estimateInput = $state(
		untrack(() => String(board.meta.find((m) => same(m.task_id))?.estimate_min ?? ''))
	);
	let minutesInput = $state('');
	let noteInput = $state('');
	let prInput = $state('');

	const toAmount = (value: string) => (value.trim() === '' ? null : Number(value));
</script>

<Drawer label={task.title} {onclose}>
	<p
		class="live"
		class:ok={live?.tone === 'ok'}
		class:fail={live?.tone === 'fail'}
		aria-live="polite"
	>
		{live?.text ?? ''}
	</p>

	<dl>
		<div>
			<dt><h3>Reference</h3></dt>
			<dd>
				{#if id}
					<button type="button" class="copy" onclick={copyReference}
						>{id}<span class="meta">{copied ? ' copied' : ' copy'}</span></button
					>
				{:else}
					<span class="meta"
						>no id — /setup found no reference, so nothing can be recorded here</span
					>
				{/if}
			</dd>
		</div>
		<div>
			<dt><h3>Epic</h3></dt>
			<dd>
				<span class="chip epic-c" style={epicStyle(colours.get(task.epic))}>{task.epic}</span>
				· Phase {task.phase}
				<!-- Text, not a link: .idea/ is not served, so an href here would be dead. -->
				<br /><code class="meta">../.idea/epics/{task.epic}.md</code>
			</dd>
		</div>
		{#if !task.authored && task.description}
			<div>
				<dt><h3>Note from /setup</h3></dt>
				<dd>{task.description}</dd>
			</div>
		{/if}
	</dl>

	<section>
		<h3>Status</h3>
		<label>
			<span class="vh">Move to</span>
			<select
				value={task.status}
				disabled={!id}
				onchange={(event) => move(event.currentTarget.value as Status)}
			>
				{#each COLUMNS as column (column.status)}
					<option value={column.status}>{column.label}</option>
				{/each}
			</select>
		</label>
		{#if !task.authored}
			{#if task.explicit?.source === 'human'}
				<p class="help">Set by a person on {date(task.explicit.set_at)}.</p>
				<button
					type="button"
					class="linkish"
					onclick={() => id && save(() => client.setStatus(id, null), 'Following the plan again')}
					>Clear override</button
				>
			{:else}
				<p class="help">
					Derived from the plan. Moving it here records what you say is happening; it never edits
					the roadmap.
				</p>
			{/if}
			{#if task.unverified}
				<p class="help warn">
					Done was claimed here, but no exit criterion verifies it yet. It stays unverified and is
					not counted in readiness until /setup checks it.
				</p>
			{:else if task.unconfirmed}
				<p class="help warn">done · unconfirmed — {task.explicit?.note}</p>
			{/if}
		{/if}
	</section>

	<section>
		<h3>Priority</h3>
		<label>
			<span class="vh">Priority</span>
			<select
				value={task.priority}
				disabled={!id}
				onchange={(event) =>
					id &&
					save(() => client.setPriority(id, event.currentTarget.value as Priority), 'Priority set')}
			>
				{#each PRIORITIES as priority (priority)}
					<option value={priority}>{priority}</option>
				{/each}
			</select>
		</label>
		{#if task.priorityOverridden}
			<p class="help">Set by a person, overriding what the phase implies.</p>
			<button
				type="button"
				class="linkish"
				onclick={() =>
					id && save(() => client.setPriority(id, null), 'Back to the derived priority')}
				>Clear override</button
			>
		{:else}
			<p class="help">Derived from the phase this task sits in. Cards sort by it.</p>
		{/if}
	</section>

	<section>
		<h3>Assignee</h3>
		{#if board.assignees.length}
			<label>
				<span class="vh">Assignee</span>
				<select
					value={assigneeId === null ? '' : String(assigneeId)}
					disabled={!id}
					onchange={(event) => {
						const value = event.currentTarget.value;
						if (id) save(() => client.assign(id, value ? Number(value) : null), 'Assigned');
					}}
				>
					<option value="">Unassigned</option>
					{#each board.assignees as person (person.id)}
						<option value={String(person.id)}>{person.name}</option>
					{/each}
				</select>
			</label>
		{:else}
			<p class="help">Add people on the Team page first.</p>
		{/if}
	</section>

	<section>
		<h3>Effort</h3>
		<div class="row">
			<label>
				Points
				<input
					type="number"
					min="0"
					inputmode="numeric"
					bind:value={pointsInput}
					disabled={!id}
					onblur={() => {
						const next = toAmount(pointsInput);
						if (id && next !== task.points) save(() => client.setPoints(id, next), 'Points saved');
					}}
				/>
			</label>
			<label>
				Estimate (min)
				<input
					type="number"
					min="0"
					inputmode="numeric"
					bind:value={estimateInput}
					disabled={!id}
					onblur={() => {
						const next = toAmount(estimateInput);
						if (id && next !== (meta?.estimate_min ?? null)) {
							save(() => client.setEstimate(id, next), 'Estimate saved');
						}
					}}
				/>
			</label>
		</div>
		<p class="help">
			Points come from the acceptance criterion in .idea/. Editing here records an override in
			board.db; the plan's estimate is never rewritten.
		</p>
		{#if entries.length}
			<ul class="list num">
				{#each entries as entry (entry.id)}
					<li>
						{humanDuration(entry.minutes)}{entry.note ? ` · ${entry.note}` : ''}
						<span class="meta">· {date(entry.logged_at)}</span>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="help">
			Actual is the sum of logged entries — {humanDuration(actual)} — never a typed total that can disagree
			with its parts.
		</p>
		<form
			class="row"
			onsubmit={async (event) => {
				event.preventDefault();
				if (!id) return;
				const ok = await save(
					() => client.logTime(id, Number(minutesInput), noteInput || undefined),
					'Time logged'
				);
				if (ok) {
					minutesInput = '';
					noteInput = '';
				}
			}}
		>
			<label>
				Minutes to log
				<input type="number" min="1" inputmode="numeric" bind:value={minutesInput} disabled={!id} />
				<span>min</span>
			</label>
			<label>
				<span class="vh">Note</span>
				<input type="text" placeholder="Note (optional)" bind:value={noteInput} disabled={!id} />
			</label>
			<button type="submit" class="action" disabled={!id}>Log time</button>
		</form>
	</section>

	<section>
		<h3>Sprint</h3>
		{#if board.sprints.length}
			<label>
				<span class="vh">Sprint</span>
				<select
					value={meta?.sprint_id == null ? '' : String(meta.sprint_id)}
					disabled={!id}
					onchange={(event) => {
						const value = event.currentTarget.value;
						if (id)
							save(() => client.setTaskSprint(id, value ? Number(value) : null), 'Sprint set');
					}}
				>
					<option value="">No sprint</option>
					{#each board.sprints as sprint (sprint.id)}
						<option value={String(sprint.id)}>{sprint.name}</option>
					{/each}
				</select>
			</label>
		{:else}
			<p class="help">No sprints yet — create one on Status.</p>
		{/if}
	</section>

	<section>
		<h3>Test trail</h3>
		{#if runs.length}
			<ul class="list">
				{#each runs as testRun (testRun.id)}
					<li>
						<span
							class="pill"
							class:done={testRun.status === 'passed'}
							class:parked={testRun.status !== 'passed'}>{testRun.status}</span
						>
						{testRun.name}{testRun.task_id ? '' : ' · epic-level'}
						<span class="meta num"
							>· ran {date(testRun.ran_at)} · synced {date(testRun.synced_at)}</span
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">No test runs linked.</p>
		{/if}
	</section>

	{#if task.authored}
		<section>
			<h3>Remove</h3>
			<p class="help">
				This is an ad-hoc task, so it can be deleted. A derived task cannot — it comes from the
				plan, and removing it would mean editing .idea/.
			</p>
			<button
				type="button"
				class="action danger"
				onclick={async () => {
					if (id && (await save(() => client.deleteAuthored(id), 'Deleted'))) onclose();
				}}>Delete this task</button
			>
		</section>
	{/if}

	<section>
		<h3>Pull request</h3>
		{#if prs.length}
			<ul class="list">
				{#each prs as pr (pr.id)}
					<li>
						<a href={pr.url} rel="external noopener" target="_blank"
							>{pr.number ? `#${pr.number}` : pr.url}</a
						>
						<span class="pill">{pr.synced_at && pr.state ? pr.state : 'status unknown'}</span>
						<span class="meta num"
							>{pr.synced_at ? `synced ${date(pr.synced_at)}` : 'never synced'} · added {date(
								pr.added_at
							)}</span
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">None linked.</p>
		{/if}
		{#if board.pullRequests === null}
			<p class="help">
				State cannot refresh without the GitHub MCP, which is not configured — so an attached link
				reads status unknown rather than inventing one.
			</p>
		{/if}
		<form
			class="row"
			onsubmit={async (event) => {
				event.preventDefault();
				if (id && (await save(() => client.attachPr(id, prInput), 'Pull request attached'))) {
					prInput = '';
				}
			}}
		>
			<label>
				<span class="vh">Pull request URL</span>
				<input
					type="url"
					placeholder="https://github.com/…/pull/12"
					bind:value={prInput}
					disabled={!id}
				/>
			</label>
			<button type="submit" class="action" disabled={!id}>Attach</button>
		</form>
	</section>
</Drawer>
