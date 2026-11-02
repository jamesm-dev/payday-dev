<script lang="ts">
	import type { Snippet } from 'svelte';

	/*
	 * A "more" menu behind a ⋮ button, for actions a card offers but rarely needs on show. A <details>,
	 * so it opens, and its links work, with no script at all and from the keyboard. Escape, a tap
	 * anywhere else and choosing an item close it: #lib/ui/menus.js, loaded on every page by the
	 * layout, because pages such as the Plan send no other JavaScript.
	 */
	let {
		label,
		heading,
		testid,
		children
	}: {
		/** What the button opens, said in full: it shows only the ⋮. */
		label: string;
		/** A small title over the items. */
		heading?: string;
		/** On the list, so a test can find the items. */
		testid?: string;
		children: Snippet;
	} = $props();
</script>

<details class="kebab">
	<summary aria-label={label}>
		<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<circle cx="12" cy="5" r="1.75" />
			<circle cx="12" cy="12" r="1.75" />
			<circle cx="12" cy="19" r="1.75" />
		</svg>
	</summary>
	<div class="kebab-panel">
		{#if heading}<p class="kebab-heading">{heading}</p>{/if}
		<ul class="kebab-items" data-testid={testid}>
			{@render children()}
		</ul>
	</div>
</details>

<style>
	.kebab {
		position: relative;
	}

	summary {
		display: grid;
		place-items: center;
		width: var(--control-height-sm);
		height: var(--control-height-sm);
		border-radius: var(--radius-pill);
		color: var(--color-text-muted);
		list-style: none;
		cursor: pointer;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover,
	.kebab[open] summary {
		background: var(--color-surface-2);
		color: var(--color-text);
	}

	summary:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	summary svg {
		width: 1.25rem;
		height: 1.25rem;
		fill: currentColor;
	}

	/* Under the button, its right edge on the button's, above whatever follows. */
	.kebab-panel {
		position: absolute;
		top: calc(100% + var(--space-1));
		right: 0;
		z-index: 10;
		min-width: 12rem;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background: var(--color-surface-2);
		box-shadow: 0 var(--space-3) var(--space-8) color-mix(in srgb, var(--color-bg) 70%, transparent);
	}

	.kebab-heading {
		margin: 0;
		padding: var(--space-2) var(--space-3) var(--space-1);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.kebab-items {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Each item is a full-width row, at least a tap target tall. */
	.kebab-items :global(a) {
		display: flex;
		align-items: center;
		min-height: var(--control-height-sm);
		padding: 0 var(--space-3);
		border-radius: var(--radius-2);
		color: var(--color-text);
		font-weight: 500;
		text-decoration: none;
	}

	.kebab-items :global(a:hover) {
		background: var(--color-surface);
	}

	.kebab-items :global(a:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}
</style>
