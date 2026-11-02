<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Vite replaces import.meta.env.DEV at build time, so in a production build this import is dead
	// code and the dashboard is never compiled into the client. It adds nothing to the app's own
	// JavaScript or its performance budget. (The server half 404s in production; see the load.)
	const dashboard = import.meta.env.DEV ? import('#lib/management/Dashboard.svelte') : null;
</script>

<svelte:head>
	<title>Management · Payday</title>
	<!-- Its own entry, never indexed: the roadmap, blockers and names are not for search engines. -->
	<meta name="robots" content="noindex" />
</svelte:head>

{#if dashboard}
	{#await dashboard}
		<p>Loading…</p>
	{:then { default: Dashboard }}
		<Dashboard {data} />
	{/await}
{/if}
