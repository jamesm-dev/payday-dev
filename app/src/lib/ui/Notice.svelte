<script lang="ts">
	import '#lib/styles/controls.css';
	import type { Snippet } from 'svelte';

	/*
	 * One look for every alert, warning and confirmation; the styles are under "Notices" in
	 * controls.css. The tone is never the only signal: each has its own icon, and the words say it.
	 *   danger   something is wrong, or did not work      (red, a warning sign)
	 *   caution  worth a look, but nothing is wrong yet     (amber, an exclamation mark)
	 *   done     it worked                                  (the accent, a tick)
	 * With a title it is a card: the title carries the key fact, `children` explain it, `detail` holds
	 * a list, a note or the way to act on it. Without one it is a single message beside its icon.
	 */
	let {
		tone,
		title,
		icon,
		level = 2,
		role,
		id,
		testid,
		children,
		detail
	}: {
		tone: 'danger' | 'caution' | 'done';
		/** The heading. A snippet when part of it is highlighted (a `.figure`). */
		title?: string | Snippet;
		/** Another icon than the tone's own, when it says more (a clock for "out of date"). */
		icon?: 'clock';
		/** The heading's level: 3 inside a card that has its own heading. */
		level?: 2 | 3;
		/** 'alert' for a problem that appears after the owner acts; 'status' for a quiet result. */
		role?: 'alert' | 'status';
		/** For aria-describedby on the field the message is about. */
		id?: string;
		testid?: string;
		children?: Snippet;
		detail?: Snippet;
	} = $props();

	const uid = $props.id();
	const shape = $derived(icon ?? tone);
</script>

<svelte:element
	this={title ? 'section' : 'div'}
	class="notice {tone}"
	class:bare={!title}
	{role}
	{id}
	data-testid={testid}
	aria-labelledby={title ? `${uid}-title` : undefined}
>
	<span class="notice-icon" aria-hidden="true">
		<svg viewBox="0 0 24 24" focusable="false">
			{#if shape === 'danger'}
				<path d="M10.3 4 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z" />
				<path d="M12 9.5v4" />
				<path d="M12 17h.01" />
			{:else if shape === 'clock'}
				<circle cx="12" cy="12" r="9" />
				<path d="M12 7v5l3 2" />
			{:else if shape === 'caution'}
				<circle cx="12" cy="12" r="9" />
				<path d="M12 7.5v5" />
				<path d="M12 16.5h.01" />
			{:else}
				<circle cx="12" cy="12" r="9" />
				<path d="m8 12.5 3 3 5-6" />
			{/if}
		</svg>
	</span>
	<div class="notice-head">
		{#if title}
			<svelte:element this={`h${level}`} class="notice-title" id="{uid}-title">
				{#if typeof title === 'string'}{title}{:else}{@render title()}{/if}
			</svelte:element>
		{/if}
		{#if children}<div class="notice-lead">{@render children()}</div>{/if}
	</div>
	{#if detail}<div class="notice-detail">{@render detail()}</div>{/if}
</svelte:element>
