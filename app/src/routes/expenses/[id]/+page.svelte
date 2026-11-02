<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import DateField from '#lib/ui/DateField.svelte';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const values = $derived(form?.values ?? data.values);
	const problems = $derived(form?.problems ?? {});
</script>

<svelte:head>
	<title>{data.name} - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title={data.name}
		back={{ href: resolve('/expenses'), label: 'Expenses' }}
		description={data.summary}
	/>

	<h2>Change this expense</h2>
	<p class="muted" data-testid="expense-effect">
		{#if data.counting}
			This is lowering your safe-to-spend number. Changing the amount or the day changes it too.
		{:else}
			Your balance already includes this, so it is not lowering your number. Changing it only
			changes your list.
		{/if}
	</p>
	<form method="POST" action="?/save">
		<div class="field">
			<label for="expense-amount">Amount</label>
			<input
				id="expense-amount"
				name="amount"
				inputmode="decimal"
				autocomplete="off"
				defaultValue={values.amount || ''}
				aria-invalid={problems.amount ? 'true' : undefined}
				aria-describedby={problems.amount ? 'expense-amount-problem' : undefined}
			/>
			{#if problems.amount}<p class="problem" id="expense-amount-problem">{problems.amount}</p>{/if}
		</div>
		<div class="field">
			<label for="expense-note">What was it for? <span class="optional">(optional)</span></label>
			<input
				id="expense-note"
				name="note"
				autocomplete="off"
				defaultValue={values.note || ''}
				aria-invalid={problems.note ? 'true' : undefined}
				aria-describedby={problems.note ? 'expense-note-problem' : undefined}
			/>
			{#if problems.note}<p class="problem" id="expense-note-problem">{problems.note}</p>{/if}
		</div>
		<DateField
			id="expense-date"
			name="date"
			label="The day you spent it"
			value={values.date || data.values.date}
			max={data.today}
			problem={problems.date}
		/>
		<div class="actions">
			<button class="btn" type="submit">Save changes</button>
		</div>
	</form>

	<h2>Made a mistake?</h2>
	<!-- Removing is for good, so it asks first. A details element works without script. -->
	<form method="POST" action="?/remove">
		<details class="confirm">
			<summary>Remove this expense</summary>
			{#if data.counting}
				<p>It is deleted, and your safe-to-spend number goes back up by its amount.</p>
			{:else}
				<p>
					It is deleted from your list. Your balance already includes it, so your safe-to-spend
					number stays the same.
				</p>
			{/if}
			<button class="btn danger" type="submit">Yes, remove it</button>
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
