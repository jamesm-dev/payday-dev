<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Past check-ins - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title="Past check-ins"
		back={{ href: resolve('/checkin'), label: 'Payday check-in' }}
	/>

	{#if data.rows.length === 0}
		<p class="muted" data-testid="history-empty">
			No check-ins yet. After your first one, it is listed here with what you spent.
		</p>
	{:else}
		<!-- Plain rows: there is no page for a single check-in to open. -->
		<ul class="lines" data-testid="history">
			{#each data.rows as row (row.id)}
				<li data-testid="history-row">
					<span class="main">
						<strong>{row.date}</strong>
						<span class="spent">{row.spending.headline}</span>
						{#if row.logged}<span class="sub" data-testid="history-logged">{row.logged}.</span>{/if}
						<span class="sub">Pay {row.pay}. Expected {row.expected}. Took {row.duration}.</span>
					</span>
					<span class="money" title="Balance">{row.balance}</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.main strong,
	.spent {
		display: block;
	}

	.spent {
		font-weight: 600;
	}
</style>
