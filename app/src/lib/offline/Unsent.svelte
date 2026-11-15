<script lang="ts">
	/**
	 * On the sign-in page: expenses logged on this phone while offline that the site never saved,
	 * because the session ended first (ADR-0029). Only how many, never what: whoever holds the phone
	 * now may not be the person who logged them. Signing in as that person sends them; signing in as
	 * someone else removes them. The person can also remove them here.
	 */
	import { onMount } from 'svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import { forgetAll, readQueue } from './store.ts';

	let count = $state(0);
	let removed = $state(false);

	onMount(() => {
		count = readQueue().filter((q) => q.state !== 'sent').length;
	});

	function remove() {
		forgetAll();
		count = 0;
		removed = true;
	}
</script>

{#if count > 0}
	<Notice
		tone="caution"
		icon="clock"
		title={count === 1
			? 'This phone has 1 expense that was not sent yet'
			: `This phone has ${count} expenses that were not sent yet`}
		testid="unsent-on-phone"
	>
		<p>
			{count === 1 ? 'It was' : 'They were'} logged with no signal. Sign in to send {count === 1
				? 'it'
				: 'them'}, or remove {count === 1 ? 'it' : 'them'} from this phone.
		</p>
		{#snippet detail()}
			<button class="btn secondary small" type="button" onclick={remove}>
				Remove {count === 1 ? 'it' : 'them'} from this phone
			</button>
		{/snippet}
	</Notice>
{:else if removed}
	<Notice tone="done" role="status"><p>Removed from this phone.</p></Notice>
{/if}
