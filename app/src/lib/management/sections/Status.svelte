<script lang="ts">
	import { untrack } from 'svelte';
	import {
		actualMinutes,
		advancePending,
		attentionRef,
		criteria,
		effectivePhase,
		epicStyle,
		lastPhase,
		phaseGate,
		phasePill,
		plural,
		points,
		readiness,
		readinessPhase,
		sprintStatus,
		type Board,
		type Client,
		type EpicColour,
		type Plan,
		type TaskState
	} from '../api.ts';

	/*
	 * How the work is going, what is in the way, and whether the phase can move on. Records and
	 * measures; never forecasts. Obstacles come before the score.
	 */
	let {
		plan,
		board,
		index,
		colours,
		client,
		run,
		today
	}: {
		plan: Plan;
		board: Board;
		index: Map<string, TaskState>;
		colours: Map<string, EpicColour>;
		client: Client;
		run: (action: () => Promise<unknown>) => Promise<string | null>;
		today: string;
	} = $props();

	const s = (n: number) => (n === 1 ? '' : 's');
	const date = (iso: string) => iso.slice(0, 10);
	const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

	const tasks = $derived([...index.values()]);
	const current = $derived(effectivePhase(plan, board));
	const roadmapPhase = $derived(plan.project.currentPhase);
	const pending = $derived(advancePending(plan, board));
	const last = $derived(lastPhase(plan));
	const gate = $derived(phaseGate(plan, board, index, current));
	const nextPhase = $derived(plan.phases.find((p) => p.n === current + 1));
	const currentPhase = $derived(plan.phases.find((p) => p.n === current));

	// --- tiles --------------------------------------------------------------------------------
	const done = $derived(tasks.filter((t) => t.done).length);
	const parkedCount = $derived(tasks.filter((t) => t.parked).length);
	const blocked = $derived(tasks.filter((t) => t.status === 'blocked').length);
	const estimated = $derived(
		tasks
			.filter((t) => t.done && t.id)
			.map((t) => ({
				estimate: board.meta.find((m) => m.task_id.toUpperCase() === t.key.toUpperCase())
					?.estimate_min,
				actual: actualMinutes(board, t.key)
			}))
			.filter((e) => e.estimate && e.actual)
	);
	const accuracy = $derived(
		estimated.length >= 10
			? (
					estimated.reduce((sum, e) => sum + (e.actual ?? 0), 0) /
					estimated.reduce((sum, e) => sum + (e.estimate ?? 0), 0)
				).toFixed(2)
			: null
	);

	// --- readiness ------------------------------------------------------------------------------
	const rPhase = $derived(readinessPhase(plan, board));
	const gates = $derived(readiness(plan, phaseGate(plan, board, index, rPhase)));
	const stale = $derived(gates.filter((g) => !g.live).map((g) => g.name));
	const listOf = (names: string[]) =>
		names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

	// --- attention --------------------------------------------------------------------------------
	let copiedRef = $state<string | null>(null);
	let copyFailed = $state(false);
	async function copyCommand(ref: string) {
		try {
			await navigator.clipboard.writeText(`/epic ${ref}`);
			copiedRef = ref;
			setTimeout(() => (copiedRef = null), 1400);
		} catch {
			copyFailed = true;
		}
	}

	// --- sprints ----------------------------------------------------------------------------------
	const sprintTasks = (id: number) =>
		tasks.filter((t) =>
			board.meta.some((m) => m.sprint_id === id && m.task_id.toUpperCase() === t.key.toUpperCase())
		);
	// The default name is a suggestion, seeded once; a person may rename it.
	let sprintName = $state(untrack(() => `Sprint ${board.sprints.length + 1}`));
	let startsOn = $state('');
	let endsOn = $state('');
	let goal = $state('');
	let sprintResult = $state<{ tone: 'ok' | 'fail'; text: string } | null>(null);
	let removeRefusal = $state<string | null>(null);

	async function createSprint(event: SubmitEvent) {
		event.preventDefault();
		const failure = await run(() => client.createSprint(sprintName, startsOn, endsOn, goal));
		sprintResult = failure
			? { tone: 'fail', text: failure }
			: { tone: 'ok', text: 'Sprint created.' };
		if (!failure) {
			sprintName = `Sprint ${board.sprints.length + 1}`;
			startsOn = endsOn = goal = '';
		}
	}

	// --- the advance panel --------------------------------------------------------------------------
	let confirming = $state(false);
	let advanceRefusal = $state<string | null>(null);
	const pendingAdvance = $derived(
		board.advances.filter((a) => a.consumed_at == null).sort((a, b) => b.phase - a.phase)[0]
	);
	const parkedCriteria = $derived(board.parkedCriteria.filter((c) => c.phase === current));

	async function advance(force: boolean) {
		advanceRefusal = await run(() =>
			client.advancePhase(current, gate.open, force && !gate.open, gate.leftUnfinished)
		);
		confirming = false;
	}
</script>

<section>
	<h2>Status</h2>
	<p class="lede">Derived from state.json, generated {plan.generatedAt}.</p>

	<div class="tiles">
		<article class="card tile">
			<div class="v">{done} / {tasks.length - parkedCount}</div>
			<div class="l">Tasks done</div>
			<div class="d">
				across {plan.epics.length} epics{#if parkedCount}, {parkedCount} parked{/if}
			</div>
		</article>
		<article class="card tile">
			<div class="v" class:warn={blocked > 0}>{blocked}</div>
			<div class="l">Blocked</div>
			<div class="d">{blocked > 0 ? 'waiting on the user' : 'nothing stuck'}</div>
		</article>
		<article class="card tile">
			<div class="v">Phase {current} of {plan.phases.length}</div>
			<div class="l">{currentPhase?.name}{pending ? ' · roadmap pending' : ''}</div>
			<div class="d">{gate.criteriaMet} of {gate.criteria.length} exit criteria met</div>
		</article>
		<article class="card tile">
			<div class="v">{accuracy ? `${accuracy}×` : 'not enough data'}</div>
			<div class="l">Estimate accuracy</div>
			<div class="d">
				{#if accuracy}actual over estimate, across {estimated.length} completed tasks{:else}needs
					ten completed tasks; {estimated.length} so far{/if}
			</div>
		</article>
	</div>
</section>

<section>
	<h3>Needs attention</h3>
	<p class="lede">
		What is in the way, first — before how ready the project is, because these are what decide it.
		Each carries a reference: run /epic ATT-… to turn one into an epic with tasks.
	</p>
	{#if copyFailed}<p class="fail">Could not copy to the clipboard.</p>{/if}
	{#each plan.blockers ?? [] as item (item.title)}
		{@const ref = item.ref ?? attentionRef(item.title)}
		{@const severity = item.severity ?? 'warning'}
		<article class="card attention" class:critical={severity === 'critical'}>
			<div class="row">
				<span aria-hidden="true">!</span>
				<strong class:warn={severity !== 'critical'} class:fail={severity === 'critical'}
					>{severity}</strong
				>
				<span class="title">{item.title}</span>
				<button
					type="button"
					class="copy ref"
					title="Copy the reference"
					onclick={() => copyCommand(ref)}>{ref}{copiedRef === ref ? ' copied' : ''}</button
				>
			</div>
			<p class="meta num">Since {item.since} · holds up {item.epic}</p>
			<p>{item.nextAction}</p>
			<p class="meta"><code>/epic {ref}</code> creates the epic and tasks that address this</p>
		</article>
	{:else}
		<p class="empty">No rules firing.</p>
	{/each}
</section>

<section>
	<h3>Deployment readiness</h3>
	<p class="num">
		{gates.filter((g) => g.met).length} of {gates.length} gates met.{#if rPhase !== current}
			For Phase {rPhase}, which is verified and waiting for /ship.{/if}
	</p>
	<ul class="gates">
		{#each gates as g (g.name)}
			<li>
				<span class="mark" class:ok={g.met} class:fail={!g.met}>{g.met ? '[x]' : '[ ]'}</span>
				<span class="name">{g.name}</span>
				<span class="why">{g.why}</span>
			</li>
		{/each}
	</ul>
	<p class="help">
		Exit criteria and tasks are computed live, so parking something updates them at once.
		{listOf(stale)} come from the last /setup run ({date(plan.generatedAt)}) — a browser cannot see
		a test run, a pull request, or whether a deploy happened, and guessing would be worse than
		deferring. A gate with no evidence stays unmet, never assumed green.
	</p>
</section>

<section>
	<h3>Sprint progress</h3>
	{#if board.sprints.length === 0}
		<p class="empty">
			No sprints yet. A project without them is perfectly normal — create one below when a dated
			window is useful.
		</p>
	{:else}
		<table class="sprints">
			<thead>
				<tr>
					<th>Sprint</th><th>Dates</th><th>Status</th><th>Tasks</th><th>Points</th><th>Remove</th>
				</tr>
			</thead>
			<tbody>
				{#each board.sprints as sprint (sprint.id)}
					{@const held = sprintTasks(sprint.id)}
					<tr>
						<td
							>{sprint.name}{#if sprint.goal}<br /><span class="meta">{sprint.goal}</span>{/if}</td
						>
						<td>{sprint.starts_on} – {sprint.ends_on}</td>
						<td>{sprintStatus(sprint, today)}</td>
						<td>{held.filter((t) => t.done).length}/{held.length}</td>
						<td>
							{held.filter((t) => t.done).reduce((sum, t) => sum + (t.points ?? 0), 0)} / {held.reduce(
								(sum, t) => sum + (t.points ?? 0),
								0
							)}
						</td>
						<td>
							<button
								type="button"
								class="linkish"
								onclick={async () =>
									(removeRefusal = await run(() => client.deleteSprint(sprint.id)))}>Remove</button
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if removeRefusal}<p class="fail">{removeRefusal}</p>{/if}
		<p class="help">
			Completed over committed points. A task with no points still counts as a task — points alone
			would hide the unestimated work.
		</p>
	{/if}

	<form class="card sprintform list" onsubmit={createSprint}>
		<h3>New sprint</h3>
		<div class="fields">
			<label>Name <input bind:value={sprintName} placeholder="Sprint 1" /></label>
			<label>Starts <input type="date" bind:value={startsOn} /></label>
			<label>Ends <input type="date" bind:value={endsOn} /></label>
			<label class="wide">Goal <input bind:value={goal} placeholder="Optional" /></label>
			<button type="submit" class="action">Create sprint</button>
		</div>
		{#if sprintResult}
			<p
				class:ok={sprintResult.tone === 'ok'}
				class:fail={sprintResult.tone === 'fail'}
				aria-live="polite"
			>
				{sprintResult.text}
			</p>
		{/if}
	</form>
</section>

<section>
	<h3>Phases</h3>
	<p class="lede">
		Phases come from the roadmap and are read-only here — /shape adds them. What this page can do is
		request an advance once the current phase is genuinely finished.
	</p>
	{#each plan.phases as phase (phase.n)}
		{@const pill = phasePill(phase, current, roadmapPhase)}
		{@const own = tasks.filter((t) => t.phase === phase.n)}
		{@const parked = own.filter((t) => t.parked).length}
		<details class="phase" class:is-current={phase.n === current} class:is-past={phase.n < current}>
			<summary>
				<span>Phase {phase.n} — {phase.name}</span>
				<span
					class="pill"
					class:done={pill.tone === 'ok'}
					class:parked={pill.tone === 'warn'}
					class:current={pill.tone === 'accent'}>{pill.label}</span
				>
				<span class="pill num">{own.filter((t) => t.done).length}/{own.length - parked}</span>
				{#if parked}<span class="pill parked num">{parked} parked</span>{/if}
			</summary>
			<p class="lede">{phase.goal}</p>
			{#each plan.epics.filter((e) => e.phase === phase.n) as epic (epic.title)}
				<div class="delivered epic-c" style={epicStyle(colours.get(epic.title))}>
					<strong>{epic.title}</strong>
					<ul class="crit">
						{#each own.filter((t) => t.epic === epic.title) as task (task.key)}
							<li class:parked-row={task.parked}>
								{#if task.done}<span class="mark ok" aria-hidden="true">✓</span>
								{:else if task.parked}<span class="mark warn" aria-hidden="true">⏸</span>
								{:else}<span class="mark empty" aria-hidden="true">·</span>{/if}
								<span class="body">
									<span>{task.title}</span>
									{#if task.done && !task.authored && task.description}
										<span class="meta">{task.description}</span>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<p class="empty">No epics in this phase.</p>
			{/each}
		</details>
	{/each}

	<article class="card advance list" class:pending class:forced={pending && pendingAdvance?.forced}>
		{#if pending && pendingAdvance}
			{#if pendingAdvance.forced}
				<p>
					Now on Phase {current}, advanced with work outstanding — Phase {pendingAdvance.phase} was left
					with {pendingAdvance.left_unfinished ?? 'work outstanding'}. It is not recorded as
					finished.
				</p>
			{:else}
				<p>Now on Phase {current}, advanced here.</p>
			{/if}
			<p class="help">
				.idea/ROADMAP.md still says Phase {roadmapPhase} — the roadmap is written by /setup, which applies
				this on its next run. One writer for the plan.
			</p>
			<button
				type="button"
				class="linkish"
				onclick={async () =>
					(advanceRefusal = await run(() => client.withdrawAdvance(pendingAdvance.phase)))}
				>Step back to Phase {pendingAdvance.phase}</button
			>
		{/if}

		{#if gate.parkedTasks.length || parkedCriteria.length}
			<p class="warn">
				{plural(gate.parkedTasks.length, 'task')} and {criteria(parkedCriteria.length)} parked ({points(
					gate.parkedPoints
				)}) — set aside, so this phase can move on without them. Parked is never counted as met: it
				records that you chose to skip something, which is a different claim from having done it.
			</p>
			{#if parkedCriteria.length}
				<details>
					<summary>{criteria(parkedCriteria.length)} parked</summary>
					<ul class="list">
						{#each parkedCriteria as c (c.text)}
							<li class="row">
								<span>{c.text}</span>
								<button
									type="button"
									class="linkish"
									onclick={async () =>
										(advanceRefusal = await run(() =>
											client.parkCriterion(current, c.text, false)
										))}>Unpark</button
								>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		{/if}

		{#if current >= last}
			<p>This is the last phase in the roadmap. <code>/shape</code> adds more.</p>
		{:else if gate.open}
			<p>
				Phase {current} is finished: every exit criterion met or parked, every task done or parked, nothing
				in flight.
			</p>
			<button type="button" class="create" onclick={() => advance(false)}
				>Advance to Phase {current + 1} — {nextPhase?.name}</button
			>
		{:else}
			<p><strong>Cannot advance yet.</strong> Phase {current} is not finished:</p>
			{#if gate.unmetCriteria.length}
				<p>
					{gate.criteria.filter((c) => c.satisfied).length} of {gate.criteria.length} exit criteria satisfied.
					Outstanding — park one to move on without it:
				</p>
				<ul class="list">
					{#each gate.unmetCriteria as text (text)}
						<li class="row">
							<span>{text}</span>
							<button
								type="button"
								class="action"
								onclick={async () =>
									(advanceRefusal = await run(() => client.parkCriterion(current, text, true)))}
								>Park</button
							>
						</li>
					{/each}
				</ul>
			{/if}
			<ul class="list num">
				{#if gate.outstandingTasks.length}
					<li>{gate.outstandingTasks.length} task{s(gate.outstandingTasks.length)} outstanding.</li>
				{/if}
				{#if gate.inFlight.length}
					<li>{gate.inFlight.length} task{s(gate.inFlight.length)} blocked or in progress.</li>
				{/if}
				{#if gate.parkedTasks.length}
					<li class="empty">
						{gate.parkedTasks.length} task{s(gate.parkedTasks.length)} parked and not counted.
					</li>
				{/if}
			</ul>
			<p class="help">
				Exit criteria are the definition of a phase; tasks are the means. Parking a criterion moves
				the phase on without it, and records that you did — it never marks it met.
			</p>
		{/if}

		{#if current < last && !gate.open}
			{#if confirming}
				<div class="confirm list">
					<p><strong>Advance to Phase {current + 1} anyway?</strong></p>
					<p>
						Phase {current} will be recorded as advanced with {gate.leftUnfinished}. It is not
						marked finished, and what was left is written into the roadmap by /setup rather than
						quietly dropped.
					</p>
					<div class="row">
						<button type="button" class="action danger" onclick={() => advance(true)}
							>Yes, advance with work outstanding</button
						>
						<button type="button" class="action" onclick={() => (confirming = false)}>Cancel</button
						>
					</div>
				</div>
			{:else}
				<button type="button" class="linkish" onclick={() => (confirming = true)}
					>Advance to Phase {current + 1} anyway</button
				>
			{/if}
		{/if}
		{#if advanceRefusal}<p class="fail">{advanceRefusal}</p>{/if}
	</article>

	<p class="lede">
		No burndown, no velocity, no projected completion date. {words[plan.phases.length] ??
			plan.phases.length} phases and {done} completed tasks cannot support a forecast, and a projection
		drawn in the same style as a measurement is not honest.
	</p>
</section>
