<script lang="ts">
	import DateField from '#lib/ui/DateField.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import '#lib/styles/controls.css';
	import { onMount } from 'svelte';
	import HomeNumber from '#lib/home/HomeNumber.svelte';
	import ItemFields, { defaultRepeat, type ItemValues } from '#lib/schedule/ItemFields.svelte';
	import { guessCurrency, guessTimeZone } from '#lib/setup/browserDefaults.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** What the last submit said about this step, if it is still this step. */
	const failed = $derived(form && 'step' in form && form.step === data.step ? form : null);
	const problems = $derived<Record<string, string>>(failed?.problems ?? {});

	let currencySelect = $state<HTMLSelectElement>();
	let zoneSelect = $state<HTMLSelectElement>();

	// Prefill the first question from the browser, unless an answer was already saved.
	onMount(() => {
		if (data.step !== 'region' || data.saved.currency || failed) return;
		const currency = guessCurrency(navigator.language);
		if (currency && currencySelect) currencySelect.value = currency;
		const zone = guessTimeZone();
		if (zone && zoneSelect && data.timeZones.includes(zone)) zoneSelect.value = zone;
	});

	const blankItem = (kind: 'bill' | 'loan-payment'): ItemValues => ({
		name: '',
		amount: '',
		repeat: defaultRepeat(kind),
		date: '',
		day: ''
	});

	/** What was typed into the step's form when it came back with a problem. */
	const fieldValues = $derived<Record<string, string> | null>(
		failed && 'values' in failed ? failed.values : null
	);

	const itemValues = $derived<ItemValues>(
		fieldValues && 'name' in fieldValues
			? (fieldValues as ItemValues)
			: blankItem(data.step === 'loans' ? 'loan-payment' : 'bill')
	);
	const itemKind = $derived(data.step === 'loans' ? 'loan-payment' : 'bill');
	const addedNames = $derived(data.step === 'loans' ? data.added.loans : data.added.bills);
</script>

<svelte:head>
	<title>Set up Payday</title>
</svelte:head>

{#snippet back()}
	<button class="btn quiet" type="submit" form="setup-back">Back</button>
{/snippet}

<main class="page setup">
	<!-- Every finished step is saved, so signing out here loses nothing: signing in again carries on. -->
	<div class="setup-top">
		<p class="eyebrow" id="setup-progress" data-testid="progress">
			Step {data.stepNumber} of {data.stepCount}
		</p>
		<form method="POST" action="/settings/security?/signout">
			<button class="btn quiet small" type="submit">Sign out</button>
		</form>
	</div>
	<progress
		aria-labelledby="setup-progress"
		value={data.stepNumber}
		max={data.stepCount}
		class="bar"
	></progress>

	{#if data.step === 'welcome'}
		<h1>Let's set up Payday</h1>
		<p>
			Payday tells you one number: how much you can spend until your next payday without missing a
			bill.
		</p>
		<p>
			To work it out it needs your pay, your bills and what is in your account. This takes about 15
			minutes. Have your last two bank statements handy: they show most of your bills.
		</p>
		<p class="muted">You can stop at any point and carry on later, even on another device.</p>
		<form method="POST" action="?/start">
			<div class="actions">
				<button class="btn" type="submit">Start</button>
			</div>
		</form>
	{:else if data.step === 'region'}
		<h1>Your currency and time zone</h1>
		<p>
			This is so amounts look right and so "today" is today where you are. We have guessed from your
			browser; change it if it is wrong.
		</p>
		<form method="POST" action="?/region">
			<div class="field">
				<label for="setup-currency">Currency</label>
				<select
					id="setup-currency"
					name="currency"
					bind:this={currencySelect}
					aria-invalid={problems.currency ? 'true' : undefined}
				>
					{#each data.currencies as c (c.code)}
						<option
							value={c.code}
							selected={c.code === (fieldValues?.currency ?? data.saved.currency ?? 'USD')}
						>
							{c.code} - {c.name}
						</option>
					{/each}
				</select>
				<small class="hint">Only currencies that use cents or pence are listed.</small>
				{#if problems.currency}<p class="problem">{problems.currency}</p>{/if}
			</div>
			<div class="field">
				<label for="setup-timeZone">Time zone</label>
				<select
					id="setup-timeZone"
					name="timeZone"
					bind:this={zoneSelect}
					aria-invalid={problems.timeZone ? 'true' : undefined}
				>
					{#each data.timeZones as zone (zone)}
						<option
							value={zone}
							selected={zone === (fieldValues?.timeZone ?? data.saved.timeZone ?? 'UTC')}
						>
							{zone}
						</option>
					{/each}
				</select>
				{#if problems.timeZone}<p class="problem">{problems.timeZone}</p>{/if}
			</div>
			<div class="step-nav">
				{@render back()}
				<button class="btn" type="submit">Continue</button>
			</div>
		</form>
	{:else if data.step === 'pay'}
		<h1>Your pay</h1>
		<p>
			How much money lands in your account each payday, after tax? Look for the deposit on your bank
			statement.
		</p>
		<form method="POST" action="?/pay">
			<div class="field">
				<label for="setup-amount">Pay each payday</label>
				<input
					id="setup-amount"
					name="amount"
					inputmode="decimal"
					autocomplete="off"
					defaultValue={fieldValues?.amount || data.pay?.amount || ''}
					aria-invalid={problems.amount ? 'true' : undefined}
				/>
				<small class="hint">For example: 1,850.00</small>
				{#if problems.amount}<p class="problem">{problems.amount}</p>{/if}
			</div>
			<DateField
				id="setup-date"
				name="date"
				label="Your last or next payday"
				value={fieldValues?.date || data.pay?.date}
				hint="Pick a payday, past or coming. Payday is then every 2 weeks from that day."
				problem={problems.date}
			/>
			<div class="step-nav">
				{@render back()}
				<button class="btn" type="submit">Continue</button>
			</div>
		</form>
	{:else if data.step === 'balance'}
		<h1>What is in your account today?</h1>
		<p>Open your bank app and type in the balance it shows right now.</p>
		<form method="POST" action="?/balance">
			<div class="field">
				<label for="setup-amount">Balance</label>
				<input
					id="setup-amount"
					name="amount"
					inputmode="decimal"
					autocomplete="off"
					defaultValue={fieldValues?.amount || data.balance?.amount || ''}
					aria-invalid={problems.amount ? 'true' : undefined}
				/>
				<small class="hint">For example: 2,300.00. If you are overdrawn, start with a minus.</small>
				{#if problems.amount}<p class="problem">{problems.amount}</p>{/if}
			</div>
			<DateField
				id="setup-asOf"
				name="asOf"
				label="True on"
				value={fieldValues?.asOf ?? data.today}
				max={data.today}
				hint="Today, unless the number you have is from an earlier day."
				problem={problems.asOf}
			/>
			<div class="step-nav">
				{@render back()}
				<button class="btn" type="submit">Continue</button>
			</div>
		</form>
	{:else if data.step === 'bills' || data.step === 'loans'}
		{#if data.step === 'bills'}
			<h1>Your bills</h1>
			<p>Add them one at a time: anything you have to pay on a regular day.</p>
			<p class="muted">
				For example: rent, phone, internet, insurance, subscriptions. Yearly bills, like car
				insurance, are saved for a little each payday so they never catch you out. Forgotten one? A
				bill can be added later from Pay and bills.
			</p>
		{:else}
			<h1>Loan payments</h1>
			<p>Do you pay off a loan in regular payments? Add them one at a time.</p>
			<p class="muted">
				For example: a car loan, a credit card minimum, a pay-later plan. None? Tap "That's all".
				Loan payments can be added later too.
			</p>
		{/if}

		{#if addedNames.length > 0}
			<section aria-label="Added so far" data-testid="added">
				<h2>Added so far</h2>
				<ul class="lines">
					{#each addedNames as name, i (i)}
						<li><span class="main">{name}</span></li>
					{/each}
				</ul>
			</section>
		{/if}

		<form method="POST" class="item-form" action="?/add">
			<ItemFields kind={itemKind} values={itemValues} {problems} />
			<div class="actions">
				<button class="btn secondary" type="submit">Add another</button>
			</div>
			<div class="step-nav">
				{@render back()}
				<button class="btn" type="submit" formaction="?/finish">That's all</button>
			</div>
		</form>
	{:else if data.step === 'done'}
		<h1>You're all set</h1>
		{#if data.home?.state === 'ready'}
			<p>This is what you can spend until your next payday.</p>
			<HomeNumber view={data.home} />
			<form method="POST" action="?/complete" class="complete-form">
				<div class="step-nav">
					{@render back()}
					<button class="btn" type="submit">Open Payday</button>
				</div>
			</form>
		{:else}
			<Notice tone="caution">
				<p>
					Something is missing, so there is no number yet. Go back and check your pay and balance.
				</p>
			</Notice>
			<div class="step-nav">{@render back()}</div>
		{/if}
	{/if}

	<!-- The one Back form, empty: each step's Back button submits it from its own row (form=…), so
	     going back never sends, or checks, what was typed into the step. -->
	{#if data.step !== 'welcome'}
		<form method="POST" action="?/back" id="setup-back"></form>
	{/if}

	<p class="muted saved-note">
		Your answers are saved as you go. You can close this and come back: it picks up right here.
	</p>
</main>

<style>
	/* Step N of M on the left, Sign out on the right. */
	.setup-top {
		display: flex;
		gap: var(--space-4);
		justify-content: space-between;
		align-items: center;
	}

	.setup-top .eyebrow,
	.setup-top form {
		margin: 0;
	}

	/* Step N of M, with a bar under it: accent on surface-2. */
	.bar {
		appearance: none;
		display: block;
		width: 100%;
		height: 0.375rem;
		margin: var(--space-2) 0 var(--space-6);
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--color-surface-2);
		color: var(--color-accent);
		overflow: hidden;
	}

	.bar::-webkit-progress-bar {
		background: var(--color-surface-2);
	}

	.bar::-webkit-progress-value {
		border-radius: var(--radius-pill);
		background: var(--color-accent);
	}

	.bar::-moz-progress-bar {
		border-radius: var(--radius-pill);
		background: var(--color-accent);
	}

	.eyebrow {
		font-size: var(--text-sm);
	}

	.saved-note {
		margin-top: var(--space-6);
	}

	/* A step's own buttons, one width, centred on one line: Back at the left edge, the way on at the
	   right edge. On a phone they share the row evenly. */
	.step-nav {
		display: flex;
		gap: var(--space-3);
		justify-content: space-between;
		align-items: center;
		margin-top: var(--space-6);
	}

	.step-nav .btn {
		flex: 0 1 12rem;
	}
</style>
