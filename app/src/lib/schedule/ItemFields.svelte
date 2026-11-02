<script lang="ts" module>
	export type ItemValues = {
		name: string;
		amount: string;
		repeat: string;
		date: string;
		day: string;
	};

	export const REPEAT_CHOICES = [
		{ value: 'every14', label: 'Every 2 weeks' },
		{ value: 'monthly', label: 'Every month' },
		{ value: 'quarterly', label: 'Every 3 months' },
		{ value: 'yearly', label: 'Every year' }
	];

	/** What to ask for, in the words of each kind. */
	export const WORDS = {
		income: {
			name: 'What do you call it?',
			nameExample: 'For example: Pay, or Wages',
			amount: 'How much do you get each time, after tax?',
			date: 'Your last or next payday',
			dateHint: 'Pick a payday, past or coming. Every other payday is worked out from it.'
		},
		bill: {
			name: 'What is it called?',
			nameExample: 'For example: Rent, Phone, Internet, Insurance, a subscription',
			amount: 'How much is each payment?',
			date: 'Date of the next payment',
			dateHint: 'Pick the next date it is due. A past date is fine too.'
		},
		'loan-payment': {
			name: 'What is it called?',
			nameExample: 'For example: Car loan, Credit card minimum, a Pay Later plan',
			amount: 'How much is each payment?',
			date: 'Date of the next payment',
			dateHint: 'Pick the next date it is due. A past date is fine too.'
		}
	} as const;

	export const defaultRepeat = (kind: keyof typeof WORDS) =>
		kind === 'income' ? 'every14' : 'monthly';
</script>

<script lang="ts">
	import DateField from '#lib/ui/DateField.svelte';

	let {
		kind,
		values,
		problems = {}
	}: {
		kind: keyof typeof WORDS;
		values: ItemValues;
		problems?: Record<string, string>;
	} = $props();

	const words = $derived(WORDS[kind]);
	/* bind:group keeps a choice made before the script arrived; a plain `checked` would undo it. */
	let repeat = $derived(values.repeat);
</script>

<!--
	Each value is a defaultValue: the server writes it into the page, and in the browser it only sets
	the field's default, so a page drawn in the browser is filled in while text typed before the script
	arrived (slow phone) is never overwritten.
-->
<div class="field">
	<label for="item-name">{words.name}</label>
	<input
		id="item-name"
		name="name"
		defaultValue={values.name}
		autocomplete="off"
		maxlength="60"
		aria-describedby="name-hint"
		aria-invalid={problems.name ? 'true' : undefined}
	/>
	<small class="hint" id="name-hint">{words.nameExample}</small>
	{#if problems.name}<p class="problem">{problems.name}</p>{/if}
</div>

<div class="field">
	<label for="item-amount">{words.amount}</label>
	<input
		id="item-amount"
		name="amount"
		defaultValue={values.amount}
		inputmode="decimal"
		autocomplete="off"
		aria-describedby="amount-hint"
		aria-invalid={problems.amount ? 'true' : undefined}
	/>
	<small class="hint" id="amount-hint">Numbers only, like 45 or 1,200.50</small>
	{#if problems.amount}<p class="problem">{problems.amount}</p>{/if}
</div>

<fieldset class="choices">
	<legend>How often?</legend>
	{#each REPEAT_CHOICES as choice (choice.value)}
		<label class="choice">
			<input type="radio" name="repeat" value={choice.value} bind:group={repeat} />
			<span>{choice.label}</span>
		</label>
	{/each}
	{#if problems.repeat}<p class="problem">{problems.repeat}</p>{/if}
</fieldset>

<DateField
	class="when-date"
	id="item-date"
	name="date"
	label={words.date}
	value={values.date}
	hint={words.dateHint}
	problem={problems.date}
/>

<div class="field when-day">
	<label for="item-day">Day of the month</label>
	<input
		id="item-day"
		name="day"
		defaultValue={values.day}
		inputmode="numeric"
		autocomplete="off"
		maxlength="2"
		aria-describedby="day-hint"
		aria-invalid={problems.day ? 'true' : undefined}
	/>
	<small class="hint" id="day-hint"
		>From 1 to 31. On a shorter month it falls on the last day.</small
	>
	{#if problems.day}<p class="problem">{problems.day}</p>{/if}
</div>
