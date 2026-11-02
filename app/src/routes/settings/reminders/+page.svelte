<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import { keyBytes } from '#lib/reminders/subscribe.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const timeProblem = $derived(form && 'time' in form ? form.time?.problems.time : undefined);
	const status = $derived(data.status);

	let busy = $state(false);
	let message = $state('');
	// "Reminders are on." is the one happy answer; every other message says what went wrong.
	const messageTone = $derived(message === 'Reminders are on.' ? 'done' : 'danger');
	let canSubscribe = $state(true);
	let iphoneNeedsInstall = $state(false);

	onMount(() => {
		canSubscribe =
			'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
		const iphone =
			/iPhone|iPad|iPod/.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const installed =
			(navigator as Navigator & { standalone?: boolean }).standalone === true ||
			matchMedia('(display-mode: standalone)').matches;
		iphoneNeedsInstall = iphone && !installed;
	});

	async function turnOn() {
		if (!data.publicKey) return;
		busy = true;
		message = '';
		try {
			if (iphoneNeedsInstall || !canSubscribe) {
				message =
					'This phone cannot turn reminders on from here. On an iPhone, open Payday from your Home Screen first.';
				return;
			}
			// Asked for here, in answer to the tap: phones refuse a prompt that appears on its own.
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				message =
					'Reminders need your permission. Allow notifications for Payday in your phone settings, then try again.';
				return;
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription =
				(await registration.pushManager.getSubscription()) ??
				(await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: keyBytes(data.publicKey)
				}));
			const response = await fetch('/settings/reminders/subscribe', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(subscription.toJSON())
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				message = body?.message ?? 'Payday could not save your phone. Try again in a moment.';
				return;
			}
			await invalidateAll();
			message = 'Reminders are on.';
		} catch {
			message = 'Reminders could not be turned on. Try again in a moment.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Payday reminders - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader title="Payday reminders" back={{ href: resolve('/settings'), label: 'Settings' }} />

	<p class="intro" data-testid="explain">
		On every payday, at {data.time} ({data.zone}), your phone shows a short reminder. Tap it and
		your check-in opens. It takes about five minutes.
	</p>

	<section class="card" aria-labelledby="status-title" data-testid="reminder-status">
		<h2 id="status-title">
			{#if status.state === 'on'}
				Reminders are on
			{:else}
				Reminders are off
			{/if}
		</h2>
		{#if status.state === 'unavailable'}
			<p data-testid="status-text">{status.reason}</p>
			<p class="muted">
				The owner of this server can turn them on by setting the three VAPID values. Until then, use
				the calendar file below.
			</p>
		{:else if status.state === 'expired'}
			<p data-testid="status-text">
				Your phone stopped accepting reminders, so Payday removed it. Turn reminders on again below.
			</p>
		{:else if status.state === 'on'}
			<p data-testid="status-text">
				{status.phones === 1 ? 'One phone is' : `${status.phones} phones are`} set to be reminded.
			</p>
			{#if status.troubled}
				<p class="problem">
					The last reminder could not be delivered. If it keeps happening, turn reminders off and on
					again.
				</p>
			{/if}
		{:else}
			<p data-testid="status-text">Payday will not remind you until you turn them on.</p>
		{/if}
		{#if data.lastSent}
			<p class="muted" data-testid="last-sent">Last reminder sent: {data.lastSent}.</p>
		{:else if status.state !== 'unavailable'}
			<p class="muted" data-testid="last-sent">No reminder has been sent yet.</p>
		{/if}
	</section>

	{#if form && 'turnedOff' in form}
		<Notice tone="done" role="status"><p>Reminders are off.</p></Notice>
	{/if}

	{#if status.state !== 'unavailable'}
		<h2>Turn them on</h2>
		<p class="muted">
			On an iPhone, reminders only work from the app on your Home Screen: tap Share in Safari, then
			Add to Home Screen, and open Payday from there. Android works from the browser or the
			installed app.
		</p>
		{#if iphoneNeedsInstall}
			<Notice tone="caution" testid="install-first">
				<p>
					You are using Payday in the browser. Add it to your Home Screen and open it from there to
					turn reminders on.
				</p>
			</Notice>
		{/if}
		<div class="actions">
			<button class="btn" type="button" onclick={turnOn} disabled={busy}>
				{status.state === 'on' ? 'Turn on reminders for this phone' : 'Turn on reminders'}
			</button>
			{#if status.state === 'on'}
				<form method="POST" action="?/off" class="off-form">
					<button class="btn quiet" type="submit">Turn off reminders</button>
				</form>
			{/if}
		</div>
		{#if message}
			<Notice tone={messageTone} role="status" testid="subscribe-message"><p>{message}</p></Notice>
		{/if}
	{/if}

	<h2>When should it remind you?</h2>
	<form method="POST" action="?/time">
		<div class="field-row">
			<div class="field">
				<label for="reminder-time">Remind me at</label>
				<input
					id="reminder-time"
					name="time"
					type="time"
					defaultValue={(form && 'time' in form ? form.time?.value : '') || data.time}
					aria-invalid={timeProblem ? 'true' : undefined}
				/>
			</div>
			<button class="btn secondary" type="submit">Save the time</button>
		</div>
		<small class="hint">Your time zone is {data.zone}.</small>
		{#if timeProblem}<p class="problem">{timeProblem}</p>{/if}
		{#if form && 'saved' in form}
			<Notice tone="done" role="status"><p>Saved.</p></Notice>
		{/if}
	</form>

	<h2>No notifications? Use your calendar</h2>
	<p class="muted">
		This file has every payday for the next year, each with an alarm at {data.time}. Open it on your
		phone to add them to your calendar.
	</p>
	<div class="actions">
		<a
			class="btn secondary"
			href={resolve('/calendar.ics')}
			data-sveltekit-reload
			data-testid="ics-link">Download the calendar file</a
		>
	</div>
</main>

<style>
	/* The off form sits in .actions beside the primary button; it has no margin of its own. */
	.off-form {
		margin: 0;
	}

	.card h2 {
		margin-top: 0;
	}
</style>
