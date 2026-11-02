<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Expenses - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title="Expenses"
		back={{ href: resolve('/'), label: 'Home' }}
		description="Everything you have logged, newest day first."
	/>

	{#if data.days.length === 0}
		<p class="muted" data-testid="expenses-empty">
			Nothing logged yet. Add one from the home screen and it shows here.
		</p>
	{:else}
		{#each data.days as day (day.date)}
			<section class="day" aria-labelledby={`day-${day.date}`} data-testid="expense-day">
				<div class="day-head">
					<h2 id={`day-${day.date}`}>{day.title}</h2>
					<p class="total" data-testid="day-total">{day.total}</p>
				</div>
				<ul class="lines">
					{#each day.expenses as e (e.id)}
						<li>
							<a class="row" href={resolve('/expenses/[id]', { id: String(e.id) })}>
								<span class="main">{e.name}</span>
								<span class="money">{e.amount}</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</main>

<style>
	.day-head {
		display: flex;
		gap: var(--space-4);
		align-items: baseline;
		justify-content: space-between;
		margin: var(--space-10) 0 var(--space-2);
	}

	.day-head h2 {
		margin: 0;
	}

	.total {
		margin: 0;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
</style>
