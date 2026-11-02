<script lang="ts">
	/** The Payday mark: an orange disc with a check. Decorative; the name beside it says Payday. */
	let { size = 24 }: { size?: number } = $props();
</script>

<svg class="mark" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
	<circle cx="12" cy="12" r="10" />
	<path d="M8 12.5 11 15.5 16.5 9" />
</svg>

<style>
	.mark {
		flex: none;
		fill: var(--color-accent);
	}

	.mark path {
		fill: none;
		stroke: var(--color-on-accent);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
