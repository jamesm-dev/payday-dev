<script lang="ts">
	let { codes }: { codes: string[] } = $props();
</script>

<ol class="codes" aria-label="Recovery codes">
	{#each codes as code (code)}
		<li data-testid="recovery-code"><code>{code}</code></li>
	{/each}
</ol>

<style>
	.codes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: var(--space-2);
		margin: var(--space-4) 0;
		padding: 0;
		list-style: none;
	}

	li {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background: var(--color-surface-2);
	}

	code {
		font-family: var(--font-mono);
		font-size: var(--text-base);
		letter-spacing: 0.04em;
		white-space: nowrap;
	}
</style>
