// The background glow follows the mouse. A plain script, loaded on every page (the layout's <head>,
// a hashed file under /_app/immutable), because many pages send no other JavaScript. It writes two
// CSS custom properties on <html>; the glow itself is CSS (src/routes/+layout.svelte).
// Phones and "reduce motion" are left alone: nothing to follow, and nothing should move.
(() => {
	const root = document.documentElement;
	const KEY = 'payday-glow';
	if (
		!window.matchMedia('(pointer: fine)').matches ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	) {
		return;
	}

	let target = { x: 0.5, y: 0.5 };
	try {
		// Where the mouse was on the last page, so a new page does not start the glow from the centre.
		const saved = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null');
		if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
			target = { x: saved.x, y: saved.y };
		}
	} catch {
		// Private browsing or a blocked store: start from the centre.
	}
	const now = { ...target };
	const write = () => {
		root.style.setProperty('--glow-x', now.x.toFixed(4));
		root.style.setProperty('--glow-y', now.y.toFixed(4));
	};
	write();

	let frame = 0;
	const tick = () => {
		// Ease toward the mouse, so the glow drifts after it rather than snapping to it.
		now.x += (target.x - now.x) * 0.08;
		now.y += (target.y - now.y) * 0.08;
		write();
		const moving = Math.abs(target.x - now.x) + Math.abs(target.y - now.y) > 0.0005;
		frame = moving ? window.requestAnimationFrame(tick) : 0;
	};

	window.addEventListener(
		'pointermove',
		(event) => {
			if (event.pointerType !== 'mouse') return;
			target = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight };
			if (!frame) frame = window.requestAnimationFrame(tick);
		},
		{ passive: true }
	);
	window.addEventListener('pagehide', () => {
		try {
			window.sessionStorage.setItem(KEY, JSON.stringify(target));
		} catch {
			// Nothing to keep; the next page starts from the centre.
		}
	});
})();
