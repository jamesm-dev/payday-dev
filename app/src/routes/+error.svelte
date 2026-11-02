<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	const missing = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{page.status} · Payday</title>
</svelte:head>

<main class="page">
	<svg class="icon" viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
		<circle cx="12" cy="12" r="9" />
		<path d="M12 7.5v5.5M12 16.2v.1" />
	</svg>
	<h1>{missing ? "We can't find that page" : 'Something went wrong'}</h1>
	<p>
		{missing
			? 'It may have moved, or the link is not quite right.'
			: (page.error?.message ?? 'Please try again in a moment.')}
	</p>
	<div class="actions">
		<a class="btn" href={resolve('/')} data-sveltekit-reload>Go to Home</a>
	</div>
	{#if page.error?.requestId}
		<p class="reference">Reference: <code>{page.error.requestId}</code></p>
	{/if}
</main>

<style>
	.icon {
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
		margin-bottom: var(--space-4);
	}

	.reference {
		margin-top: var(--space-8);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	code {
		font-family: var(--font-mono);
	}
</style>
