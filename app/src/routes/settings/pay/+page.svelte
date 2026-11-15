<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import RhythmFields, { type RhythmValues } from '#lib/setup/RhythmFields.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const failed = $derived(form && 'problems' in form ? form : null);
	const saved = $derived(form && 'saved' in form ? form.saved : null);
	const values = $derived<RhythmValues>(failed?.values ?? data.values);
</script>

<svelte:head>
	<title>How often you are paid - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title="How often you are paid"
		back={{ href: resolve('/settings'), label: 'Settings' }}
	/>

	{#if !data.hasPay}
		<p data-testid="no-pay">
			You have not added your pay yet. <a href={resolve('/schedule/new/[kind]', { kind: 'income' })}
				>Add your pay</a
			> first.
		</p>
	{:else}
		<p data-testid="current-rhythm">You are paid: <strong>{data.current}</strong>.</p>
		{#if data.waiting}
			<Notice tone="caution" role="status">
				<p data-testid="waiting">
					A change is waiting. Your next payday stays as it is{data.lastOldPayday
						? ` (${data.lastOldPayday})`
						: ''}. From {data.waiting.from} you are paid: {data.waiting.rule}.
				</p>
			</Notice>
		{/if}

		{#if data.updateUnderWay}
			<Notice tone="caution" role="status">
				<p data-testid="update-under-way">
					You have a payday update under way. A change here does not touch it: you finish it the way
					it started.
				</p>
			</Notice>
		{/if}

		{#if saved}
			<Notice tone="done" role="status">
				<p data-testid="saved">
					Saved. You are paid: {saved.rule}. Your next payday, {saved.lastOldPayday}, stays as it
					was. The new schedule starts after it, with {saved.firstNewPayday}. Download the calendar
					file again to get the new dates.
				</p>
			</Notice>
		{/if}

		<h2>Change it</h2>
		<p class="muted">
			Your next payday stays as it is. The new schedule starts after it. Your pay and the rest of
			your budget stay the same.
		</p>
		<form method="POST" action="?/change">
			<RhythmFields {values} problems={failed?.problems ?? {}} />
			<div class="actions">
				<button class="btn" type="submit">Save how often I am paid</button>
			</div>
		</form>
	{/if}
</main>
