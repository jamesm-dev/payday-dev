<script lang="ts">
	/**
	 * The quick-add form under the number: an amount, what it was for, and the day (today unless
	 * changed). On the home screen it posts to `?/expense`, with or without script; with script, and
	 * on the offline page, `onsubmit` takes it first and may keep it on the phone (ADR-0029).
	 */
	import DateField from '#lib/ui/DateField.svelte';

	let {
		today,
		values,
		problems = {},
		onsubmit,
		busy = false
	}: {
		today: string;
		values?: { amount?: string; note?: string; date?: string };
		problems?: Record<string, string>;
		onsubmit?: (event: SubmitEvent & { currentTarget: EventTarget & HTMLFormElement }) => void;
		busy?: boolean;
	} = $props();
	const expenseValues = $derived(values);
	const expenseProblems = $derived(problems);
</script>

{#snippet dayField()}
	<summary>Another day</summary>
	<DateField
		id="expense-date"
		name="date"
		label="The day you spent it"
		value={expenseValues?.date || today}
		max={today}
		problem={expenseProblems.date}
	/>
{/snippet}
<form class="quick-add" method="POST" action="?/expense" id="add-expense" {onsubmit}>
	<div class="field-row">
		<div class="field">
			<label for="expense-amount">Add an expense</label>
			<input
				id="expense-amount"
				name="amount"
				inputmode="decimal"
				autocomplete="off"
				placeholder="Amount"
				defaultValue={expenseValues?.amount || ''}
				aria-invalid={expenseProblems.amount ? 'true' : undefined}
				aria-describedby={expenseProblems.amount ? 'expense-amount-problem' : undefined}
			/>
			{#if expenseProblems.amount}
				<p class="problem" id="expense-amount-problem">{expenseProblems.amount}</p>
			{/if}
		</div>
		<div class="field">
			<label for="expense-note">What was it for? <span class="optional">(optional)</span></label>
			<input
				id="expense-note"
				name="note"
				autocomplete="off"
				defaultValue={expenseValues?.note || ''}
				aria-invalid={expenseProblems.note ? 'true' : undefined}
				aria-describedby={expenseProblems.note ? 'expense-note-problem' : undefined}
			/>
			{#if expenseProblems.note}
				<p class="problem" id="expense-note-problem">{expenseProblems.note}</p>
			{/if}
		</div>
		<button class="btn" type="submit" disabled={busy}>Add</button>
	</div>
	<!-- Unbound, like the balance panel: the day is today unless the owner opens this. -->
	{#if expenseProblems.date}
		<details class="fold" open>{@render dayField()}</details>
	{:else}
		<details class="fold">{@render dayField()}</details>
	{/if}
</form>
