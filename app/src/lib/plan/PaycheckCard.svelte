<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PaycheckView } from '#lib/server/money/planView.ts';
	import KebabMenu from '#lib/ui/KebabMenu.svelte';
	import Notice from '#lib/ui/Notice.svelte';

	let {
		paycheck,
		heading = false,
		marking = false
	}: {
		paycheck: PaycheckView;
		heading?: boolean;
		/** On the Plan page: a Paid button on each bill, and the list's three downloads. */
		marking?: boolean;
	} = $props();

	const FORMATS = [
		{ format: 'txt', label: 'Text file' },
		{ format: 'pdf', label: 'PDF' },
		{ format: 'docx', label: 'Word' }
	] as const;
</script>

<article
	class="card paycheck"
	id={`paycheck-${paycheck.iso}`}
	data-testid="paycheck"
	data-payday={paycheck.iso}
>
	<header>
		{#if heading}
			<h2>{paycheck.payday}</h2>
		{:else}
			<p class="when">{paycheck.payday}</p>
		{/if}
		<p class="pay">{paycheck.pay}</p>
		{#if marking}
			<!--
				No `download` attribute: the server already sends each file as an attachment with its name,
				so a plain link downloads it and stays on this page. The attribute would hand the request to
				the browser's download manager instead, which leaves out headers a page request carries.
			-->
			<KebabMenu
				label="Download the list for {paycheck.payday}"
				heading="Download this list"
				testid="downloads"
			>
				{#each FORMATS as f (f.format)}
					<li>
						<a
							href={resolve('/plan/[payday]/list.[format]', {
								payday: paycheck.iso,
								format: f.format
							})}>{f.label}</a
						>
					</li>
				{/each}
			</KebabMenu>
		{/if}
	</header>
	{#if paycheck.isToday}<p class="muted">Today. This pay has already arrived.</p>{/if}
	{#if paycheck.monthNote}
		<p class="tag" data-testid="month-note">{paycheck.monthNote}</p>
	{/if}
	<p class="muted covers-head">
		Covers everything up to and including {paycheck.ends}
	</p>

	{#if paycheck.covers.length === 0}
		<p class="muted">No bills or loan payments fall in this stretch.</p>
	{:else}
		<ul class="lines" data-testid="covers">
			{#each paycheck.covers as line, i (i)}
				<li data-paid={line.paid ? 'yes' : undefined} class:marked={marking}>
					<span class="main"
						>{line.name}<span class="sub"
							>{line.date}
							{#if line.group}<span class="label">{line.group}</span>{/if}
							{#if line.optional}<span class="label">Optional</span>{/if}
							{#if line.paid}<span class="label paid">Paid</span>{/if}</span
						></span
					>
					<span class="money">{line.amount}</span>
					{#if marking}
						<form method="POST" action="?/paid" class="mark">
							<input type="hidden" name="itemId" value={line.itemId} />
							<input type="hidden" name="originalDate" value={line.originalDate} />
							<input type="hidden" name="payday" value={paycheck.iso} />
							<input type="hidden" name="paid" value={line.paid ? 'no' : 'yes'} />
							<button
								class="btn quiet small"
								type="submit"
								aria-label={`${line.paid ? 'Undo paid' : 'Paid'}: ${line.name}, ${line.date}`}
								>{line.paid ? 'Undo paid' : 'Paid'}</button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if paycheck.setAsides.length > 0}
		<p class="muted">Put aside from this paycheck for bills that are further off:</p>
		<ul class="lines" data-testid="set-asides">
			{#each paycheck.setAsides as line, i (i)}
				<li>
					<span class="main">{line.name}<span class="sub">{line.due}</span></span>
					<span class="money">{line.share}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if paycheck.short}
		<Notice tone="danger" level={3} testid="short">
			{#snippet title()}<span class="figure">{paycheck.shortBy}</span> short{/snippet}
			<p>This paycheck cannot cover everything in this stretch.</p>
		</Notice>
	{:else}
		<p class="left card-foot" data-testid="left">
			<span>Left over</span>
			<strong>{paycheck.left}</strong>
		</p>
	{/if}
</article>

<style>
	/* The day on the left; the pay, and the menu when there is one, on the right. */
	header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		align-items: center;
	}

	header h2,
	header .when {
		flex: 1 1 auto;
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
	}

	.pay {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.paycheck p.muted {
		margin: var(--space-1) 0;
	}

	.covers-head {
		margin-top: var(--space-3);
	}

	.paycheck .tag {
		margin: var(--space-2) 0;
	}

	.left {
		display: flex;
		gap: var(--space-4);
		justify-content: space-between;
		align-items: baseline;
		font-variant-numeric: tabular-nums;
	}

	/* The card's foot draws its own line above it, so no list in the card has one under its last row. */
	.lines > li:last-child {
		border-bottom: 0;
	}

	/* The owner's own labels: quieter than a warning tag, since nothing is wrong. */
	.label {
		display: inline-block;
		margin-left: var(--space-1);
		padding: 0 var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
	}

	.label.paid {
		border-color: var(--color-accent);
		color: var(--color-text);
		font-weight: 600;
	}

	/*
	 * A bill with its Paid button: name and date on the left, the amount and the button level on one
	 * line, centred on each other. On a phone the button drops under the name and amount, full width,
	 * so nothing overlaps.
	 */
	.marked {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-2) var(--space-4);
		align-items: center;
	}

	.marked .money {
		justify-self: end;
	}

	.mark {
		grid-column: 1 / -1;
		margin: 0;
	}

	.mark .btn {
		width: 100%;
		min-width: 6rem;
	}

	@media (min-width: 48rem) {
		.marked {
			grid-template-columns: minmax(0, 1fr) auto 7.5rem;
		}

		.mark {
			grid-column: auto;
		}
	}

	/* The paycheck's footer lines share one rule above and one rhythm, on the card's own edges. */
	.card-foot {
		margin: var(--space-4) 0 0;
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
	}
</style>
