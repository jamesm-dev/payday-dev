<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import type { HomeView } from '#lib/server/money/home.ts';
	import Notice from '#lib/ui/Notice.svelte';

	type Ready = Extract<HomeView, { state: 'ready' }>;
	let { view, balanceForm, quickAdd }: { view: Ready; balanceForm?: Snippet; quickAdd?: Snippet } =
		$props();

	/** Straight into the balance field: the form below is open while the balance is out of date. */
	function toBalance(event: MouseEvent) {
		const field = document.getElementById('balance-amount');
		if (!field) return;
		event.preventDefault();
		field.focus();
	}
</script>

<p class="eyebrow">Safe to spend until {view.until}</p>
<p class="amount" class:negative={view.negative} data-testid="safe-to-spend">{view.amount}</p>

<!--
	The warnings, most useful first. An out-of-date balance comes before a shortfall: the shortfall is
	worked out from that balance, so it may not be real until the balance is updated. Each heading
	carries the key fact, and each warning offers the way to act on it.
-->
{#if view.stale}
	<Notice tone="caution" icon="clock" title="Your balance is out of date" testid="stale-warning">
		<p>
			{#if view.lastPayday}
				It is from <strong>{view.balanceDate}</strong>, before your last payday on
				<strong>{view.lastPayday}</strong>. Until you update it, this number may be wrong.
			{:else}
				It is from <strong>{view.balanceDate}</strong>, before your last payday. Until you update
				it, this number may be wrong.
			{/if}
		</p>
		{#snippet detail()}
			{#if balanceForm}
				<a class="btn small" href="#balance-amount" onclick={toBalance}>Update my balance</a>
			{/if}
		{/snippet}
	</Notice>
{/if}

{#if view.shortfall}
	{@const shortfall = view.shortfall}
	<Notice tone="danger" testid="shortfall">
		{#snippet title()}You are <span class="figure">{shortfall.short}</span> short{/snippet}
		<p>
			{#if shortfall.cause === 'due'}
				More is due before <strong>{view.until}</strong> than you have.
			{:else if shortfall.cause === 'logged'}
				What you logged since your balance is more than your balance covers. Nothing else is due
				before <strong>{view.until}</strong>.
			{:else if shortfall.cause === 'both'}
				Your balance does not cover what you logged since it, together with what is held for yearly
				bills. Nothing else is due before <strong>{view.until}</strong>.
			{:else if shortfall.cause === 'held'}
				Your balance does not cover what is held for yearly bills. Nothing else is due before
				<strong>{view.until}</strong>.
			{:else}
				Your balance is below zero. Nothing else is due before <strong>{view.until}</strong>.
			{/if}
		</p>
		{#snippet detail()}
			{#if shortfall.uncovered.length > 0}
				<h3 class="notice-label" id="uncovered-title">Not covered yet</h3>
				<ul class="lines" data-testid="uncovered" aria-labelledby="uncovered-title">
					{#each shortfall.uncovered as item, i (i)}
						<li>
							{#if item.itemId}
								<a class="row" href={resolve('/schedule/[id]', { id: item.itemId })}>
									<span class="main">{item.name}<span class="sub">Due {item.date}</span></span>
									<span class="money">{item.amount}</span>
								</a>
							{:else}
								<span class="main">{item.name}<span class="sub">Due {item.date}</span></span>
								<span class="money">{item.amount}</span>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="notice-note">
					Open one to skip it or move it to a later day. Money held for yearly bills is already
					taken out.
				</p>
			{/if}
		{/snippet}
	</Notice>
{/if}

{#if quickAdd}{@render quickAdd()}{/if}

<p class="muted based-on" data-testid="based-on">
	Based on your balance of {view.balance} from {view.balanceDate}{#if view.expenses.length > 0},
		less
		{view.expensesTotal} you logged since{/if}.
</p>
{#if balanceForm}{@render balanceForm()}{/if}

{#if view.expenses.length > 0}
	<h2 id="spent-title">Spent since your balance</h2>
	<ul class="lines" data-testid="expenses-since" aria-labelledby="spent-title">
		{#each view.expenses as item (item.id)}
			<li>
				<a class="row" href={resolve('/expenses/[id]', { id: String(item.id) })}>
					<span class="main">{item.name}<span class="sub">{item.date}</span></span>
					<span class="money">{item.amount}</span>
				</a>
			</li>
		{/each}
	</ul>
	<p class="muted" data-testid="expenses-total">Total {view.expensesTotal}</p>
{/if}
{#if quickAdd}
	<p class="muted"><a href={resolve('/expenses')}>See all expenses</a></p>
{/if}

<h2>Already spoken for until {view.until}</h2>
{#if view.reserved.length === 0}
	<p class="muted" data-testid="reserved-empty">Nothing is due before then.</p>
{:else}
	<ul class="lines" data-testid="reserved">
		{#each view.reserved as item, i (i)}
			<li>
				<span class="main"
					>{item.name}<span class="sub"
						>{item.date}{#if item.missed}
							<span class="tag" data-testid="missed-tag">Missed, still owed</span>{/if}</span
					></span
				>
				<span class="money">{item.amount}</span>
			</li>
		{/each}
	</ul>
	<p class="muted">Total {view.reservedTotal}</p>
{/if}

{#if view.setAsides.length > 0}
	<h2>Being saved for a little each payday</h2>
	<ul class="lines" data-testid="set-asides">
		{#each view.setAsides as item, i (i)}
			<li>
				<span class="main">{item.name}<span class="sub">{item.amount} is due {item.due}</span></span
				>
				<span class="money">{item.held} held</span>
			</li>
		{/each}
	</ul>
{/if}

{#if view.incomeSince.length > 0}
	<h2>Pay that has arrived since your balance</h2>
	<ul class="lines" data-testid="income-since">
		{#each view.incomeSince as item, i (i)}
			<li>
				<span class="main">{item.name}<span class="sub">{item.date}</span></span>
				<span class="money">{item.amount}</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.amount {
		margin: var(--space-2) 0 var(--space-6);
		font-size: var(--text-display);
		font-weight: 700;
		line-height: var(--leading-tight);
		font-variant-numeric: tabular-nums;
		color: var(--color-text);
	}

	.amount.negative {
		color: var(--color-warn);
	}

	.based-on {
		margin: var(--space-3) 0;
	}
</style>
