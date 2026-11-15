<script lang="ts" module>
	export type RhythmValues = {
		repeat: string;
		date: string;
		day: string;
		day2: string;
	};

	/** The three ways to be paid, each with an example. The values are the rule kinds. */
	export const RHYTHM_CHOICES = [
		{
			value: 'every14',
			label: 'Every two weeks',
			example: 'For example: every other Friday.'
		},
		{
			value: 'twiceMonthly',
			label: 'Twice a month',
			example: 'For example: on the 15th and on the last day of the month.'
		},
		{
			value: 'monthly',
			label: 'Once a month',
			example: 'For example: on the 25th of every month.'
		}
	] as const;
</script>

<script lang="ts">
	import DateField from '#lib/ui/DateField.svelte';

	let {
		values,
		problems = {}
	}: {
		values: RhythmValues;
		problems?: Record<string, string>;
	} = $props();

	/* bind:group keeps a choice made before the script arrived; a plain `checked` would undo it. */
	let repeat = $derived(values.repeat);
</script>

<!--
	Every field is in the form and posts, so this works with no script: the server reads the ones the
	chosen rhythm needs. Style rules below only hide the ones that do not apply. Values are
	defaultValue, so text typed before the script arrived is never overwritten.
-->
<div class="rhythm">
	<fieldset class="choices">
		<legend>How often are you paid?</legend>
		{#each RHYTHM_CHOICES as choice (choice.value)}
			<label class="choice rhythm-choice">
				<input type="radio" name="repeat" value={choice.value} bind:group={repeat} />
				<span>
					{choice.label}
					<small class="hint">{choice.example}</small>
				</span>
			</label>
		{/each}
		{#if problems.repeat}<p class="problem">{problems.repeat}</p>{/if}
	</fieldset>

	<DateField
		class="when-date"
		id="setup-date"
		name="date"
		label="Your last or next payday"
		value={values.date}
		hint="Pick a payday, past or coming. Your paydays are then every two weeks from that day."
		problem={problems.date}
	/>

	<div class="field when-day">
		<label for="setup-day">
			<span class="only-monthly">Day of the month you are paid</span>
			<span class="only-twice">First day of the month you are paid</span>
		</label>
		<input
			id="setup-day"
			name="day"
			defaultValue={values.day}
			inputmode="numeric"
			autocomplete="off"
			maxlength="2"
			aria-describedby="setup-day-hint"
			aria-invalid={problems.day ? 'true' : undefined}
		/>
		<small class="hint" id="setup-day-hint">
			<span class="only-monthly">From 1 to 31. Type 31 if you are paid on the last day.</span>
			<span class="only-twice">From 1 to 27. For example: 15.</span>
		</small>
		{#if problems.day}<p class="problem">{problems.day}</p>{/if}
	</div>

	<div class="field when-day2">
		<label for="setup-day2">Second day of the month you are paid</label>
		<input
			id="setup-day2"
			name="day2"
			defaultValue={values.day2}
			inputmode="numeric"
			autocomplete="off"
			maxlength="2"
			aria-describedby="setup-day2-hint"
			aria-invalid={problems.day2 ? 'true' : undefined}
		/>
		<small class="hint" id="setup-day2-hint">
			This day must come after the first one. Type 31 if you are paid on the last day of the month.
		</small>
		{#if problems.day2}<p class="problem">{problems.day2}</p>{/if}
	</div>
</div>

<style>
	.rhythm-choice {
		padding-block: var(--space-2);
	}

	.rhythm-choice .hint {
		display: block;
	}

	/* Only what the chosen rhythm needs is shown. Every field still posts. */
	.rhythm:not(:has(input[name='repeat'][value='every14']:checked)) :global(.when-date),
	.rhythm:not(
			:has(
				input[name='repeat'][value='monthly']:checked,
				input[name='repeat'][value='twiceMonthly']:checked
			)
		)
		.when-day,
	.rhythm:not(:has(input[name='repeat'][value='twiceMonthly']:checked)) .when-day2,
	.rhythm:not(:has(input[name='repeat'][value='twiceMonthly']:checked)) .only-twice,
	.rhythm:has(input[name='repeat'][value='twiceMonthly']:checked) .only-monthly {
		display: none;
	}
</style>
