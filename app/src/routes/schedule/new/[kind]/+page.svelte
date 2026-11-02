<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import ItemFields, { defaultRepeat } from '#lib/schedule/ItemFields.svelte';
	import LabelFields from '#lib/schedule/LabelFields.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const TITLES = { income: 'Add pay', bill: 'Add a bill', 'loan-payment': 'Add a loan payment' };
	const values = $derived(
		form?.values ?? { name: '', amount: '', repeat: defaultRepeat(data.kind), date: '', day: '' }
	);
</script>

<svelte:head>
	<title>{TITLES[data.kind]} - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title={TITLES[data.kind]}
		back={{ href: resolve('/schedule'), label: 'Pay and bills' }}
	/>
	<form method="POST" class="item-form">
		<ItemFields kind={data.kind} {values} problems={form?.problems ?? {}} />
		{#if data.kind !== 'income'}
			<LabelFields
				values={form?.labels ?? { group: '', optional: false }}
				groups={data.groups}
				problems={form?.problems ?? {}}
			/>
		{/if}
		<div class="actions">
			<button class="btn" type="submit">Save</button>
		</div>
	</form>
</main>
