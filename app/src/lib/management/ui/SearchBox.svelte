<script lang="ts">
	/** Shared by Specs and Team. The Board keeps its own, inside its row of filters. */
	let {
		value,
		placeholder,
		noun,
		shown,
		total,
		onsearch
	}: {
		value: string;
		placeholder: string;
		noun: string;
		shown: number;
		total: number;
		onsearch: (value: string) => void;
	} = $props();
</script>

<div class="searchbox row">
	<label>
		<span class="vh">Search {noun}</span>
		<input
			type="search"
			{placeholder}
			{value}
			oninput={(event) => onsearch(event.currentTarget.value)}
		/>
	</label>
	{#if value}
		<button type="button" class="clear num" onclick={() => onsearch('')}>
			Clear · showing {shown} of {total}
		</button>
	{/if}
</div>
