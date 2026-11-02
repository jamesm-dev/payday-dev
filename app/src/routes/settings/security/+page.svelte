<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import RecoveryCodes from '#lib/auth/RecoveryCodes.svelte';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import { confirmWithPasskey, createPasskey, PasskeyError } from '#lib/auth/passkey-client.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state(false);
	let problem = $state('');
	let added = $state(false);
	let nickname = $state('');

	// A refused "start over": the reason shows in its own card, and marks the word's field when the
	// word was what was wrong.
	const eraseProblem = $derived(form && 'erase' in form ? form.erase : null);
	const eraseField = $derived(Boolean(form && 'field' in form && form.field === 'confirm'));

	async function confirmOwner() {
		busy = true;
		problem = '';
		try {
			await confirmWithPasskey();
			await invalidateAll();
		} catch (error) {
			problem = error instanceof PasskeyError ? error.message : 'Something went wrong.';
		} finally {
			busy = false;
		}
	}

	async function addPasskey() {
		busy = true;
		problem = '';
		added = false;
		try {
			// A device that can unlock Payday hands over the account, so a session alone may not add one.
			// Unless this session just confirmed it is the owner, or signed in with a recovery code (the
			// way back in), confirm with this device first. Someone without a device yet confirms with
			// the password, in the form above.
			if (!data.canAdd) {
				if (data.passkeys.length === 0) {
					throw new PasskeyError(
						'Confirm with your password in the box above first, then add this device.'
					);
				}
				await confirmWithPasskey();
			}
			await createPasskey(nickname || 'This device');
			nickname = '';
			added = true;
			await invalidateAll();
		} catch (error) {
			problem = error instanceof PasskeyError ? error.message : 'Something went wrong.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Security · Payday</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<PageHeader title="Security" back={{ href: resolve('/settings'), label: 'Settings' }} />

	<section class="card">
		<h2>Password</h2>
		<p class="muted">
			{data.hasPassword
				? 'Your password opens Payday on any device.'
				: 'You have no password yet. Set one: it opens Payday on any device.'}
		</p>
		<div class="actions">
			<a class="btn secondary" href={resolve('/settings/security/password')}>
				{data.hasPassword ? 'Change password' : 'Set a password'}
			</a>
		</div>
	</section>

	<section class="card" id="confirm">
		<h2>Confirm it is you</h2>
		{#if data.confirmed}
			<Notice tone="done" role="status"><p>Confirmed. This lasts 5 minutes.</p></Notice>
		{:else}
			<p class="muted">
				Adding or removing a device, making new recovery codes, or starting over needs you to
				confirm it is you.
			</p>
			<form method="POST" action="?/confirm">
				<label class="field">
					<span>Password</span>
					<input
						name="password"
						type="password"
						autocomplete="current-password"
						spellcheck="false"
						autocapitalize="off"
						required
					/>
				</label>
				<div class="actions">
					<button class="btn secondary" type="submit">Confirm with your password</button>
					{#if data.passkeys.length > 0}
						<button class="btn secondary" type="button" onclick={confirmOwner} disabled={busy}>
							Confirm with this device's PIN, fingerprint or face
						</button>
					{/if}
				</div>
			</form>
		{/if}
		{#if form && 'message' in form && form.message}
			<Notice tone="danger" role="alert"><p>{form.message}</p></Notice>
		{/if}
	</section>

	<section class="card">
		<h2>Devices that unlock with a PIN, fingerprint or face</h2>
		<p class="muted">
			Optional (a passkey). A device you add can open Payday without typing the password. Phones
			from Apple and Google do not share them, so add each device you want.
			{#if data.hasPassword}
				Your password always works, so you can remove any of them.
			{:else}
				You have no password yet, so the last device stays until you set one.
			{/if}
		</p>
		{#if data.passkeys.length === 0}
			<p class="muted">No devices added yet.</p>
		{/if}

		<ul class="passkeys">
			{#each data.passkeys as passkey (passkey.id)}
				<li class="passkey" data-testid="passkey">
					<form method="POST" action="?/rename" class="field-row">
						<input type="hidden" name="id" value={passkey.id} />
						<label class="field">
							<span>Name</span>
							<input name="nickname" defaultValue={passkey.nickname} maxlength="40" required />
						</label>
						<button class="btn secondary" type="submit">Rename</button>
					</form>
					<p class="muted">
						Added {passkey.addedOn} · Last used {passkey.lastUsedOn ?? 'never'}
					</p>
					{#if !data.hasPassword && data.passkeys.length <= 1}
						<p class="muted">
							<a href={resolve('/settings/security/password')}>Set a password first</a>, then you
							can remove this device.
						</p>
					{:else}
						<form method="POST" action="?/remove">
							<input type="hidden" name="id" value={passkey.id} />
							<button
								class="btn danger small"
								type="submit"
								aria-label="Remove this device: {passkey.nickname}"
							>
								Remove this device
							</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section class="card">
		<h2>Add this device</h2>
		<div class="field-row">
			<label class="field">
				<span>Name this device</span>
				<input bind:value={nickname} maxlength="40" placeholder="Laptop" autocomplete="off" />
			</label>
			<button class="btn" type="button" onclick={addPasskey} disabled={busy}>
				Unlock with this device
			</button>
		</div>
		{#if problem}
			<Notice tone="danger" role="alert"><p>{problem}</p></Notice>
		{/if}
		{#if added}
			<Notice tone="done" role="status"><p>Device added.</p></Notice>
		{/if}
	</section>

	<section class="card">
		<h2>Recovery codes</h2>
		<p class="muted">
			{data.unusedCodes} of {data.totalCodes} unused. They are the way back in if you forget your password.
		</p>
		{#if data.newCodes}
			<p>
				<strong>Your new codes. This is the only time they are shown.</strong> The old ones no longer
				work.
			</p>
			<RecoveryCodes codes={data.newCodes} />
		{/if}
		<form method="POST" action="?/regenerate">
			<div class="actions">
				<button class="btn secondary" type="submit">Make new recovery codes</button>
			</div>
		</form>
	</section>

	<section class="card">
		<h2>Sessions</h2>
		<div class="actions">
			<form method="POST" action="?/signout">
				<button class="btn secondary" type="submit">Sign out</button>
			</form>
			<form method="POST" action="?/signoutEverywhere">
				<button class="btn danger" type="submit">Sign out everywhere</button>
			</form>
		</div>
	</section>

	<section class="card start-over" aria-labelledby="start-over-title">
		<h2 id="start-over-title">Start over</h2>
		<p class="muted">
			Deletes your pay, bills, balance, check-ins, loans, paid marks and reminders, then takes you
			back to setup. Your password, devices and recovery codes stay, and you stay signed in.
			<strong>There is no undo.</strong>
		</p>
		{#if !data.confirmed}
			<p class="muted"><a href="#confirm">Confirm it is you</a> first.</p>
		{/if}
		<form method="POST" action="?/erase">
			<label class="field">
				<span>Type DELETE to confirm</span>
				<input
					name="confirm"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					required
					aria-invalid={eraseField ? 'true' : undefined}
					aria-describedby={eraseProblem ? 'erase-problem' : undefined}
				/>
			</label>
			<div class="actions">
				<button class="btn danger" type="submit">Delete my budget and start over</button>
			</div>
		</form>
		{#if eraseProblem}
			<Notice tone="danger" role="alert" id="erase-problem"><p>{eraseProblem}</p></Notice>
		{/if}
	</section>
</main>

<style>
	/* Each section is a card: heading, text and actions sit --space-3 apart. */
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

	.card form:not(.field-row) > .field {
		margin: 0 0 var(--space-3);
	}

	.passkeys {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.passkey + .passkey {
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}

	.passkey :global(p) {
		margin: var(--space-3) 0;
	}

	a:not(.btn) {
		color: var(--color-accent);
	}

	/* The one card that cannot be undone is set apart, with its word as well as its colour. */
	.start-over {
		margin-top: var(--space-8);
		border-color: var(--color-warn);
	}
</style>
