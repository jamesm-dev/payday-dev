<script lang="ts">
	import DateField from '#lib/ui/DateField.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import ItemFields from '#lib/schedule/ItemFields.svelte';
	import LabelFields from '#lib/schedule/LabelFields.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const saveFailed = $derived(form && 'values' in form ? form : null);
	const endProblems = $derived(form && form.action === 'end' ? form.problems : null);
	/** A skip or change that was refused, with the payment it was for. */
	const paymentFailed = $derived(
		form && (form.action === 'skip' || form.action === 'change') ? form : null
	);
	const WORDS = { income: 'pay', bill: 'bill', 'loan-payment': 'loan payment' };
</script>

<svelte:head>
	<title>{data.item.name} - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title={data.item.name}
		back={{ href: resolve('/schedule'), label: 'Pay and bills' }}
		description={`${data.item.amount}. ${data.item.rule}.${data.item.ended ? ` Ended ${data.item.endsOn}.` : ''}`}
	/>

	<h2>Coming up</h2>
	<p class="muted">
		Skip one payment, or change its date or amount, without changing the rest. You can undo it.
	</p>
	{#if paymentFailed}
		<Notice tone="danger" role="alert">
			{#each Object.values(paymentFailed.problems) as problem (problem)}<p>{problem}</p>{/each}
		</Notice>
	{/if}
	{#if data.payments.length === 0}
		<p class="muted">No more payments are coming.</p>
	{:else}
		<ul class="lines payments" data-testid="payments">
			{#each data.payments as p (p.originalDate)}
				<li data-original={p.originalDate}>
					<span class="main">
						{p.date}
						{#if p.status === 'skipped'}<span class="tag">Skipped</span>{/if}
						{#if p.status === 'changed'}<span class="tag">Changed</span>
							<span class="sub">Was {p.was}</span>{/if}
					</span>
					<span class="money" class:struck={p.status === 'skipped'}>{p.amount}</span>
					<div class="payment-actions">
						{#if p.status === 'normal'}
							<form method="POST" action="?/skip">
								<input type="hidden" name="originalDate" value={p.originalDate} />
								<button class="btn quiet" type="submit" aria-label={`Skip ${p.date}`}>Skip</button>
							</form>
						{:else}
							<form method="POST" action="?/undo">
								<input type="hidden" name="originalDate" value={p.originalDate} />
								<button class="btn quiet" type="submit" aria-label={`Undo ${p.date}`}>Undo</button>
							</form>
						{/if}
						{#if p.status !== 'skipped'}
							<details class="fold">
								<summary>Change</summary>
								<form method="POST" action="?/change">
									<input type="hidden" name="originalDate" value={p.originalDate} />
									<div class="field-row">
										<DateField
											id={`change-date-${p.originalDate}`}
											name="date"
											label="New date"
											value={p.newDate}
										/>
										<div class="field">
											<label for={`change-amount-${p.originalDate}`}>New amount</label>
											<input
												id={`change-amount-${p.originalDate}`}
												name="amount"
												inputmode="decimal"
												autocomplete="off"
												defaultValue={p.amountField}
											/>
										</div>
										<button class="btn" type="submit">Save this change</button>
									</div>
								</form>
							</details>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.item.kind !== 'income'}
		<h2>Is this a loan?</h2>
		{#if data.loan}
			<p data-testid="loan-link">
				This is the payment for <a href={resolve('/loans/[id]', { id: data.loan.id })}
					>{data.loan.name}</a
				>. It is counted once in your number.
			</p>
		{:else}
			<p class="muted">
				If you are paying off a card, a loan or a plan, connect this payment to it. Payday then
				tracks what is left and when you will be free of it. Your number does not change.
			</p>
			<form method="GET" action={resolve('/loans/new')}>
				<input type="hidden" name="item" value={data.item.id} />
				<div class="actions">
					<button class="btn secondary" type="submit">This is a loan</button>
				</div>
			</form>
		{/if}
	{/if}

	<h2>Edit this {WORDS[data.item.kind]}</h2>
	<form method="POST" action="?/save" class="item-form">
		<ItemFields
			kind={data.item.kind}
			values={saveFailed?.values ?? data.values}
			problems={saveFailed?.problems ?? {}}
		/>
		{#if data.item.kind !== 'income'}
			<LabelFields
				values={saveFailed?.labels ?? data.labels}
				groups={data.groups}
				problems={saveFailed?.problems ?? {}}
			/>
		{/if}
		<div class="actions">
			<button class="btn" type="submit">Save changes</button>
		</div>
	</form>

	<h2>{data.item.ended ? 'This has ended' : 'Stop this'}</h2>
	{#if data.item.ended}
		<p class="muted">
			It ended on {data.item.endsOn}. Past payments are kept. Changed your mind?
		</p>
		<form method="POST" action="?/resume">
			<div class="actions">
				<button class="btn secondary" type="submit">Bring it back</button>
			</div>
		</form>
	{:else}
		<p class="muted">
			Nothing is deleted: the payments up to the last date stay, and none come after it.
		</p>
		<form method="POST" action="?/end">
			<div class="field-row">
				<DateField
					id="end-endsOn"
					name="endsOn"
					label="Last date it applies"
					value={endProblems ? '' : data.today}
					problem={endProblems?.endsOn}
				/>
				<button class="btn danger" type="submit">End it</button>
			</div>
		</form>
	{/if}
</main>

<style>
	.payment-actions {
		display: flex;
		flex: 1 1 100%;
		flex-wrap: wrap;
		gap: var(--space-3);
		align-items: flex-start;
	}

	.payment-actions details {
		flex: 1 1 14rem;
		margin: 0;
	}

	/* Opened, the change form takes the whole line so its two fields and button sit side by side. */
	.payment-actions details[open] {
		flex-basis: 100%;
	}

	.struck {
		text-decoration: line-through;
	}
</style>
