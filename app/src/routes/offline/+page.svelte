<script lang="ts">
	/**
	 * What the service worker shows, at whatever address was asked for, when there is no signal. Drawn
	 * once at build time with no data; once its script runs it shows the phone's copy of the last
	 * home screen, dated, and lets an expense be logged (ADR-0029). Without a copy, or without script,
	 * it says plainly that Payday needs a connection.
	 */
	import '#lib/styles/controls.css';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import HomeNumber from '#lib/home/HomeNumber.svelte';
	import QuickAdd from '#lib/home/QuickAdd.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import { checkExpense } from '#lib/checks.ts';
	import { fromText, ownerTodayIn, paydayPassed, withQueued } from '#lib/offline/adjust.ts';
	import {
		enqueue,
		newId,
		readCopy,
		readQueue,
		unqueue,
		type Copy,
		type Queued
	} from '#lib/offline/store.ts';

	let copy = $state<Copy | null>(null);
	let queue = $state<Queued[]>([]);
	let values = $state<{ amount: string; note: string; date: string } | undefined>();
	let problems = $state<Record<string, string>>({});
	let kept = $state(false);
	/** Something is typed and not kept yet: coming back online must not reload over it. */
	let typed = false;

	/**
	 * The address asked for: the home screen ("/"), another page, or a form that was not sent. Read
	 * once the script runs: at build time, when this page is drawn, there is no address yet.
	 */
	let unsaved = $state(false);
	let elsewhere = $state(false);

	const shown = $derived(copy ? withQueued(copy.view, copy.facts, queue) : null);
	const today = $derived(copy ? ownerTodayIn(copy.facts, new Date()) : null);

	const refresh = () => {
		copy = readCopy();
		queue = copy ? readQueue(copy.owner) : [];
	};

	/** Set once this page starts to go: a reload then would cancel the page being opened. */
	let leaving = false;

	/**
	 * The site answers: a static file the service worker does not keep (the query makes sure),
	 * so the answer comes from the network or not at all. Costs no server function.
	 */
	async function reachable(): Promise<boolean> {
		try {
			const response = await fetch(`/manifest.webmanifest?online=${Date.now()}`, {
				method: 'HEAD',
				cache: 'no-store',
				signal: AbortSignal.timeout(8_000)
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	/**
	 * Back online: carry on to the page that was asked for, where the home screen sends the queue.
	 * Browsers can say "online" while the signal is not really back, or while a page is opening, so
	 * this first checks that the site answers, and never reloads over something typed.
	 */
	async function online() {
		if (typed || leaving || !(await reachable()) || typed || leaving) return;
		if (unsaved || location.pathname === '/offline') location.replace(resolve('/'));
		else location.reload();
	}

	onMount(() => {
		const { pathname, search } = location;
		unsaved = new URLSearchParams(search).has('unsaved');
		elsewhere = !unsaved && pathname !== '/' && pathname !== '/offline';
		refresh();
		const leave = () => {
			leaving = true;
		};
		addEventListener('online', online);
		// Opened at its own address with the signal back (a reload after "That was not saved"): it
		// has nothing to say, so on to the home screen.
		if (location.pathname === '/offline' && navigator.onLine) void online();
		addEventListener('beforeunload', leave);
		addEventListener('pagehide', leave);
		return () => {
			removeEventListener('online', online);
			removeEventListener('beforeunload', leave);
			removeEventListener('pagehide', leave);
		};
	});

	function add(event: SubmitEvent & { currentTarget: EventTarget & HTMLFormElement }) {
		event.preventDefault();
		if (!copy || !today) return;
		const element = event.currentTarget;
		const entered = new FormData(element);
		const fields = {
			amount: String(entered.get('amount') ?? ''),
			note: String(entered.get('note') ?? ''),
			date: String(entered.get('date') ?? '')
		};
		kept = false;
		const checked = checkExpense(fields, today);
		if (!checked.ok) {
			values = fields;
			problems = checked.problems;
			return;
		}
		const stored = enqueue({
			id: newId(),
			owner: copy.owner,
			amount: checked.value.amount,
			amountText: fields.amount,
			note: checked.value.note ?? '',
			date: checked.value.spentOn,
			loggedAt: new Date().toISOString(),
			state: 'waiting'
		});
		if (!stored) {
			values = fields;
			problems = { amount: 'This phone could not keep it. Try again when you are back online.' };
			return;
		}
		values = undefined;
		problems = {};
		typed = false;
		element.reset();
		refresh();
		kept = true;
	}

	function removeKept(id: string) {
		unqueue(id);
		refresh();
	}
</script>

<svelte:head>
	<title>Offline · Payday</title>
</svelte:head>

<main class="page">
	<h1>You're offline</h1>
	{#if unsaved}
		<Notice tone="caution" title="That was not saved" testid="needs-connection">
			<p>It needs a connection. Try again when you are back online.</p>
		</Notice>
	{:else if elsewhere}
		<Notice tone="caution" title="This page needs a connection" testid="needs-connection">
			<p>It will open when you are back online.</p>
		</Notice>
	{/if}

	{#if shown && copy && today}
		<p class="from" data-testid="offline-from">
			Offline: from <strong>{fromText(copy.facts)}</strong>
		</p>
		{#if paydayPassed(copy.facts, new Date())}
			<Notice tone="caution" icon="clock" title="A payday has passed since then" testid="copy-old">
				<p>
					This number is from before your payday on <strong>{copy.view.until}</strong>. Connect to
					see the new one.
				</p>
			</Notice>
		{/if}
		<div
			oninput={() => {
				typed = true;
			}}
		>
			<HomeNumber view={shown.view} pending={shown.pending} onremove={removeKept}>
				{#snippet quickAdd()}
					<QuickAdd {today} {values} {problems} onsubmit={add} />
					{#if kept}
						<Notice tone="done" role="status" testid="kept-on-phone">
							<p>Kept on this phone. It goes to Payday when you are back online.</p>
						</Notice>
					{/if}
				{/snippet}
			</HomeNumber>
		</div>
	{:else}
		<p class="muted">
			Payday needs a connection to show your number. It will be here when you're back online.
		</p>
	{/if}
	<p><a href={resolve('/')} data-sveltekit-reload>Try again</a></p>
</main>

<style>
	h1 {
		margin: 0 0 var(--space-4);
		font-size: var(--text-lg);
	}

	.from {
		margin: 0 0 var(--space-4);
		color: var(--color-text-muted);
	}

	a {
		color: var(--color-accent);
	}
</style>
