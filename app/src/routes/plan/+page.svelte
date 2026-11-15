<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import PaycheckCard from '#lib/plan/PaycheckCard.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Your next paychecks - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title="Your next six paychecks"
		description="Each paycheck pays for everything up to your following payday. A bill due on a payday comes out of the paycheck before it. Yearly and quarterly bills are saved for a little each payday."
	/>
	<p class="muted explain">
		Did you pay a bill before its day? Tap Paid early. This takes it off your number now. The
		paycheck will not keep money for it. Your list marks it with a /, and your next payday update
		has it ticked already. Tapped by mistake? Tap Undo paid early and the money comes back.
	</p>
	{#if form?.problems?.paid}
		<Notice tone="danger" role="alert"><p>{form.problems.paid}</p></Notice>
	{/if}

	{#if data.plan.state === 'empty'}
		<Notice tone="caution" title="No paychecks to show">
			<p>Add your pay to the schedule, and your paychecks appear here.</p>
			{#snippet detail()}
				<a class="btn small" href={resolve('/schedule')}>Open the schedule</a>
			{/snippet}
		</Notice>
	{:else}
		<div class="paychecks" data-testid="paychecks">
			{#each data.plan.paychecks as paycheck (paycheck.iso)}
				<PaycheckCard {paycheck} heading marking />
			{/each}
		</div>
	{/if}

	<p class="more"><a href={resolve('/loans')}>What I owe, and when I will be free of it</a></p>
</main>

<style>
	.explain {
		margin: 0 0 var(--space-6);
	}

	.more {
		margin-top: var(--space-8);
		font-size: var(--text-sm);
	}

	.more a {
		color: var(--color-text-muted);
	}
</style>
