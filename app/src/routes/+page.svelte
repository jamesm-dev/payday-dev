<script lang="ts">
	import DateField from '#lib/ui/DateField.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import '#lib/styles/controls.css';
	import { onMount } from 'svelte';
	import { applyAction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import HomeNumber from '#lib/home/HomeNumber.svelte';
	import QuickAdd from '#lib/home/QuickAdd.svelte';
	import { checkExpense } from '#lib/checks.ts';
	import { ownerTodayIn, withQueued } from '#lib/offline/adjust.ts';
	import { sendExpense, sendQueue } from '#lib/offline/send.ts';
	import { adopt, enqueue, newId, readQueue, unqueue, type Queued } from '#lib/offline/store.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// A visitor who is not signed in gets the public home page (data.landing), which has no home data.
	const home = $derived(data.landing ? null : data.home);
	const problems = $derived(form?.balance?.problems ?? {});
	const expenseProblems = $derived(form?.expense?.problems ?? {});
	const expenseValues = $derived(form?.expense?.values);

	// ---- Works without signal (ADR-0029) ----

	/** This person's expenses kept on the phone, not yet in the site's data. Empty until mounted. */
	let queue = $state<Queued[]>([]);
	/** Set when the last expense was kept on the phone because there was no signal. */
	let kept = $state(false);
	let busy = $state(false);

	// Every time the site sends data: keep the copy, drop what it already holds, and anything of
	// another person's. Before the sending below, which must not send what this drops.
	$effect(() => {
		if (data.landing) return;
		queue = adopt(data.owner, data.home.state === 'ready' ? data.home : null, data.facts);
	});

	const refreshQueue = () => {
		if (!data.landing) queue = readQueue(data.owner);
	};

	async function sendWaiting() {
		if (data.landing) return;
		if ((await sendQueue(data.owner, refreshQueue)) > 0) await invalidateAll();
	}

	onMount(() => {
		if (data.landing) return;
		void sendWaiting();
		addEventListener('online', sendWaiting);
		return () => removeEventListener('online', sendWaiting);
	});

	/** The number and lists as the site sent them, less what is kept on the phone. */
	const shown = $derived(
		!data.landing && data.home.state === 'ready' && data.facts
			? withQueued(data.home, data.facts, queue)
			: null
	);

	/**
	 * The quick-add form, with script: sent like `enhance` would, with an id made here so a repeat
	 * saves nothing. With no signal it is checked by the site's own rules and kept on the phone.
	 */
	async function addExpense(event: SubmitEvent & { currentTarget: EventTarget & HTMLFormElement }) {
		if (data.landing || !data.facts) return;
		event.preventDefault();
		if (busy) return;
		const element = event.currentTarget;
		const entered = new FormData(element);
		const fields = {
			amount: String(entered.get('amount') ?? ''),
			note: String(entered.get('note') ?? ''),
			date: String(entered.get('date') ?? '')
		};
		const clientId = newId();
		busy = true;
		kept = false;
		try {
			const sent = await sendExpense({ ...fields, clientId });
			if (sent.kind === 'saved' || sent.kind === 'refused') {
				if (sent.kind === 'saved') element.reset();
				await applyAction(sent.result);
			} else if (sent.kind === 'offline') {
				await keep(fields, clientId, element);
			} else {
				// Signed out, or the site is down: the ordinary post shows the site's own answer, and
				// carries the same id in case this one was saved after all.
				const id = document.createElement('input');
				id.type = 'hidden';
				id.name = 'clientId';
				id.value = clientId;
				element.append(id);
				element.submit();
			}
		} finally {
			busy = false;
		}
	}

	async function keep(
		fields: { amount: string; note: string; date: string },
		clientId: string,
		element: HTMLFormElement
	) {
		if (data.landing || !data.facts) return;
		const checked = checkExpense(fields, ownerTodayIn(data.facts, new Date()));
		const refuse = (problems: Record<string, string>) =>
			applyAction({
				type: 'failure',
				status: 400,
				data: { expense: { values: fields, problems } },
				location: '/'
			});
		if (!checked.ok) return refuse(checked.problems);
		const stored = enqueue({
			id: clientId,
			owner: data.owner,
			amount: checked.value.amount,
			amountText: fields.amount,
			note: checked.value.note ?? '',
			date: checked.value.spentOn,
			loggedAt: new Date().toISOString(),
			state: 'waiting'
		});
		if (!stored) {
			return refuse({
				amount:
					'There is no signal, and this phone could not keep it. Try again when you are back online.'
			});
		}
		refreshQueue();
		element.reset();
		await applyAction({ type: 'success', status: 200, location: '/' });
		kept = true;
	}

	function removeKept(id: string) {
		unqueue(id);
		refreshQueue();
	}
</script>

<svelte:head>
	{#if !data.landing}<title>Payday</title>{/if}
</svelte:head>

{#snippet updateBalance(today: string, open: boolean)}
	<!-- The closed panel carries no `open` binding: a bound value would be written back on hydration
	     and shut a panel the owner tapped open before the script arrived on a slow connection. -->
	{#if open || form?.balance}
		<details class="fold" id="update-balance" open>{@render balanceFields(today)}</details>
	{:else}
		<details class="fold" id="update-balance">{@render balanceFields(today)}</details>
	{/if}
{/snippet}

{#snippet balanceFields(today: string)}
	<summary>Update my balance</summary>
	<form method="POST" action="?/balance">
		<p class="muted">Look at your bank app and type in what it says today.</p>
		<div class="field-row">
			<div class="field">
				<label for="balance-amount">Balance in your account</label>
				<input
					id="balance-amount"
					name="amount"
					inputmode="decimal"
					autocomplete="off"
					defaultValue={form?.balance?.values.amount || ''}
					aria-invalid={problems.amount ? 'true' : undefined}
				/>
				{#if problems.amount}<p class="problem">{problems.amount}</p>{/if}
			</div>
			<DateField
				id="balance-asOf"
				name="asOf"
				label="True on"
				value={form?.balance?.values.asOf || today}
				max={today}
				problem={problems.asOf}
			/>
			<button class="btn" type="submit">Save balance</button>
		</div>
	</form>
{/snippet}

{#if data.landing && data.Landing}
	<!-- Imported by +page.ts only for a visitor: none of it is in the home screen's bundle. -->
	<data.Landing />
{:else if home}
	<main class="page">
		<!-- Phones only: the sidebar has Settings from 48rem up. -->
		<div class="topbar">
			<a class="gear" href={resolve('/settings')} aria-label="Settings">
				<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
					<circle cx="12" cy="12" r="3" />
					<path
						d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
					/>
				</svg>
			</a>
		</div>
		<h1 class="visually-hidden">Payday</h1>
		{#if home.state === 'ready'}
			{#if home.checkIn.nudge === 'resume'}
				<a class="prompt" href={resolve('/checkin')} data-testid="checkin-prompt">
					<strong>Your payday update is not finished</strong>
					<span>Continue where you stopped.</span>
				</a>
			{:else if home.checkIn.nudge === 'payday'}
				<a class="prompt" href={resolve('/checkin')} data-testid="checkin-prompt">
					<strong>It's payday: do your payday update</strong>
					<span>It takes about five minutes.</span>
				</a>
			{/if}
			<HomeNumber
				view={shown?.view ?? home}
				pending={shown?.pending}
				onremove={removeKept}
				marking
				markProblem={form?.paid?.problem}
			>
				{#snippet quickAdd()}
					<QuickAdd
						today={home.today}
						values={expenseValues}
						problems={expenseProblems}
						onsubmit={addExpense}
						{busy}
					/>
					{#if kept}
						<Notice tone="done" role="status" testid="kept-on-phone">
							<p>
								No signal, so it is kept on this phone. It goes to Payday when you are back online.
							</p>
						</Notice>
					{/if}
				{/snippet}
				{#snippet balanceForm()}{@render updateBalance(home.today, home.stale)}{/snippet}
			</HomeNumber>
		{:else if home.state === 'no-balance'}
			<p class="eyebrow">Safe to spend</p>
			<Notice tone="caution" title="Your balance is missing">
				<p>Add what is in your account to see your number.</p>
			</Notice>
			{@render updateBalance(home.today, true)}
		{:else}
			<p class="eyebrow">Safe to spend</p>
			<Notice tone="caution" title="Your pay is missing">
				<p>
					Add your pay to the schedule so the app knows when your next payday is. Then your number
					appears here.
				</p>
				{#snippet detail()}
					<a class="btn small" href={resolve('/schedule')}>Open the schedule</a>
				{/snippet}
			</Notice>
		{/if}

		<p class="footer-links"><a href={resolve('/settings')}>Settings</a></p>
	</main>
{/if}

<style>
	.footer-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-6);
		margin-top: var(--space-12);
		font-size: var(--text-sm);
	}

	.footer-links a {
		color: var(--color-text-muted);
	}

	.topbar {
		display: flex;
		justify-content: flex-end;
		margin-bottom: var(--space-2);
	}

	.gear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--control-height-sm);
		height: var(--control-height-sm);
		margin-right: calc(-1 * var(--space-3));
		border-radius: var(--radius-pill);
		color: var(--color-text-muted);
	}

	.gear:hover {
		color: var(--color-text);
	}

	.gear svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	@media (min-width: 48rem) {
		.topbar {
			display: none;
		}
	}

	.prompt {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-6);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-2);
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
	}

	.prompt span {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.page h1 {
		margin: 0;
	}
</style>
