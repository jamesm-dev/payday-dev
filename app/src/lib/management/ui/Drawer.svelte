<script lang="ts">
	import type { Snippet } from 'svelte';

	/*
	 * The one drawer, shared by the task drawer and the create form. A real modal dialog: focus
	 * moves in on open, is trapped while open and returns to the opener on close; Escape and the
	 * backdrop close it; the page behind does not scroll. A right-hand panel above 768px, a bottom
	 * sheet below; no animation under prefers-reduced-motion (management.css).
	 */
	let { label, onclose, children }: { label: string; onclose: () => void; children: Snippet } =
		$props();

	let panel: HTMLDivElement;
	const titleId = `drawer-${Math.random().toString(36).slice(2, 10)}`;

	$effect(() => {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const overflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		// The panel itself takes focus, so the dialog's label is announced before its first control.
		panel.focus();
		return () => {
			document.body.style.overflow = overflow;
			opener?.focus();
		};
	});

	const FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement;
		if (event.shiftKey && (active === first || active === panel)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<!-- The backdrop is a pointer convenience; Escape is the keyboard path to the same close. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>
<div
	class="drawer"
	role="dialog"
	aria-modal="true"
	aria-labelledby={titleId}
	tabindex="-1"
	bind:this={panel}
	{onkeydown}
>
	<header>
		<h2 id={titleId}>{label}</h2>
		<button type="button" class="action" aria-label="Close" onclick={onclose}>×</button>
	</header>
	<div class="body">
		{@render children()}
	</div>
</div>
