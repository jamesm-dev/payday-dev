<script lang="ts">
	import '#lib/styles/controls.css';
	import { resolve } from '$app/paths';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const page = $derived(data.page);
</script>

<svelte:head>
	<title>What I owe - Payday</title>
</svelte:head>

<main class="page">
	<PageHeader
		title="What I owe"
		description={page.empty
			? 'Add each loan, card and plan you are paying off. Payday then shows the total, what it costs you each month in interest, and the day you will be free of it.'
			: undefined}
	/>

	{#if !page.empty}
		<section class="summary" aria-label="Summary">
			<p class="eyebrow">In total you owe</p>
			<p class="figure" data-testid="total-owed">{page.total}</p>
			<dl class="facts">
				<div>
					<dt>Interest this month</dt>
					<dd data-testid="interest-month">{page.interest}</dd>
				</div>
			</dl>
			{#if page.unknownRates.length > 0}
				<p class="muted" data-testid="interest-unknown">
					This leaves out {page.unknownRates.join(', ')}: the rate is unknown.
				</p>
			{/if}
		</section>

		<section class="debt-free" data-testid="debt-free" data-kind={page.debtFree.kind}>
			<h2>{page.debtFree.headline}</h2>
			{#each page.debtFree.notes as note, i (i)}
				<p>{note}</p>
			{/each}
			{#if page.debtFree.assumes.length > 0}
				<p class="muted">It assumes:</p>
				<ul class="assumes" data-testid="assumed-rates">
					{#each page.debtFree.assumes as line, i (i)}
						<li>{line}</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<section aria-labelledby="h-loans">
		<div class="section-head">
			<h2 id="h-loans">Each loan</h2>
			<a class="btn small secondary" href={resolve('/loans/new')} aria-label="Add a loan">
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
					<path d="M12 5v14M5 12h14" />
				</svg>
				Add
			</a>
		</div>
		{#if page.empty}
			<p class="muted">Nothing here yet.</p>
		{:else}
			<ul class="loans" data-testid="loan-list">
				{#each page.loans as loan (loan.id)}
					<li class="card" data-testid="loan" data-name={loan.name}>
						<a
							class="loan-link"
							href={resolve('/loans/[id]', { id: loan.id })}
							aria-labelledby={`loan-name-${loan.id}`}
						>
							<span class="body">
								<span class="top">
									<span class="name" id={`loan-name-${loan.id}`}>{loan.name}</span>
									<span class="balance" data-testid="loan-balance">{loan.balance}</span>
								</span>
								<span class="kind">
									{loan.kind}{#if loan.lender}, {loan.lender}{/if}
								</span>
								<span class="details">
									<span>
										<span class="term">Rate</span>
										<span data-testid="loan-rate" class:unknown={!loan.rateKnown}>{loan.rate}</span>
									</span>
									<span>
										<span class="term">Balance from</span>
										<span>{loan.balanceDate}</span>
									</span>
								</span>
								<span class="next" data-testid="loan-next">{loan.next}</span>
								<span class="payoff" class:stuck={loan.stuck} data-testid="loan-payoff"
									>{loan.payoff}</span
								>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if page.convertible.length > 0}
		<section aria-labelledby="h-convert" data-testid="convertible">
			<h2 id="h-convert">Loan payments you could connect</h2>
			<p class="muted">
				These are on your schedule already. Connect one to a loan and its payments are not counted
				twice.
			</p>
			<ul class="lines">
				{#each page.convertible as item (item.id)}
					<li data-name={item.name}>
						<span class="main">{item.name}<span class="sub">{item.rule}</span></span>
						<span class="money">{item.amount}</span>
						<form method="GET" action={resolve('/loans/new')}>
							<input type="hidden" name="item" value={item.id} />
							<button class="btn secondary" type="submit">This is a loan</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if page.history.length > 0}
		<section aria-labelledby="h-history">
			<h2 id="h-history">Total owed at each check-in</h2>
			<p class="muted">Newest first. A loan added or paid off in between is part of the change.</p>
			<ul class="lines" data-testid="totals-history">
				{#each page.history as row (row.id)}
					<li data-testid="total-row">
						<span class="main"
							>{row.date}{#if row.change}<span class="sub" data-testid="total-change"
									>{row.change} since the check-in before</span
								>{/if}</span
						>
						<span class="money">{row.total}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<style>
	.summary {
		margin-bottom: var(--space-6);
	}

	.figure {
		margin: var(--space-1) 0 var(--space-3);
		font-size: var(--text-display);
		font-weight: 700;
		line-height: var(--leading-tight);
		font-variant-numeric: tabular-nums;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3) var(--space-8);
		margin: 0;
	}

	.facts dt {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.facts dd {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.debt-free {
		margin: var(--space-6) 0;
		padding: var(--space-4);
		border-left: var(--space-1) solid var(--color-accent);
		background: var(--color-surface);
		border-radius: var(--radius-2);
	}

	.debt-free[data-kind='blocked'] {
		border-left-color: var(--color-warn);
	}

	.debt-free h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-lg);
	}

	.debt-free p {
		margin: var(--space-2) 0;
	}

	.assumes {
		margin: 0;
		padding-left: var(--space-6);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	/* The section's title on the left, its Add button on the right, level on one line. */
	.section-head {
		display: flex;
		gap: var(--space-4);
		align-items: center;
		justify-content: space-between;
		margin: var(--space-10) 0 var(--space-3);
	}

	.section-head h2 {
		margin: 0;
	}

	.section-head svg {
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	.loans {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* A loan is one card and one link: the whole card opens the loan. */
	.loans .card {
		padding: 0;
		overflow: hidden;
	}

	.loan-link {
		display: flex;
		gap: var(--space-4);
		align-items: center;
		box-sizing: border-box;
		min-height: 3.5rem;
		padding: var(--space-6);
		color: var(--color-text);
		text-decoration: none;
	}

	.loan-link:hover,
	.loan-link:active {
		background: var(--color-surface-2);
	}

	.loan-link:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.loan-link::after {
		content: '';
		flex: none;
		box-sizing: border-box;
		width: var(--space-2);
		height: var(--space-2);
		border-top: 2px solid var(--color-text-muted);
		border-right: 2px solid var(--color-text-muted);
		transform: rotate(45deg);
	}

	.body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		justify-content: space-between;
		align-items: baseline;
	}

	.name {
		font-weight: 600;
	}

	.balance {
		font-size: var(--text-lg);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.kind {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.details {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-8);
		margin: var(--space-2) 0;
		font-size: var(--text-sm);
	}

	.term {
		display: block;
		color: var(--color-text-muted);
	}

	.details .unknown {
		font-weight: 600;
	}

	.next,
	.payoff {
		font-size: var(--text-sm);
	}

	.payoff.stuck {
		padding-left: var(--space-3);
		border-left: var(--space-1) solid var(--color-warn);
		font-weight: 600;
	}

	.lines form {
		flex: 1 1 100%;
	}

	.lines form .btn {
		width: 100%;
		margin-top: var(--space-2);
	}
</style>
