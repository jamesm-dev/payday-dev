// The ⋮ menus (#lib/ui/KebabMenu.svelte) close the way menus do: Escape (focus back on the button),
// a tap anywhere else, and choosing an item. A plain script, loaded on every page from the layout's
// <head> like the glow, because pages such as the Plan send no other JavaScript. Without it a menu
// is still a working <details>: its button opens and closes it.
(() => {
	const MENU = 'details.kebab';
	/** @param {HTMLDetailsElement} menu */
	const close = (menu) => {
		menu.open = false;
	};

	document.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape') return;
		const menu =
			event.target instanceof Element
				? event.target.closest(/** @type {'details'} */ (`${MENU}[open]`))
				: null;
		if (!menu) return;
		event.preventDefault();
		close(menu);
		menu.querySelector('summary')?.focus();
	});

	// Anywhere outside an open menu closes it; one opened by this tap is the one it lands in.
	document.addEventListener('pointerdown', (event) => {
		for (const menu of document.querySelectorAll(/** @type {'details'} */ (`${MENU}[open]`))) {
			if (!(event.target instanceof Node) || !menu.contains(event.target)) close(menu);
		}
	});

	// An item was chosen: a download starts and the page stays, so the menu should not.
	document.addEventListener('click', (event) => {
		const item = event.target instanceof Element ? event.target.closest('.kebab-items a') : null;
		const menu = item?.closest(/** @type {'details'} */ (MENU));
		if (menu) close(menu);
	});
})();
