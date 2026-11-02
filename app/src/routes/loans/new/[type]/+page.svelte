<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import LoanFields from '#lib/loans/LoanFields.svelte';
	import { TYPE_WORDS } from '#lib/loans/words.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>{TYPE_WORDS[data.type].title} - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title={TYPE_WORDS[data.type].title}
		back={{ href: resolve('/loans/new'), label: 'Kinds of loan' }}
	/>
	<form method="POST" data-type={data.type}>
		<LoanFields
			type={data.type}
			values={form?.values ?? data.values}
			problems={form?.problems ?? {}}
			items={data.items}
		/>
		<div class="actions">
			<button class="btn" type="submit">Save this loan</button>
			<a class="btn quiet" href={resolve('/loans')}>Cancel</a>
		</div>
	</form>
</main>
