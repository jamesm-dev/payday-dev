<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { resolve } from '$app/paths';
	import PaycheckCard from '#lib/plan/PaycheckCard.svelte';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const done = $derived(data.done);
	const home = $derived(done.home);
</script>

<svelte:head>
	<title>Check-in saved - Payday</title>
</svelte:head>

<main class="page">
	<p class="eyebrow">Check-in saved</p>
	<PageHeader title="Here is your next two weeks" />

	{#if home.state === 'ready'}
		<p class="eyebrow">You can spend until {home.until}</p>
		<p class="amount" class:negative={home.negative} data-testid="safe-to-spend">{home.amount}</p>
		{#if home.shortfall}
			{@const shortfall = home.shortfall}
			<Notice tone="danger" testid="shortfall">
				{#snippet title()}You are <span class="figure">{shortfall.short}</span> short{/snippet}
				<p>More is due before <strong>{home.until}</strong> than you have.</p>
				{#snippet detail()}
					<a class="btn small" href={resolve('/')}>See what is not covered</a>
				{/snippet}
			</Notice>
		{/if}
	{:else}
		<Notice tone="caution">
			<p>There is no number yet. Check that your pay and balance are on the home screen.</p>
		</Notice>
	{/if}

	<p class="muted" data-testid="done-summary">
		{done.spending.headline} since your last check-in. Balance {done.balance} on {done.date}. Done
		in {done.duration}.
	</p>

	{#if done.logged}
		<p class="muted" data-testid="done-logged">{done.logged}.</p>
	{/if}

	{#if done.owed.length > 0}
		<Notice tone="caution" title="Still to pay" testid="owed">
			<p>
				These did not go out. They are set aside, and Payday will ask again at your next check-in.
			</p>
			{#snippet detail()}
				<ul class="lines">
					{#each done.owed as line, i (i)}
						<li>
							<span class="main">{line.name}<span class="sub">{line.date}</span></span>
							<span class="money">{line.amount}</span>
						</li>
					{/each}
				</ul>
			{/snippet}
		</Notice>
	{/if}

	<h2>The next 14 days</h2>
	{#if done.next14.length === 0}
		<p class="muted" data-testid="next14-empty">
			Nothing is due or coming in over the next 14 days.
		</p>
	{:else}
		<ul class="lines" data-testid="next14">
			{#each done.next14 as line, i (i)}
				<li>
					<span class="main">{line.name}<span class="sub">{line.date}</span></span>
					<span class="money">{line.incoming ? '+ ' : ''}{line.amount}</span>
				</li>
			{/each}
		</ul>
		<p class="muted">{done.next14Out} goes out over these 14 days.</p>
	{/if}

	{#if done.first}
		<h2>Your {done.first.isToday ? 'paycheck today' : 'next paycheck'}</h2>
		<PaycheckCard paycheck={done.first} />
	{/if}

	<div class="actions">
		<a class="btn" href={resolve('/plan')}>See the next six paychecks</a>
		<a class="btn secondary" href={resolve('/')}>Back to my number</a>
	</div>
</main>

<style>
	.amount {
		margin: var(--space-2) 0 var(--space-4);
		font-size: var(--text-display);
		font-weight: 700;
		line-height: var(--leading-tight);
		font-variant-numeric: tabular-nums;
	}

	.amount.negative {
		color: var(--color-warn);
	}
</style>
