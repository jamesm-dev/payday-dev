<script lang="ts">
	import './management.css';
	import { onMount, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { afterNavigate, goto, refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import {
		advancePending,
		buildTaskIndex,
		createClient,
		effectivePhase,
		epicColours,
		lastPhase,
		phaseGate,
		phaseProgress,
		SECTIONS,
		sidebarCounts,
		sprintStatus,
		type Board,
		type Plan,
		type Section
	} from './api.ts';
	import BoardSection from './sections/Board.svelte';
	import SpecsSection from './sections/Specs.svelte';
	import StatusSection from './sections/Status.svelte';
	import TeamSection from './sections/Team.svelte';
	import TaskDrawer from './ui/TaskDrawer.svelte';

	type Data = { plan: Plan | null; board: Board | null; today: string; failure: string | null };
	let { data }: { data: Data } = $props();

	const client = createClient(resolve('/management'));

	// One derivation, built once per load and passed down. No section computes "done" itself.
	const plan = $derived(data.plan);
	const board = $derived(data.board);
	const index = $derived(plan && board ? buildTaskIndex(plan, board) : null);
	const colours = $derived(plan ? epicColours(plan) : new Map());
	const current = $derived(plan && board ? effectivePhase(plan, board) : 0);
	const pending = $derived(plan && board ? advancePending(plan, board) : false);
	const counts = $derived(plan && board && index ? sidebarCounts(plan, board, index) : null);
	const progress = $derived(index ? phaseProgress(index, current) : 0);
	// The percentage leaves parked work out of its denominator, so it says how much it left out.
	const parkedHere = $derived(
		index ? [...index.values()].filter((t) => t.phase === current && t.parked).length : 0
	);
	const currentPhase = $derived(plan?.phases.find((p) => p.n === current));
	const activeSprint = $derived(
		board?.sprints.find((sp) => sprintStatus(sp, data.today) === 'active') ?? null
	);

	// --- the three URL layers: #section, ?filters (replaced), ?task (pushed) --------------
	let hash = $state(page.url.hash);
	const section: Section = $derived(SECTIONS.find((sec) => `#${sec.id}` === hash)?.id ?? 'board');
	// The filters and searches: this state is the source of truth, and the URL is written from it.
	let query = $state<Record<string, string>>(
		Object.fromEntries([...page.url.searchParams].filter(([key]) => key !== 'task'))
	);
	let deepLinkTask = $state<string | null>(page.url.searchParams.get('task'));
	let pushedTask = false;

	onMount(() => {
		hash = location.hash;
		const onHash = () => (hash = location.hash);
		addEventListener('hashchange', onHash);
		return () => removeEventListener('hashchange', onHash);
	});
	afterNavigate(() => (hash = location.hash));

	/**
	 * This page, resolved, carrying the current filters, the open task and the #section. Built from
	 * state rather than location.search, so several writes in a row cannot race each other.
	 */
	function url(task: string | null | undefined): ResolvedPathname {
		const entries = Object.entries(query).filter(([, value]) => value);
		const search = new URLSearchParams(task ? [...entries, ['task', task]] : entries).toString();
		return `${resolve('/management')}${search ? `?${search}` : ''}${location.hash}` as ResolvedPathname;
	}

	const openKey = $derived(page.state.task ?? deepLinkTask);

	/** A filter is not a navigation: the URL is replaced, never pushed. */
	function setQuery(key: string, value: string) {
		query = { ...query, [key]: value };
		void goto(url(openKey), { shallow: true, replace: true, state: page.state });
	}

	/** The drawer is a history entry, so the back button closes it. */
	function openTask(key: string) {
		pushedTask = true;
		deepLinkTask = null;
		void goto(url(key), { shallow: true, state: { ...page.state, task: key } });
	}

	function closeTask() {
		if (pushedTask && page.state.task) {
			pushedTask = false;
			history.back();
			return;
		}
		deepLinkTask = null;
		void goto(url(null), {
			shallow: true,
			replace: true,
			state: { ...page.state, task: undefined }
		});
	}

	/** Every write: post, and only on success re-read both stores. A failure returns its sentence. */
	async function run(action: () => Promise<unknown>): Promise<string | null> {
		try {
			await action();
			await refreshAll();
			return null;
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}
	}

	// --- a finished phase moves on by itself, and says so ---------------------------------
	type Banner = { from: number; through: number; clean: boolean; left: string[] };
	let banner = $state<Banner | null>(null);
	// Reactive on purpose: the effect bails while an advance runs and must re-run when it clears,
	// or a run of finished phases advances once and stops instead of cascading.
	let advancing = $state(false);
	// A refused advance is not retried in a loop; Status already shows what is outstanding.
	const refused = new SvelteSet<number>();

	$effect(() => {
		if (!plan || !board || !index || advancing) return;
		const from = effectivePhase(plan, board);
		const gate = phaseGate(plan, board, index, from);
		if (!gate.tasksSettled || from >= lastPhase(plan) || refused.has(from)) return;

		advancing = true;
		const clean = gate.open;
		client
			.advancePhase(from, clean, !clean, gate.leftUnfinished)
			.then(() => refreshAll())
			.then(() => {
				const before = untrack(() => banner);
				// One announcement per cascade, from the earliest phase it started at.
				banner = {
					from: before ? Math.min(before.from, from) : from,
					through: from,
					clean: (before?.clean ?? true) && clean,
					left: [...(before?.left ?? []), ...(clean ? [] : [gate.leftUnfinished])]
				};
			})
			.catch(() => refused.add(from)) // Status already shows what is outstanding.
			.finally(() => (advancing = false));
	});
</script>

<div class="mg">
	<div class="shell">
		<aside class="sidebar">
			<!-- The aside spans the whole page so its colour never stops short; this part stays put. -->
			<div class="sidebar-inner">
				<div class="brand">
					<span class="name">{plan?.project.name ?? 'Loading…'}</span>
					{#if plan && currentPhase}
						<span class="phase">Phase {current} of {plan.phases.length} — {currentPhase.name}</span>
					{/if}
					{#if pending}
						<span class="pending" title="Advanced here; the roadmap catches up on the next /setup"
							>roadmap pending</span
						>
					{/if}
					{#if board && board.sprints.length > 0}
						<span class="sprint">{activeSprint ? activeSprint.name : 'no active sprint'}</span>
					{/if}
				</div>

				<nav aria-label="Dashboard sections">
					<ul>
						{#each SECTIONS as item (item.id)}
							<li>
								<a
									href={`#${item.id}`}
									aria-current={section === item.id ? 'page' : undefined}
									data-sveltekit-noscroll
								>
									<span>{item.label}</span>
									{#if counts && counts[item.id] !== null}
										<span class="count">{counts[item.id]}</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</nav>

				{#if plan}
					<div class="progress">
						<div
							class="bar"
							role="progressbar"
							aria-label={`Phase ${current} progress`}
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={progress}
						>
							<span style:width={`${progress}%`}></span>
						</div>
						<span
							>{progress}% of Phase {current} tasks done{#if parkedHere}
								· {parkedHere} parked{/if}</span
						>
					</div>
				{/if}
			</div>
		</aside>

		<main class="content">
			{#if data.failure}
				<p class="lede fail">Could not load the dashboard: {data.failure}</p>
			{:else if !plan || !board || !index}
				<p class="lede">Loading…</p>
			{:else}
				{#if banner}
					<div class="note advanced" class:clean={banner.clean} role="status">
						<p>
							{#if banner.from === banner.through}
								Phase {banner.from} had no work left — now on Phase {banner.through + 1}.
							{:else}
								Phases {banner.from}–{banner.through} had no work left — now on Phase {banner.through +
									1}.
							{/if}
							Every task was done or parked, so the project moved on by itself.
							{#if banner.left.length}
								It moved past {banner.left.join('; ')}, which is recorded rather than marked met.
							{/if}
							<code>.idea/ROADMAP.md</code> catches up on the next <code>/setup</code>.
						</p>
						<button class="action" type="button" onclick={() => (banner = null)}>Dismiss</button>
					</div>
				{/if}

				{#if section === 'board'}
					<BoardSection
						{plan}
						{board}
						{index}
						{colours}
						{client}
						{run}
						{openTask}
						{query}
						{setQuery}
					/>
				{:else if section === 'specs'}
					<SpecsSection {plan} {board} {index} {colours} {query} {setQuery} />
				{:else if section === 'team'}
					<TeamSection {board} {index} {colours} {client} {run} {query} {setQuery} {openTask} />
				{:else}
					<StatusSection {plan} {board} {index} {colours} {client} {run} today={data.today} />
				{/if}
			{/if}
		</main>
	</div>

	{#if plan && board && index && openKey && index.has(openKey)}
		{#key openKey}
			<TaskDrawer taskKey={openKey} {board} {index} {colours} {client} {run} onclose={closeTask} />
		{/key}
	{/if}
</div>
