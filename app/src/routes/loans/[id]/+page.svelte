<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import LoanFields from '#lib/loans/LoanFields.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const failed = $derived(form && 'values' in form ? form : null);
</script>

<svelte:head>
	<title>{data.name} - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title={data.name}
		back={{ href: resolve('/loans'), label: 'What I owe' }}
		description={`${data.kind}. Balance ${data.balance}, from ${data.balanceDate}.`}
	/>

	<h2>Change this loan</h2>
	<p class="muted">
		Each check-in confirms the balance for you. Change it here only if you know it is wrong.
	</p>
	<form method="POST" action="?/save" data-type={data.type}>
		<LoanFields
			type={data.type}
			values={failed?.values ?? data.values}
			problems={failed?.problems ?? {}}
			items={data.items}
			balanceLabel="What is owed now?"
		/>
		<div class="actions">
			<button class="btn" type="submit">Save changes</button>
		</div>
	</form>

	<h2>Finished with it</h2>
	<!-- Closing a loan takes it off the list, so it asks first. A details element works without script. -->
	<form method="POST" action="?/close">
		<details class="confirm">
			<summary>Paid it off?</summary>
			<p>
				It leaves your list and stops being counted. Its history is kept, and nothing is deleted.
			</p>
			<button class="btn danger" type="submit">Yes, it is paid off</button>
		</details>
	</form>
</main>

<style>
	.confirm summary {
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
		height: var(--control-height);
		padding: 0 var(--space-6);
		border: 1px solid var(--color-warn);
		border-radius: var(--radius-2);
		color: var(--color-warn);
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}

	.confirm summary::-webkit-details-marker {
		display: none;
	}

	.confirm[open] summary {
		margin-bottom: var(--space-3);
	}

	.confirm p {
		margin: 0 0 var(--space-3);
	}
</style>
