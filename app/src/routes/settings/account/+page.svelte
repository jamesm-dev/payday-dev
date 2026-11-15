<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import Notice from '#lib/ui/Notice.svelte';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const problem = $derived(form && 'delete' in form ? form.delete : null);
	const wrongWord = $derived(Boolean(form && 'field' in form && form.field === 'confirm'));
</script>

<svelte:head>
	<title>Your account - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader title="Your account" />

	<section class="card" aria-labelledby="data-title">
		<h2 id="data-title">Your data</h2>
		<p>
			Download my data: <a href={resolve('/settings/backup')}>go to Backup</a>. It is your whole
			budget in one file.
		</p>
		<p>
			Read the <a href={resolve('/privacy')}>privacy notice</a> and the
			<a href={resolve('/terms')}>terms of use</a>.
		</p>
	</section>

	<section class="card delete" aria-labelledby="delete-title">
		<h2 id="delete-title">Delete my account</h2>
		<p>
			This removes your budget, your email, your password, your passkeys and your recovery codes
			from Payday. It signs you out on every device.
			<strong>It cannot be undone.</strong>
		</p>
		<p>
			We suggest you <a href={resolve('/settings/backup')}>download a backup</a> first. It is the only
			way to get your budget back.
		</p>
		{#if !data.confirmed}
			<p class="muted">
				<a href="{resolve('/settings/security')}#confirm">Confirm it is you</a> first, then come back
				here.
			</p>
		{/if}
		<form method="POST" action="?/delete">
			<label class="field">
				<span>Type DELETE to confirm</span>
				<input
					name="confirm"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					required
					aria-invalid={wrongWord ? 'true' : undefined}
					aria-describedby={problem ? 'delete-problem' : undefined}
				/>
			</label>
			<div class="actions">
				<button class="btn danger" type="submit">Delete my account for good</button>
			</div>
		</form>
		{#if problem}
			<Notice tone="danger" role="alert" id="delete-problem"><p>{problem}</p></Notice>
		{/if}
	</section>
</main>

<style>
	.card {
		margin: 0 0 var(--space-4);
	}

	.card :global(h2) {
		margin: 0 0 var(--space-3);
	}

	.card > p {
		margin: 0 0 var(--space-3);
	}

	.card .actions {
		margin-top: var(--space-3);
	}

	.card form > .field {
		margin: 0 0 var(--space-3);
	}

	a:not(.btn) {
		color: var(--color-accent);
	}

	/* Set apart, as Start over and the restore are. */
	.delete {
		margin-top: var(--space-8);
		border-color: var(--color-warn);
	}
</style>
