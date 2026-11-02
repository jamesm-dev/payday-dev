<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Offline · Payday</title>
</svelte:head>

<main>
	<h1>You're offline</h1>
	<p>Payday needs a connection to show your number. It will be here when you're back online.</p>
	<p><a href={resolve('/')} data-sveltekit-reload>Try again</a></p>
</main>

<style>
	main {
		max-width: var(--content-width);
		margin: 0 auto;
		padding: var(--space-12) var(--space-6);
	}

	h1 {
		margin: 0 0 var(--space-4);
		font-size: var(--text-lg);
	}

	p {
		color: var(--color-text-muted);
	}

	a {
		color: var(--color-accent);
	}
</style>
