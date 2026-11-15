// What the phone keeps for when there is no signal belongs to one person (ADR-0029). A plain script,
// loaded on every page from the layout's <head> like the glow, because pages such as Settings send
// no other JavaScript. It does two things:
//
// - On a page drawn for someone signed out (the layout's <meta name="payday-signed-in"
//   content="no">), it removes the copy of the last number and plan. Expenses not sent yet stay
//   for their owner; the sign-in page asks about them.
// - When a form marked data-leaves="signout" is sent, it first asks about any expense not sent yet:
//   signing out removes it from the phone. A form marked data-leaves="delete" (deleting the account)
//   removes everything without asking: the account and all it held are going.
// - A form posted while the browser knows it has no network is not sent: the page goes to the
//   offline page, which says it was not saved, instead of the browser's own error. Forms that a
//   page's own script already handles (it prevented the default) are left to that script.
//
// The two names are #lib/offline/store.ts's COPY_KEY and QUEUE_KEY; a unit test keeps them equal.
(() => {
	const COPY = 'payday-offline-copy';
	const QUEUE = 'payday-offline-queue';

	/** @returns {Storage | null} */
	const storage = () => {
		try {
			return window.localStorage;
		} catch {
			return null;
		}
	};
	/** @param {string} key */
	const remove = (key) => {
		try {
			storage()?.removeItem(key);
		} catch {
			// Storage is off: nothing is kept.
		}
	};
	const unsent = () => {
		try {
			const list = JSON.parse(storage()?.getItem(QUEUE) || '[]');
			return Array.isArray(list)
				? list.filter((q) => q && typeof q === 'object' && q.state !== 'sent').length
				: 0;
		} catch {
			return 0;
		}
	};

	const meta = document.querySelector('meta[name="payday-signed-in"]');
	if (meta?.getAttribute('content') === 'no') remove(COPY);

	document.addEventListener('submit', (event) => {
		const form = event.target;
		if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
		if (navigator.onLine === false && form.method.toLowerCase() === 'post') {
			// Nothing is sent, so nothing ends and nothing is removed.
			event.preventDefault();
			location.assign('/offline?unsaved=1');
			return;
		}
		const leaves = form.dataset.leaves;
		if (leaves !== 'signout' && leaves !== 'delete') return;
		if (leaves === 'signout') {
			const count = unsent();
			const question =
				count === 1
					? 'One expense on this phone has not been sent yet. If you sign out, it will be removed from this phone. Sign out anyway?'
					: `${count} expenses on this phone have not been sent yet. If you sign out, they will be removed from this phone. Sign out anyway?`;
			if (count > 0 && !window.confirm(question)) {
				event.preventDefault();
				return;
			}
		}
		remove(COPY);
		remove(QUEUE);
	});
})();
