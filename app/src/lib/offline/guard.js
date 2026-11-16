// What the phone keeps for when there is no signal belongs to one person (ADR-0029). A plain script,
// loaded on every page from the layout's <head> like the glow, because pages such as Settings send
// no other JavaScript. On each full page load it reads the layout's
// <meta name="payday-signed-in" content="yes|no|setup|unknown" data-owner="…">:
//
// - "no" (signed out) or "setup" (signed in, no number yet): the copy of the last number and plan
//   goes. Expenses not sent yet stay for their owner; the sign-in page asks about them.
// - "yes" with data-owner: anything of another person's goes, copy and queue.
// - "unknown" (a page drawn at build time): nothing changes.
//
// And on forms:
//
// - data-leaves="signout": first asks about any expense not sent yet, which signing out removes
//   from the phone along with the copy.
// - data-leaves="delete" (deleting the account) or "erase" (starting over): the copy goes at once
//   (the home screen makes it again if this fails). The queue goes only once it has happened: the
//   next page drawn signed out or in setup removes it; one drawn signed in (a mistyped
//   confirmation) keeps it; the offline page, which cannot tell, leaves the question for the next.
// - A form posted while the browser knows it has no network is not sent: the page goes to the
//   offline page, which says it was not saved, instead of the browser's own error. Forms a page's
//   own script already handles (it prevented the default) are left to that script.
//
// COPY and QUEUE are #lib/offline/store.ts's COPY_KEY and QUEUE_KEY; a unit test keeps them equal,
// and #lib/offline/store.ts's holdFor() does the same as the first list for pages changed by script.
(() => {
	const COPY = 'payday-offline-copy';
	const QUEUE = 'payday-offline-queue';
	const LEAVING = 'payday-offline-leaving';

	/** @param {'localStorage' | 'sessionStorage'} kind @returns {Storage | null} */
	const storage = (kind) => {
		try {
			return window[kind];
		} catch {
			return null;
		}
	};
	/** @param {() => void} task */
	const quietly = (task) => {
		try {
			task();
		} catch {
			// Storage is off or full: nothing is kept, and nothing breaks the page.
		}
	};
	/** @param {string} key */
	const remove = (key) => quietly(() => storage('localStorage')?.removeItem(key));
	/** @param {string} key @returns {unknown} */
	const read = (key) => {
		try {
			return JSON.parse(storage('localStorage')?.getItem(key) || 'null');
		} catch {
			return null;
		}
	};
	/** @returns {Record<string, unknown>[]} */
	const queue = () => {
		const list = read(QUEUE);
		return Array.isArray(list) ? list.filter((q) => q && typeof q === 'object') : [];
	};
	const unsent = () => queue().filter((q) => q.state !== 'sent').length;

	// A delete or a start over sent from the page before this one, in this tab.
	let leaving = false;
	const meta = document.querySelector('meta[name="payday-signed-in"]');
	const state = meta?.getAttribute('content');
	const owner = meta?.getAttribute('data-owner');
	quietly(() => {
		const session = storage('sessionStorage');
		leaving = session?.getItem(LEAVING) === '1';
		if (state === 'yes' || state === 'no' || state === 'setup') session?.removeItem(LEAVING);
	});
	if (state === 'no' || state === 'setup') {
		remove(COPY);
		if (leaving) remove(QUEUE);
	} else if (state === 'yes' && owner) {
		const copy = /** @type {{ owner?: unknown } | null} */ (read(COPY));
		if (copy && typeof copy === 'object' && copy.owner !== owner) remove(COPY);
		const list = queue();
		const mine = list.filter((q) => q.owner === owner);
		if (mine.length !== list.length) {
			quietly(() => {
				const local = storage('localStorage');
				if (mine.length) local?.setItem(QUEUE, JSON.stringify(mine));
				else local?.removeItem(QUEUE);
			});
		}
	}

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
		if (leaves === 'delete' || leaves === 'erase') {
			remove(COPY);
			quietly(() => storage('sessionStorage')?.setItem(LEAVING, '1'));
			return;
		}
		if (leaves !== 'signout') return;
		const count = unsent();
		const question =
			count === 1
				? 'One expense on this phone has not been sent yet. If you sign out, it will be removed from this phone. Sign out anyway?'
				: `${count} expenses on this phone have not been sent yet. If you sign out, they will be removed from this phone. Sign out anyway?`;
		if (count > 0 && !window.confirm(question)) {
			event.preventDefault();
			return;
		}
		remove(COPY);
		remove(QUEUE);
	});
})();
