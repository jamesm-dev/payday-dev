<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import Notice from '#lib/ui/Notice.svelte';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// A refused restore: the reason shows in its own card, and marks the field that was wrong.
	const problem = $derived(form && 'restore' in form ? form.restore : null);
	const field = $derived(form && 'field' in form ? form.field : null);
</script>

<svelte:head>
	<title>Backup - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader title="Backup" />

	<section class="card" aria-labelledby="download-title">
		<h2 id="download-title">Download a full backup</h2>
		{#if data.lastBackup}
			<p data-testid="last-backup">Last downloaded on {data.lastBackup}.</p>
		{:else}
			<p data-testid="last-backup">You have not downloaded a backup yet.</p>
		{/if}
		{#if data.due}
			<Notice tone="caution" role="status" testid="backup-due">
				<p>
					{data.lastBackup
						? 'It has been more than two weeks. Download a new backup so a lost phone does not lose your budget.'
						: 'Download one now, so a lost phone or a mistake does not lose your budget.'}
				</p>
			</Notice>
		{/if}
		<p class="muted">
			One file with your pay, bills, balance, check-ins, loans, paid marks and expenses, and your
			settings for them. <strong>It holds your whole budget in plain text</strong>, so keep it
			somewhere private. It never holds your password, devices or recovery codes.
		</p>
		{#if data.confirmed}
			<div class="actions">
				<a class="btn" href={resolve('/settings/backup/download')}>Download a full backup</a>
			</div>
		{:else}
			<p class="muted">
				<a href="{resolve('/settings/security')}#confirm">Confirm it is you</a> first, then come back
				here. It is asked for because the file holds everything.
			</p>
		{/if}
	</section>

	<section class="card restore" aria-labelledby="restore-title">
		<h2 id="restore-title">Restore a backup</h2>
		<p class="muted">
			Replaces your pay, bills, balance, check-ins, loans, paid marks and expenses with the ones in
			the file. What is in Payday now is deleted first, <strong>with no undo</strong>, so download a
			backup of it before you do this. Your password, devices and recovery codes stay, and you stay
			signed in.
		</p>
		{#if !data.confirmed}
			<p class="muted">
				<a href="{resolve('/settings/security')}#confirm">Confirm it is you</a> first.
			</p>
		{/if}
		<form method="POST" action="?/restore" enctype="multipart/form-data">
			<label class="field">
				<span>Backup file (up to {data.maxMb} MB)</span>
				<input
					name="file"
					type="file"
					accept=".json,application/json"
					required
					aria-invalid={field === 'file' ? 'true' : undefined}
					aria-describedby={problem ? 'restore-problem' : undefined}
				/>
			</label>
			<label class="field">
				<span>Type DELETE to confirm</span>
				<input
					name="confirm"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					required
					aria-invalid={field === 'confirm' ? 'true' : undefined}
				/>
			</label>
			<div class="actions">
				<button class="btn danger" type="submit">Replace my budget with this backup</button>
			</div>
		</form>
		{#if problem}
			<Notice tone="danger" role="alert" id="restore-problem"><p>{problem}</p></Notice>
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

	/* The card that replaces the budget is set apart, as Start over is. */
	.restore {
		margin-top: var(--space-8);
		border-color: var(--color-warn);
	}
</style>
