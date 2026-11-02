<script lang="ts">
	import '#lib/styles/controls.css';
	import '#lib/styles/datefield.css';
	import { dateText } from '#lib/format.ts';
	import { parseCalDate } from '#lib/domain/dates.ts';
	import { onMount, tick } from 'svelte';

	/**
	 * One date field for the whole app. The native <input type="date"> is always the form value, so
	 * the field works with no script and posts exactly as before; a phone keeps its own date picker.
	 * Where JavaScript runs and the pointer is a mouse, a calendar button opens a calendar (Cally, a
	 * web component) in a popover. Cally is loaded on the first open, never with the page.
	 */
	let {
		id,
		name,
		label,
		value = '',
		min,
		max,
		hint,
		problem,
		required = false,
		class: className = ''
	}: {
		id: string;
		name: string;
		label: string;
		value?: string;
		min?: string;
		max?: string;
		hint?: string;
		problem?: string;
		required?: boolean;
		class?: string;
	} = $props();

	const hintId = $derived(`${id}-hint`);
	const problemId = $derived(`${id}-problem`);
	const panelId = $derived(`${id}-calendar`);
	const textId = $derived(`${id}-text`);

	/** "Sun, Oct 19 2027", or '' when the field is empty or not a whole date yet. */
	function show(raw: string): string {
		try {
			return raw ? dateText(parseCalDate(raw)) : '';
		} catch {
			return '';
		}
	}

	let input: HTMLInputElement | undefined = $state();
	let control: HTMLElement | undefined = $state();
	let button: HTMLButtonElement | undefined = $state();
	let panel: HTMLElement | undefined = $state();

	/* Both off until the script runs, so the server-rendered and hydrated markup match. */
	let scripted = $state(false);
	let enhanced = $state(false);
	let text = $state('');
	const describedBy = $derived(
		[hint ? hintId : '', problem ? problemId : '', scripted ? textId : '']
			.filter(Boolean)
			.join(' ') || undefined
	);
	let expanded = $state(false);
	let ready = $state(false);
	let current = $state('');
	let focusAfterClose: 'input' | 'button' = 'button';

	onMount(() => {
		scripted = true;
		enhanced = matchMedia('(pointer: fine)').matches;
		text = show(input?.value ?? '');
	});

	/** Under the field, its right edge on the field's; above it when there is no room below. */
	function place() {
		if (!panel || !control) return;
		const field = control.getBoundingClientRect();
		const width = panel.offsetWidth;
		const height = panel.offsetHeight;
		const gap = 4;
		const edge = 8;
		const left = Math.min(Math.max(field.right - width, edge), innerWidth - width - edge);
		const below = innerHeight - field.bottom - gap - edge;
		const above = field.top - gap - edge;
		const top = height > below && above > below ? field.top - gap - height : field.bottom + gap;
		panel.style.setProperty('left', `${left}px`);
		panel.style.setProperty('top', `${Math.max(edge, top)}px`);
	}

	async function onToggle(event: Event) {
		const state = (event as ToggleEvent).newState;
		if (state === 'open') {
			expanded = true;
			focusAfterClose = 'button';
			current = input?.value ?? '';
			place();
			if (!ready) {
				await import('cally');
				ready = true;
			}
			await tick();
			place();
			(panel?.querySelector('calendar-month') as HTMLElement | null)?.focus();
		} else {
			expanded = false;
			(focusAfterClose === 'input' ? input : button)?.focus();
		}
	}

	/* Cally's change event does not bubble, and Svelte's `onchange` is delegated, so listen directly. */
	function listen(node: HTMLElement) {
		node.addEventListener('change', pick);
		return () => node.removeEventListener('change', pick);
	}

	function pick(event: Event) {
		const picked = (event.target as HTMLInputElement).value;
		if (!input || !picked) return;
		input.value = picked;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
		focusAfterClose = 'input';
		panel?.hidePopover();
	}
</script>

<div class="field {className}">
	<label for={id}>{label}</label>
	<div class="datefield" class:enhanced class:formatted={scripted} bind:this={control}>
		<!--
			A defaultValue: the server writes it into the page, and in the browser it only sets the
			field's default, so a page drawn in the browser is filled in and a date typed before the
			script arrived (slow phone) is never overwritten. The input owns its value from then on.
		-->
		<input
			bind:this={input}
			{id}
			type="date"
			{name}
			defaultValue={value}
			{min}
			{max}
			{required}
			aria-describedby={describedBy}
			aria-invalid={problem ? 'true' : undefined}
			oninput={() => (text = show(input?.value ?? ''))}
			onchange={() => (text = show(input?.value ?? ''))}
		/>
		{#if scripted}
			<!-- The date as the app writes it everywhere; the native input stays the value, under it. -->
			<span class="datefield-text" class:empty={!text} id={textId}>{text || 'Choose a date'}</span>
		{/if}
		{#if enhanced}
			<button
				bind:this={button}
				class="datefield-open"
				type="button"
				aria-label="Choose a date"
				aria-haspopup="dialog"
				aria-expanded={expanded}
				aria-controls={panelId}
				popovertarget={panelId}
			>
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
					<rect x="3.5" y="5" width="17" height="15.5" rx="3" />
					<path d="M3.5 10h17M8 3v4M16 3v4" />
				</svg>
			</button>
			<div
				bind:this={panel}
				id={panelId}
				class="datefield-panel"
				popover="auto"
				role="dialog"
				aria-label="Choose a date"
				ontoggle={onToggle}
			>
				{#if ready}
					<calendar-date
						value={current}
						min={min || undefined}
						max={max || undefined}
						{@attach listen}
					>
						<span slot="previous" role="img" aria-label="Previous month">
							<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
								><path d="m15 6-6 6 6 6" /></svg
							>
						</span>
						<span slot="next" role="img" aria-label="Next month">
							<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
								><path d="m9 6 6 6-6 6" /></svg
							>
						</span>
						<calendar-month></calendar-month>
					</calendar-date>
				{/if}
			</div>
		{/if}
	</div>
	{#if hint}<small class="hint" id={hintId}>{hint}</small>{/if}
	{#if problem}<p class="problem" id={problemId}>{problem}</p>{/if}
</div>
