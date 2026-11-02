<script lang="ts">
	import DateField from '#lib/ui/DateField.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import HomeNumber from '#lib/home/HomeNumber.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const home = $derived(data.home);
	const problems = $derived(form?.balance?.problems ?? {});
	const expenseProblems = $derived(form?.expense?.problems ?? {});
	const expenseValues = $derived(form?.expense?.values);
</script>

<svelte:head>
	<title>Payday</title>
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

{#snippet quickAddFields(today: string)}
	<summary>Another day</summary>
	<DateField
		id="expense-date"
		name="date"
		label="The day you spent it"
		value={expenseValues?.date || today}
		max={today}
		problem={expenseProblems.date}
	/>
{/snippet}

{#snippet quickAddForm(today: string)}
	<form class="quick-add" method="POST" action="?/expense" id="add-expense">
		<div class="field-row">
			<div class="field">
				<label for="expense-amount">Add an expense</label>
				<input
					id="expense-amount"
					name="amount"
					inputmode="decimal"
					autocomplete="off"
					placeholder="Amount"
					defaultValue={expenseValues?.amount || ''}
					aria-invalid={expenseProblems.amount ? 'true' : undefined}
					aria-describedby={expenseProblems.amount ? 'expense-amount-problem' : undefined}
				/>
				{#if expenseProblems.amount}
					<p class="problem" id="expense-amount-problem">{expenseProblems.amount}</p>
				{/if}
			</div>
			<div class="field">
				<label for="expense-note">What was it for? <span class="optional">(optional)</span></label>
				<input
					id="expense-note"
					name="note"
					autocomplete="off"
					defaultValue={expenseValues?.note || ''}
					aria-invalid={expenseProblems.note ? 'true' : undefined}
					aria-describedby={expenseProblems.note ? 'expense-note-problem' : undefined}
				/>
				{#if expenseProblems.note}
					<p class="problem" id="expense-note-problem">{expenseProblems.note}</p>
				{/if}
			</div>
			<button class="btn" type="submit">Add</button>
		</div>
		<!-- Unbound, like the balance panel: the day is today unless the owner opens this. -->
		{#if expenseProblems.date}
			<details class="fold" open>{@render quickAddFields(today)}</details>
		{:else}
			<details class="fold">{@render quickAddFields(today)}</details>
		{/if}
	</form>
{/snippet}

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
				<strong>Your check-in is half done</strong>
				<span>Pick it up where you left off.</span>
			</a>
		{:else if home.checkIn.nudge === 'payday'}
			<a class="prompt" href={resolve('/checkin')} data-testid="checkin-prompt">
				<strong>It's payday: check in</strong>
				<span>It takes about five minutes.</span>
			</a>
		{/if}
		<HomeNumber view={home}>
			{#snippet quickAdd()}{@render quickAddForm(home.today)}{/snippet}
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
