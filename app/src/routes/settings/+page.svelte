<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Settings - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader title="Settings" />

	<ul class="lines">
		<li>
			<a class="row" href={resolve('/settings/reminders')}>
				<span class="main">
					Reminders
					<span class="sub">Get a nudge on payday to do your check-in.</span>
				</span>
			</a>
		</li>
		<li>
			<a class="row" href={resolve('/settings/security')}>
				<span class="main">
					Security
					<span class="sub">Your password, a PIN or face for this device, and recovery codes.</span>
				</span>
			</a>
		</li>
		<li>
			<a class="row" href={resolve('/settings/backup')}>
				<span class="main">
					Backup
					<span class="sub" data-testid="backup-sub">
						{#if !data.backupEver}
							You have not downloaded a backup yet. Download one now.
						{:else if data.backupDue}
							Your last backup is more than two weeks old. Download a new one.
						{:else}
							Download your whole budget as one file, or restore one.
						{/if}
					</span>
				</span>
			</a>
		</li>
		<li>
			<a class="row" href={resolve('/about')}>
				<span class="main">
					About Payday
					<span class="sub">What it is, how it was built, and who made it.</span>
				</span>
			</a>
		</li>
	</ul>

	<!-- The Security page's own sign-out action: ends this session only, then shows sign-in. -->
	<form class="signout" method="POST" action="/settings/security?/signout">
		<button class="btn secondary wide" type="submit">Sign out</button>
	</form>
	<p class="muted">Signs out this device only. To sign out everywhere, open Security.</p>
</main>

<style>
	.signout {
		margin-top: var(--space-10);
	}
</style>
