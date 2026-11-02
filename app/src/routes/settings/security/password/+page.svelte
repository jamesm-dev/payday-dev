<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const title = $derived(
		data.recovering ? 'Set a new password' : data.hasPassword ? 'Change password' : 'Set a password'
	);
</script>

<svelte:head>
	<title>{title} · Payday</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<p class="muted"><a href={resolve('/settings/security')}>Back to Security</a></p>
	<h1>{title}</h1>

	{#if data.recovering}
		<p>
			You signed in with a recovery code, so you can choose a new password without the old one. Do
			it now: this lasts 10 minutes.
		</p>
	{:else if data.canSkipCurrent}
		<p class="muted">
			You confirmed it is you a moment ago, so you can leave the current password empty.
		</p>
	{/if}
	<p class="muted">
		Changing it signs you out everywhere else. At least 12 characters; a few words in a row work
		well.
	</p>

	<form method="POST" action="?/change">
		<input type="hidden" name="next" value={data.next} />
		{#if data.hasPassword}
			<label class="field">
				<span>Current password{data.canSkipCurrent ? ' (optional right now)' : ''}</span>
				<input
					name="current"
					type="password"
					autocomplete="current-password"
					spellcheck="false"
					autocapitalize="off"
					required={!data.canSkipCurrent}
				/>
			</label>
		{/if}
		<label class="field">
			<span>New password</span>
			<input
				name="password"
				type="password"
				autocomplete="new-password"
				spellcheck="false"
				autocapitalize="off"
				required
			/>
		</label>
		<label class="field">
			<span>Type the new password again</span>
			<input
				name="again"
				type="password"
				autocomplete="new-password"
				spellcheck="false"
				autocapitalize="off"
				required
			/>
		</label>
		{#if form?.message}
			<Notice tone="danger" role="alert"><p>{form.message}</p></Notice>
		{/if}
		<button class="btn wide" type="submit">Save new password</button>
	</form>
</main>

<style>
	a {
		color: var(--color-accent);
	}
</style>
