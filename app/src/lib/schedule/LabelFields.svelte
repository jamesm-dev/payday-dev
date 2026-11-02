<script lang="ts" module>
	export type LabelValues = { group: string; optional: boolean };
</script>

<script lang="ts">
	let {
		values,
		groups = [],
		problems = {}
	}: {
		values: LabelValues;
		/** Groups already in use, offered as suggestions so one group keeps one spelling. */
		groups?: string[];
		problems?: Record<string, string>;
	} = $props();
</script>

<!-- How this bill shows on the paycheck list. Neither changes the number. -->
<div class="field">
	<label for="item-group">Group</label>
	<input
		id="item-group"
		name="group"
		defaultValue={values.group}
		list="item-groups"
		autocomplete="off"
		maxlength="30"
		aria-describedby="group-hint"
		aria-invalid={problems.group ? 'true' : undefined}
	/>
	<small class="hint" id="group-hint"
		>Bills with the same group sit together on your paycheck list, like GCash or House. Leave it
		empty if you like.</small
	>
	<datalist id="item-groups">
		{#each groups as group (group)}<option value={group}></option>{/each}
	</datalist>
	{#if problems.group}<p class="problem">{problems.group}</p>{/if}
</div>

<label class="choice optional">
	<input
		type="checkbox"
		name="optional"
		value="yes"
		defaultChecked={values.optional}
		aria-describedby="optional-hint"
	/>
	<span>Optional: I can skip this one when money is tight</span>
</label>
<small class="hint" id="optional-hint"
	>Shown with a * on your paycheck list. Your number still keeps money for it.</small
>

<style>
	.optional {
		margin: var(--space-4) 0 0;
	}
</style>
