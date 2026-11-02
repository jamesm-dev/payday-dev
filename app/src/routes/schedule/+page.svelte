<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Pay and bills - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title="Pay and bills"
		description="Everything Payday knows is coming in and going out. Open one to change it, skip a single payment, or end it."
	/>

	{#each data.sections as section (section.kind)}
		<section aria-labelledby={`h-${section.kind}`}>
			<div class="section-head">
				<h2 id={`h-${section.kind}`}>{section.title}</h2>
				<a
					class="btn small secondary"
					href={resolve('/schedule/new/[kind]', { kind: section.kind })}
					aria-label={section.add}
				>
					<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
						<path d="M12 5v14M5 12h14" />
					</svg>
					Add
				</a>
			</div>
			{#if section.items.length === 0}
				<p class="muted">{section.empty}</p>
			{:else}
				<ul class="lines" data-testid={`list-${section.kind}`}>
					{#each section.items as item (item.id)}
						<li>
							<a
								class="row"
								href={resolve('/schedule/[id]', { id: item.id })}
								aria-labelledby={`name-${item.id}`}
								aria-describedby={`detail-${item.id} amount-${item.id}`}
							>
								<span class="main">
									<span class="name" id={`name-${item.id}`}>{item.name}</span>
									<span class="sub" id={`detail-${item.id}`}>
										{item.rule}.
										{#if item.ended}
											<span class="tag">Ended</span> {item.endsOn}
										{:else if item.next}
											Next: {item.next}
										{:else}
											No more payments coming.
										{/if}
										{#if item.group}<span class="label">{item.group}</span>{/if}
										{#if item.optional}<span class="label">Optional</span>{/if}
									</span>
								</span>
								<span class="money" id={`amount-${item.id}`}>{item.amount}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</main>

<style>
	/* The section's title on the left, its Add button on the right, level on one line. */
	.section-head {
		display: flex;
		gap: var(--space-4);
		align-items: center;
		justify-content: space-between;
		margin: var(--space-8) 0 var(--space-3);
	}

	section:first-of-type .section-head {
		margin-top: 0;
	}

	.section-head h2 {
		margin: 0;
	}

	.section-head svg {
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	/* The owner's own labels: quieter than a warning tag, since nothing is wrong. */
	.label {
		display: inline-block;
		margin-left: var(--space-1);
		padding: 0 var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
	}

	.name {
		display: block;
		font-weight: 600;
	}
</style>
