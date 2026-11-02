<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
</script>

<svelte:head>
	<title>About - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader title="About" back={{ href: resolve('/settings'), label: 'Settings' }} />

	<p class="lead">
		Payday tells you what is safe to spend until your next payday, after every bill, loan payment
		and the money held back for yearly bills. Log what you spend, check in on payday, and see when
		your loans end.
	</p>
	<p class="muted">
		It was planned and built with <strong>tateru</strong> (建てる, "to build"), a Claude Code workflow
		that takes a project from an idea to a spec, a roadmap and a working app.
	</p>

	<h2>Links</h2>
	<!-- Where each link goes is shown under its name, so it is clear the app is being left. -->
	<ul class="lines">
		<li>
			<a
				class="row"
				href="https://github.com/jamesm-dev/tateru.dev"
				rel="noopener noreferrer"
				data-testid="tateru-link"
			>
				<span class="main">
					tateru on GitHub
					<span class="sub">The workflow Payday was built with</span>
				</span>
			</a>
		</li>
		<li>
			<a
				class="row"
				href="https://github.com/jamesm-dev"
				rel="noopener noreferrer"
				data-testid="github-link"
			>
				<span class="main">
					James Malatabon on GitHub
					<span class="sub">github.com/jamesm-dev</span>
				</span>
			</a>
		</li>
		<li>
			<a
				class="row"
				href="https://buymeacoffee.com/jamesm.dev"
				rel="noopener noreferrer"
				data-testid="coffee-link"
			>
				<span class="main">
					Buy me a coffee
					<span class="sub">buymeacoffee.com/jamesm.dev</span>
				</span>
			</a>
		</li>
	</ul>
	<p class="muted thanks">If Payday helps you, a coffee is a lovely way to say so.</p>
</main>

<style>
	.lead {
		margin: 0 0 var(--space-4);
		font-size: var(--text-lg);
		line-height: var(--leading-body);
	}

	.thanks {
		margin-top: var(--space-4);
	}
</style>
