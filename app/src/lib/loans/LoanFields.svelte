<script lang="ts" module>
	export type ItemChoice = { id: string; label: string };
</script>

<script lang="ts">
	import { TYPE_WORDS, type LoanValues } from '#lib/loans/words.ts';
	import type { LoanType } from '#lib/domain/loans.ts';

	let {
		type,
		values,
		problems = {},
		items,
		balanceLabel = TYPE_WORDS[type].balance
	}: {
		type: LoanType;
		values: LoanValues;
		problems?: Record<string, string>;
		items: ItemChoice[];
		balanceLabel?: string;
	} = $props();

	const words = $derived(TYPE_WORDS[type]);
</script>

<!-- Empty values are passed as undefined, so a field typed in before a script arrives is left alone. -->
<div class="field">
	<label for="loan-name">What is it called?</label>
	<input
		id="loan-name"
		name="name"
		value={values.name || undefined}
		autocomplete="off"
		maxlength="60"
		aria-describedby="name-hint"
		aria-invalid={problems.name ? 'true' : undefined}
	/>
	<small class="hint" id="name-hint">{words.nameExample}</small>
	{#if problems.name}<p class="problem">{problems.name}</p>{/if}
</div>

<div class="field">
	<label for="loan-lender">{words.lender}</label>
	<input
		id="loan-lender"
		name="lender"
		value={values.lender || undefined}
		autocomplete="off"
		maxlength="60"
		aria-describedby="lender-hint"
		aria-invalid={problems.lender ? 'true' : undefined}
	/>
	<small class="hint" id="lender-hint">{words.lenderExample}</small>
	{#if problems.lender}<p class="problem">{problems.lender}</p>{/if}
</div>

<div class="field">
	<label for="loan-balance">{balanceLabel}</label>
	<input
		id="loan-balance"
		name="balance"
		value={values.balance || undefined}
		inputmode="decimal"
		autocomplete="off"
		aria-describedby="balance-hint"
		aria-invalid={problems.balance ? 'true' : undefined}
	/>
	<small class="hint" id="balance-hint">Numbers only, like 1,200.50. Use 0 if it is paid off.</small
	>
	{#if problems.balance}<p class="problem">{problems.balance}</p>{/if}
</div>

<div class="field">
	<label for="loan-rate">Yearly interest rate, in percent</label>
	<input
		id="loan-rate"
		name="rate"
		value={values.rate || undefined}
		inputmode="decimal"
		autocomplete="off"
		aria-describedby="rate-hint"
		aria-invalid={problems.rate ? 'true' : undefined}
	/>
	<small class="hint" id="rate-hint">{words.rateHint}</small>
	{#if problems.rate}<p class="problem">{problems.rate}</p>{/if}
</div>

<div class="field">
	<label for="loan-item">Which payment on your schedule pays this off?</label>
	<select
		id="loan-item"
		name="item"
		aria-describedby="item-hint"
		aria-invalid={problems.item ? 'true' : undefined}
	>
		<option value="" selected={!values.item}>
			{type === 'credit-card' ? 'None: use the minimum below' : 'None yet'}
		</option>
		{#each items as choice (choice.id)}
			<option value={choice.id} selected={values.item === choice.id}>{choice.label}</option>
		{/each}
	</select>
	<small class="hint" id="item-hint">
		Its payments are counted once, in your number. Not listed? Add it first under
		<em>Pay and bills</em>.
	</small>
	{#if problems.item}<p class="problem">{problems.item}</p>{/if}
</div>

{#if words.minimum}
	<fieldset class="minimum">
		<legend>The card's minimum payment</legend>
		<p class="hint">
			Used when no payment above is chosen. Your statement says it as "the greater of an amount or a
			percentage of the balance".
		</p>
		<div class="field">
			<label for="loan-minPct">Percentage of the balance</label>
			<input
				id="loan-minPct"
				name="minPct"
				value={values.minPct || undefined}
				inputmode="decimal"
				autocomplete="off"
				aria-invalid={problems.minPct ? 'true' : undefined}
			/>
			{#if problems.minPct}<p class="problem">{problems.minPct}</p>{/if}
		</div>
		<div class="field">
			<label for="loan-minFloor">Or this amount, if it is more</label>
			<input
				id="loan-minFloor"
				name="minFloor"
				value={values.minFloor || undefined}
				inputmode="decimal"
				autocomplete="off"
				aria-invalid={problems.minFloor ? 'true' : undefined}
			/>
			{#if problems.minFloor}<p class="problem">{problems.minFloor}</p>{/if}
		</div>
	</fieldset>
{/if}

<style>
	.minimum {
		margin: var(--space-6) 0 var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
	}

	.minimum legend {
		padding: 0 var(--space-2);
		font-weight: 600;
	}

	.minimum .hint {
		margin-top: 0;
	}
</style>
