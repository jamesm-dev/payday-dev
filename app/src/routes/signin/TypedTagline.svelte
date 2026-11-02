<script lang="ts">
	import { onMount, untrack } from 'svelte';

	/*
	 * The sign-in tagline, which also carries the page's error: the tagline is erased letter by letter,
	 * the message typed out in its place, held for a few seconds, erased, and the tagline typed back. The visible text
	 * is aria-hidden while it shows an error (typing would be read out letter by letter); a visually
	 * hidden role="alert" next to it carries the whole message at once. Without JavaScript the server
	 * renders the message (or the tagline) as plain text. Only textContent and a class change: the
	 * CSP forbids inline styles.
	 */
	let {
		tagline,
		message,
		key
	}: {
		tagline: string;
		message: string | null;
		/** Changes on every new error, so the same text animates again. */ key: string | number;
	} = $props();

	let el: HTMLParagraphElement;
	let showing = $state(untrack(() => message !== null));
	// What the alert says. It keeps the last message after the visible text goes back to the tagline.
	let announced = $state(untrack(() => message ?? ''));
	// Rendered once and never updated by Svelte: after mount the text is driven by textContent.
	const initial = untrack(() => message ?? tagline);

	type Animate = typeof import('animejs').animate;
	let animate: Animate | undefined;
	let current: { revert: () => unknown } | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let run = 0;

	// The one place the text is written: this element's only child is a text node Svelte never updates.
	// eslint-disable-next-line svelte/no-dom-manipulating
	const setText = (text: string) => (el.textContent = text);

	function stop() {
		run++;
		clearTimeout(timer);
		current?.revert();
		current = undefined;
	}

	const wait = (ms: number) => new Promise<void>((done) => (timer = setTimeout(done, ms)));

	function type(from: string, to: string, msPerChar: number) {
		// Typing out `to` from nothing, or erasing `from` down to nothing.
		const text = to === '' ? from : to;
		const erasing = to === '';
		return new Promise<void>((done) => {
			const state = { n: erasing ? text.length : 0 };
			const write = () => setText(text.slice(0, Math.round(state.n)));
			current = animate!(state, {
				n: erasing ? 0 : text.length,
				duration: Math.max(1, msPerChar * text.length),
				ease: 'linear',
				onUpdate: write,
				onComplete: () => {
					state.n = erasing ? 0 : text.length;
					write();
					done();
				}
			});
		});
	}

	/**
	 * `typed`: the message is already on screen, rendered by the server (no JavaScript, or not yet
	 * hydrated). Then it starts at the hold: nothing is erased or typed twice.
	 */
	async function play(text: string, reduced: boolean, typed: boolean) {
		const id = ++run;
		const stale = () => id !== run;
		announced = text;

		if (reduced) {
			showing = true;
			setText(text);
			await wait(Math.min(10000, Math.max(6000, 70 * text.length)));
			if (stale()) return;
			setText(tagline);
			showing = false;
			return;
		}

		animate ??= (await import('animejs')).animate;
		if (stale()) return;
		if (!typed) {
			// From whatever is visible now (normally the tagline): erase it, then type the message.
			await type(el.textContent ?? '', '', 15);
			if (stale()) return;
			showing = true;
			await type('', text, 30);
			if (stale()) return;
		}
		showing = true;
		await wait(Math.min(8000, Math.max(4000, 60 * text.length)));
		if (stale()) return;
		await type(text, '', 15);
		if (stale()) return;
		showing = false;
		await type('', tagline, 30);
	}

	/** The error went away early (the owner edited a field): erase what is visible, type the tagline. */
	async function restore(reduced: boolean) {
		const id = ++run;
		const stale = () => id !== run;
		if (reduced) {
			setText(tagline);
			showing = false;
			return;
		}
		animate ??= (await import('animejs')).animate;
		if (stale()) return;
		await type(el.textContent ?? '', '', 15);
		if (stale()) return;
		showing = false;
		await type('', tagline, 30);
	}

	let mounted = false;
	// The first message seen on mount is the one the server rendered.
	let first = true;
	onMount(() => {
		mounted = true;
		return stop;
	});

	$effect(() => {
		const text = message;
		void key;
		if (!mounted) return;
		untrack(() => {
			const rendered = first;
			first = false;
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
			if (text) {
				void play(text, reduced, rendered);
			} else if ((el.textContent ?? '') !== tagline) {
				// Whatever was showing (an error, or the tagline half typed back): erase it and type the
				// whole tagline back, the same way the sequence ends on its own.
				void restore(reduced);
			} else {
				showing = false;
			}
		});
		return stop;
	});
</script>

<p class="tagline" class:error={showing} aria-hidden={showing} bind:this={el}>{initial}</p>
{#if announced}
	<!-- Re-created per message, so the same words again are announced again. -->
	{#key key}
		<p class="visually-hidden" role="alert" id="signin-error">{announced}</p>
	{/key}
{/if}

<style>
	/* Room for two lines, so the form below does not jump when an error replaces the tagline. */
	.tagline {
		min-height: calc(2 * var(--text-base) * var(--leading-body));
		margin: var(--space-2) 0 var(--space-4);
		color: var(--color-text-muted);
		font-size: var(--text-base);
		line-height: var(--leading-body);
		text-align: center;
	}

	.tagline.error {
		color: var(--color-warn);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
