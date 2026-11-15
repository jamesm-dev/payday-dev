/**
 * The product page's motion, with anime.js (ADR-0025): each section rises into view as it is
 * scrolled to, the phone in the first screen floats, and the notes beside it pop in. Imported only
 * by the signed-out page, so none of it reaches the signed-in home screen.
 *
 * Nothing is hidden from a page without script: an element waits hidden only under the CSS media
 * query `(scripting: enabled) and (prefers-reduced-motion: no-preference)`, a CSS fallback shows it
 * after a few seconds if this never runs, and `.motion` on the page hands it over to this file.
 * A visitor who asks for less motion gets none.
 */

const REVEAL = '[data-reveal]';

export async function startMotion(root: HTMLElement): Promise<() => void> {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

	let anime: typeof import('animejs');
	try {
		anime = await import('animejs');
	} catch {
		// No motion library: show everything now rather than wait for the CSS fallback.
		root.classList.add('motion-off');
		return () => {};
	}
	const { animate, stagger } = anime;
	const running: { revert: () => unknown }[] = [];

	// From here this file decides when each hidden element appears.
	root.classList.add('motion');

	const rise = (targets: Element | Element[], delay = 0) =>
		running.push(
			animate(targets, {
				opacity: [0, 1],
				translateY: [24, 0],
				duration: 700,
				delay: Array.isArray(targets) ? stagger(90, { start: delay }) : delay,
				ease: 'outCubic'
			})
		);

	// Each section's parts rise together, one after another, as the section comes into view.
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				observer.unobserve(entry.target);
				// Only the parts are ever hidden (Landing.svelte's CSS); the section itself is the trigger.
				const parts = [...entry.target.querySelectorAll('[data-reveal-part]')];
				if (parts.length > 0) rise(parts);
			}
		},
		// As soon as a section's top is a little way into the screen: a tall section on a small phone
		// may never show a set share of itself at once.
		{ rootMargin: '0px 0px -10% 0px', threshold: 0 }
	);
	for (const el of root.querySelectorAll(REVEAL)) observer.observe(el);

	// The first screen: the notes beside the phone pop in, then the phone floats, gently, for good.
	const notes = [...root.querySelectorAll('[data-pop]')];
	if (notes.length > 0) {
		running.push(
			animate(notes, {
				opacity: [0, 1],
				scale: [0.85, 1],
				translateY: [12, 0],
				duration: 600,
				delay: stagger(220, { start: 350 }),
				ease: 'outBack'
			})
		);
	}
	const phone = root.querySelector('[data-float]');
	if (phone) {
		running.push(
			animate(phone, {
				translateY: [0, -10],
				duration: 3200,
				alternate: true,
				loop: true,
				ease: 'inOutSine'
			})
		);
	}

	return () => {
		observer.disconnect();
		for (const animation of running) animation.revert();
	};
}
