<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import { LOAN_TYPES } from '#lib/domain/loans.ts';
	import { TYPE_LABELS } from '#lib/loans/words.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const HELP = {
		'credit-card': 'Visa, Mastercard, a store card. Pays a minimum each month.',
		instalment: 'A car loan, student loan or personal loan, paid the same amount each time.',
		bnpl: 'Afterpay, Klarna, a shop plan. A few payments, usually no interest.',
		informal: 'Money borrowed from family or a friend.'
	} as const;

	/** The chosen schedule payment travels along as ?item=, which resolve() cannot build. */
	const kindHref = (type: (typeof LOAN_TYPES)[number]) =>
		data.item
			? `${resolve('/loans/new/[type]', { type })}?item=${encodeURIComponent(data.item.id)}`
			: resolve('/loans/new/[type]', { type });
</script>

<svelte:head>
	<title>Add a loan - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title="What kind of loan is it?"
		back={{ href: resolve('/loans'), label: 'What I owe' }}
	/>
	{#if data.item}
		<p class="muted" data-testid="from-item">
			You picked {data.item.name} from your schedule. It will be connected to the loan you add, and its
			payments are not counted twice.
		</p>
	{/if}
	<ul class="lines" data-testid="kinds">
		{#each LOAN_TYPES as type (type)}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- kindHref() resolves it, then adds ?item= -->
				<a class="row" href={kindHref(type)}>
					<span class="main">{TYPE_LABELS[type]}<span class="sub">{HELP[type]}</span></span>
				</a>
			</li>
		{/each}
	</ul>
</main>
