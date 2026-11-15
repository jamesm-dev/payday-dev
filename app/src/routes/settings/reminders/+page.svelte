<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const timeProblem = $derived(form && 'time' in form ? form.time?.problems.time : undefined);
</script>

<svelte:head>
	<title>Payday reminders - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader title="Payday reminders" back={{ href: resolve('/settings'), label: 'Settings' }} />

	<p class="intro" data-testid="explain">
		Add your paydays to your calendar. On every payday, at {data.time} ({data.zone}), your calendar
		reminds you to do your payday update. It takes about five minutes.
	</p>

	<h2>Add your paydays to your calendar</h2>
	<p class="muted">
		This file has every payday for the next year, each with an alarm at {data.time}. Open it on your
		phone or computer to add them to your calendar. Download it again once a year, or after you
		change your pay schedule.
	</p>
	<div class="actions">
		<a class="btn" href={resolve('/calendar.ics')} data-sveltekit-reload data-testid="ics-link"
			>Download the calendar file</a
		>
	</div>

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
			<Notice tone="done" role="status"
				><p>Saved. Download the calendar file again to use the new time.</p></Notice
			>
		{/if}
	</form>
</main>
