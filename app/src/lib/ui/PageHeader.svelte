<script lang="ts">
	import type { Snippet } from 'svelte';

	/** The top of a page: a way back, the title, a plain sentence under it, and one action. */
	let {
		title,
		back,
		description,
		action
	}: {
		title: string;
		back?: { href: string; label: string };
		description?: string;
		action?: Snippet;
	} = $props();
</script>

<header class="page-header">
	{#if back}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller passes a resolve()d href -->
		<a class="back-link" href={back.href} aria-label={`Back to ${back.label}`}>{back.label}</a>
	{/if}
	<div class="title-row">
		<h1>{title}</h1>
		{#if action}<div class="action">{@render action()}</div>{/if}
	</div>
	{#if description}<p class="description">{description}</p>{/if}
</header>

<style>
	.page-header {
		margin-bottom: var(--space-6);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-height-sm);
		margin-bottom: var(--space-1);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
		text-decoration: none;
	}

	.back-link::before {
		content: '';
		box-sizing: border-box;
		width: var(--space-2);
		height: var(--space-2);
		border-bottom: 2px solid currentColor;
		border-left: 2px solid currentColor;
		transform: rotate(45deg);
	}

	.back-link:hover {
		color: var(--color-text);
	}

	.title-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	/* The page's own h1 rules live in controls.css; this keeps the header correct without them. */
	.title-row h1 {
		margin: 0;
		font-size: var(--text-2xl);
		font-weight: 600;
		line-height: var(--leading-tight);
	}

	.description {
		margin: var(--space-2) 0 0;
		color: var(--color-text-muted);
		font-size: var(--text-base);
	}

	@media (min-width: 48rem) {
		.title-row {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-4);
		}
	}
</style>
