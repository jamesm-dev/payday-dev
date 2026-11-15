<script lang="ts">
	import '#lib/styles/controls.css';
	import Notice from '#lib/ui/Notice.svelte';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const view = $derived(data.view);

	/** What the last submit said about this step, if it is still this step. */
	const failed = $derived(form && 'step' in form && form.step === view.step ? form : null);
	const problems = $derived<Record<string, string>>(failed?.problems ?? {});
	const values = $derived<Record<string, string>>(failed?.values ?? {});
</script>

<svelte:head>
	<title>Payday update - Payday</title>
</svelte:head>

{#snippet moves(canGoBack: boolean)}
	<div class="moves">
		{#if canGoBack}
			<form method="POST" action="?/back">
				<button class="btn quiet wide" type="submit">Go back</button>
			</form>
		{/if}
		<!-- Stopping throws the answers away, so it asks first. A details element works without script. -->
		<details class="confirm">
			<summary>Stop this payday update</summary>
			<form method="POST" action="?/discard">
				<p>If you stop, Payday deletes your answers. You can start again at any time.</p>
				<button class="btn danger wide" type="submit">Yes, stop this payday update</button>
			</form>
		</details>
	</div>
	<p class="muted saved-note">
		Payday saves your answers as you go. You can close this page and come back later.
	</p>
{/snippet}

{#snippet continueButton()}
	<div class="actions">
		<button class="btn" type="submit">Next</button>
	</div>
{/snippet}

<main class="page">
	{#if view.step === 'start'}
		<PageHeader
			title="Payday update"
			description="Answer a few questions. It takes about five minutes. At the end, you see what you spent and what comes before your next payday."
		/>
		{#if view.payday}
			<p class="note" data-testid="payday-note">
				Today is payday. This is a good time for your payday update.
			</p>
		{/if}
		<p class="muted">
			{#if view.last}
				Your last payday update was on {view.last.date}. Your balance then was {view.last.balance}.
			{:else}
				This is your first payday update. It starts from the balance you gave on {view.since}.
			{/if}
		</p>
		<p class="muted">Open your bank app. You need the balance of your account.</p>
		<form method="POST" action="?/start">
			<div class="actions">
				<button class="btn" type="submit">Start my payday update</button>
				<a class="btn secondary" href={resolve('/checkin/history')}>Past payday updates</a>
			</div>
		</form>
	{:else}
		<p class="eyebrow" id="checkin-progress" data-testid="progress">
			Step {view.stepNumber} of {view.stepCount}
		</p>
		<progress
			aria-labelledby="checkin-progress"
			value={view.stepNumber}
			max={view.stepCount}
			class="bar"
		></progress>

		{#if view.step === 'pay'}
			<PageHeader title="Did you get your pay?" />
			{#if view.scheduled}
				<p>
					Since {view.since}, you should have received {view.scheduled}.
				</p>
				<ul class="lines">
					{#each view.scheduledLines as line, i (i)}
						<li>
							<span class="main">{line.name}<span class="sub">{line.date}</span></span>
							<span class="money">{line.amount}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p>No pay was expected since {view.since}.</p>
			{/if}
			<form method="POST" action="?/pay">
				<fieldset class="choices">
					<legend>Is the money in your account?</legend>
					<label class="choice">
						<input
							type="radio"
							name="landed"
							value="yes"
							checked={(values.landed || view.landed) === 'yes'}
						/>
						<span>Yes, I got it</span>
					</label>
					<label class="choice">
						<input
							type="radio"
							name="landed"
							value="no"
							checked={(values.landed || view.landed) === 'no'}
						/>
						<span>No, not yet</span>
					</label>
					{#if problems.landed}<p class="problem">{problems.landed}</p>{/if}
				</fieldset>
				<div class="field">
					<label for="pay-amount">How much did you get?</label>
					<input
						id="pay-amount"
						name="amount"
						inputmode="decimal"
						autocomplete="off"
						value={values.amount ?? view.amount}
						aria-describedby="pay-hint"
						aria-invalid={problems.amount ? 'true' : undefined}
					/>
					<small class="hint" id="pay-hint"
						>Change this if you got a different amount. If you got no pay, ignore this box.</small
					>
					{#if problems.amount}<p class="problem">{problems.amount}</p>{/if}
				</div>
				{@render continueButton()}
			</form>
			{@render moves(false)}
		{:else if view.step === 'balance'}
			<PageHeader
				title="How much money is in your account?"
				description="Your balance is the money in your account. Look in your bank app and type the balance you see now."
			/>
			<form method="POST" action="?/balance">
				<div class="field-row">
					<div class="field">
						<label for="balance">Balance in your account</label>
						<input
							id="balance"
							name="balance"
							inputmode="decimal"
							autocomplete="off"
							value={values.balance ?? view.balance}
							aria-describedby="balance-hint"
							aria-invalid={problems.balance ? 'true' : undefined}
						/>
					</div>
					<button class="btn" type="submit">Next</button>
				</div>
				<small class="hint" id="balance-hint"
					>Use numbers, like 2,300.00. If your account is below zero, start with a minus (-).</small
				>
				{#if problems.balance}<p class="problem">{problems.balance}</p>{/if}
			</form>
			{@render moves(true)}
		{:else if view.step === 'spending'}
			<PageHeader title="What you spent" />
			<p class="spending" data-testid="spending">{view.spending.headline}</p>
			<dl class="sums" data-testid="spending-sums">
				<div>
					<dt>Balance on {view.baseDate}</dt>
					<dd>{view.baseBalance}</dd>
				</div>
				<div>
					<dt>Pay you got</dt>
					<dd>+ {view.pay}</dd>
				</div>
				<div>
					<dt>Payments you paid</dt>
					<dd>- {view.paid}</dd>
				</div>
				<div class="total">
					<dt>Money you should have</dt>
					<dd data-testid="expected">{view.expected}</dd>
				</div>
				<div class="total">
					<dt>Money you have</dt>
					<dd data-testid="actual">{view.actual}</dd>
				</div>
			</dl>
			<p class="muted">
				{view.spending.negative ? 'The difference' : 'Spending'} is the money you should have minus the
				money you have. This counts every payment as paid. The next step checks that.
			</p>
			{#if view.logged}
				<Notice tone="done" title="What you logged" level={3} testid="logged-so-far">
					{#if view.comparison}
						<p>
							You logged <strong>{view.comparison.logged}</strong> since your last balance. Your
							bank shows
							<strong>{view.comparison.spent}</strong> spent. {view.comparison.sentence}
						</p>
					{:else}
						<p>
							You logged <strong>{view.logged}</strong> since your last balance. Card purchases are added
							when you check your cards. The last step compares everything.
						</p>
					{/if}
				</Notice>
			{/if}
			{#if view.hasCard}
				<p class="muted" data-testid="card-counted">
					Payday counts credit card purchases in a later step. There you check what you owe on the
					card.
				</p>
			{:else}
				<Notice tone="caution" testid="card-note">
					<p>
						Credit card spending is counted only when you pay the card. Until then, this number is
						lower than your real spending.
					</p>
				</Notice>
			{/if}
			<form method="POST" action="?/spending">
				{@render continueButton()}
			</form>
			{@render moves(true)}
		{:else if view.step === 'payments'}
			<PageHeader title="Did you make your payments?" />
			{#if view.lines.length === 0 && view.early.length === 0}
				<p>No payments were due since {view.since}. No old payments are waiting.</p>
			{:else if view.lines.length === 0}
				<p>
					You paid these before they were due. You do not need to answer. Only change one if it did
					not go out.
				</p>
			{:else}
				<p>
					These payments were due since {view.since}. Say if each one is paid. Payday keeps money
					for a payment that is not paid. It asks you again next time.
				</p>
			{/if}
			<form method="POST" action="?/payments">
				{#each view.early as line (line.key)}
					{@const name = `status:${line.key}`}
					<fieldset class="choices payment" data-testid="payment-early">
						<legend>
							<span class="who">
								<span class="what">{line.name}</span>
								<span class="when"
									>{line.date}
									<span class="tag" data-testid="paid-early">Paid early on {line.paidOn}</span
									></span
								>
							</span>
							<span class="how-much">{line.amount}</span>
						</legend>
						<label class="choice">
							<input type="radio" {name} value="paid" checked />
							<span>Yes, paid</span>
						</label>
						<label class="choice">
							<input type="radio" {name} value="missed" />
							<span>No, it did not go out</span>
						</label>
					</fieldset>
				{/each}
				{#each view.lines as line (line.key)}
					{@const name = `status:${line.key}`}
					{@const chosen = values[line.key] ?? line.chosen}
					<fieldset class="choices payment" data-testid="payment">
						<legend>
							<span class="who">
								<span class="what">{line.name}</span>
								<span class="when"
									>{line.date}{#if line.carried}
										<span class="tag">Not paid before</span>{/if}</span
								>
							</span>
							<span class="how-much">{line.amount}</span>
						</legend>
						<label class="choice">
							<input type="radio" {name} value="paid" checked={chosen === 'paid'} />
							<span>Yes, paid</span>
						</label>
						<label class="choice">
							<input type="radio" {name} value="missed" checked={chosen === 'missed'} />
							<span>No, not paid</span>
						</label>
						{#if problems[name]}<p class="problem">{problems[name]}</p>{/if}
					</fieldset>
				{/each}
				{@render continueButton()}
			</form>
			{@render moves(true)}
		{:else if view.step === 'loans'}
			<PageHeader
				title="What do you owe now?"
				description="Look at your statement or app for each one. The box shows the amount Payday expects. If it is correct, press Next. If not, type the real amount."
			/>
			<form method="POST" action="?/loans">
				{#each view.lines as line (line.id)}
					{@const name = `balance:${line.id}`}
					<div class="field loan" data-testid="loan-line">
						<label for={`loan-${line.id}`}>
							<span class="what">{line.name}</span>
							<span class="when">{line.kind}</span>
						</label>
						<input
							id={`loan-${line.id}`}
							{name}
							inputmode="decimal"
							autocomplete="off"
							value={values[name] ?? line.value}
							aria-describedby={`loan-${line.id}-hint`}
							aria-invalid={problems[name] ? 'true' : undefined}
						/>
						<small class="hint" id={`loan-${line.id}-hint`}>
							Payday expects {line.expected}.
							{#if line.isCard}A higher amount counts as spending on the card.{/if}
						</small>
						{#if problems[name]}<p class="problem">{problems[name]}</p>{/if}
					</div>
				{/each}
				{@render continueButton()}
			</form>
			{@render moves(true)}
		{:else if view.step === 'finish'}
			<PageHeader title="Ready to save" />
			<p class="spending" data-testid="spending-final">{view.spending.headline}</p>
			{#if view.cardPurchases}
				<p class="muted" data-testid="card-purchases">
					That includes {view.cardPurchases} bought on your credit card.
				</p>
			{/if}
			{#if view.comparison}
				<Notice tone="done" title="Logged and spent" level={3} testid="logged-compare">
					<p>
						You logged <strong>{view.comparison.logged}</strong> since your last balance, and you
						spent
						<strong>{view.comparison.spent}</strong>. {view.comparison.sentence}
					</p>
				</Notice>
			{/if}
			<dl class="sums">
				<div>
					<dt>Pay you got</dt>
					<dd>{view.pay}</dd>
				</div>
				<div>
					<dt>Money you should have</dt>
					<dd>{view.expected}</dd>
				</div>
				<div class="total">
					<dt>Money you have</dt>
					<dd>{view.actual}</dd>
				</div>
			</dl>
			<p class="muted">
				You paid {view.paidCount}
				{view.paidCount === 1 ? 'payment' : 'payments'}.
			</p>
			{#if view.missed.length > 0}
				<Notice tone="caution" title="Not paid yet" level={3} testid="missed-note">
					<p>Payday keeps money for these until you say they are paid in a payday update.</p>
					{#snippet detail()}
						<ul class="lines">
							{#each view.missed as line, i (i)}
								<li>
									<span class="main">{line.name}</span><span class="money">{line.amount}</span>
								</li>
							{/each}
						</ul>
					{/snippet}
				</Notice>
			{/if}
			<p>
				When you save, {view.actual} becomes your balance for today. Then you see the amount you can spend
				and what comes before your next payday.
			</p>
			<form method="POST" action="?/finish">
				<div class="actions">
					<button class="btn" type="submit">Save my payday update</button>
				</div>
			</form>
			{@render moves(true)}
		{/if}
	{/if}
</main>

<style>
	.note {
		margin: var(--space-4) 0;
		padding: var(--space-3) var(--space-4);
		border-left: var(--space-1) solid var(--color-accent);
		background: var(--color-surface);
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

	.spending {
		margin: var(--space-2) 0 var(--space-4);
		font-size: var(--text-lg);
		font-weight: 700;
	}

	.sums {
		margin: var(--space-4) 0;
	}

	.sums > div {
		display: flex;
		gap: var(--space-4);
		justify-content: space-between;
		padding: var(--space-2) 0;
	}

	/* A line between two sums only, as in every list. */
	.sums > div + div {
		border-top: 1px solid var(--color-border);
	}

	.sums > div.total {
		font-weight: 600;
	}

	.sums dt,
	.sums dd {
		margin: 0;
	}

	.sums dd {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.payment {
		margin: var(--space-6) 0;
	}

	/* One line per payment: name and date on the left, the amount on the right. */
	.payment legend {
		display: flex;
		gap: var(--space-4);
		justify-content: space-between;
		align-items: flex-start;
		width: 100%;
		margin-bottom: var(--space-3);
		font-size: var(--text-base);
		color: var(--color-text);
	}

	.payment .who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.payment .what,
	.loan .what {
		font-weight: 600;
	}

	.loan label {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		align-items: baseline;
		font-size: var(--text-base);
		color: var(--color-text);
	}

	.loan .when,
	.payment .when {
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.payment .how-much {
		flex: none;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	/* The chosen answer is drawn, not only ticked: an accent border and a tint. */
	.choice {
		cursor: pointer;
	}

	.choice:has(input:checked) {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, var(--color-surface-2));
	}

	.confirm summary {
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		height: var(--control-height);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		color: var(--color-text);
		font-weight: 500;
		cursor: pointer;
		list-style: none;
	}

	.confirm summary::-webkit-details-marker {
		display: none;
	}

	.confirm[open] summary {
		margin-bottom: var(--space-3);
	}

	.confirm p {
		margin: 0 0 var(--space-3);
	}

	.moves {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-6);
	}

	.saved-note {
		margin-top: var(--space-4);
	}
</style>
