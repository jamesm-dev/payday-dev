/**
 * Sends one expense to the home screen's own `?/expense` action, the way SvelteKit's `enhance` does
 * (a JSON action request), but telling a missing network apart from everything else (ADR-0029): only
 * a request that never reached the site is kept on the phone to send again.
 */
import { deserialize, type ActionResult } from '$app/forms';
import { mark, readQueue } from './store.ts';

export type Sent =
	/** Saved, now or by an earlier send of the same id. `result` is the site's answer. */
	| { kind: 'saved'; result: ActionResult }
	/** The site checked it and said no; `problems` are its words, by field. */
	| { kind: 'refused'; result: ActionResult; problems: Record<string, string> }
	/** It never reached the site. */
	| { kind: 'offline' }
	/** The site wants a sign-in first. */
	| { kind: 'signed-out' }
	/** Anything else (the site is down, or answered oddly): try again later. */
	| { kind: 'failed' };

export type ExpenseFields = {
	amount: string;
	note: string;
	date: string;
	clientId: string;
	/** Set when the send comes from the queue, not from the form just now. */
	queued?: 'yes';
};

export async function sendExpense(fields: ExpenseFields): Promise<Sent> {
	let response: Response;
	try {
		response = await fetch('/?/expense', {
			method: 'POST',
			headers: {
				accept: 'application/json',
				'x-sveltekit-action': 'true',
				'content-type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams(fields),
			cache: 'no-store',
			credentials: 'same-origin'
		});
	} catch {
		return { kind: 'offline' };
	}
	if (response.status === 401) return { kind: 'signed-out' };
	let result: ActionResult;
	try {
		result = deserialize(await response.text());
	} catch {
		// Not an action's answer: a page (a sign-in redirect followed), or an error page.
		return response.redirected && new URL(response.url).pathname.startsWith('/signin')
			? { kind: 'signed-out' }
			: { kind: 'failed' };
	}
	if (result?.type === 'redirect' || result?.type === 'success') return { kind: 'saved', result };
	if (result?.type === 'failure') {
		const data = result.data as { expense?: { problems?: Record<string, string> } } | undefined;
		return { kind: 'refused', result, problems: data?.expense?.problems ?? {} };
	}
	return { kind: 'failed' };
}

let running: Promise<number> | null = null;

/**
 * Sends `owner`'s waiting expenses, oldest first, one at a time, and stops at the first that cannot
 * reach the site. Returns how many the site saved. One run at a time per page: a second call while
 * one runs gets the same answer.
 */
export function sendQueue(owner: string, onChange: () => void): Promise<number> {
	if (running) return running;
	// `.finally` runs after this assignment even when there is nothing to send.
	running = sendWaiting(owner, onChange).finally(() => {
		running = null;
	});
	return running;
}

async function sendWaiting(owner: string, onChange: () => void): Promise<number> {
	let saved = 0;
	const waiting = readQueue(owner)
		.filter((q) => q.state === 'waiting')
		.sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0));
	for (const q of waiting) {
		const sent = await sendExpense({
			amount: q.amountText,
			note: q.note,
			date: q.date,
			clientId: q.id,
			queued: 'yes'
		});
		if (sent.kind === 'saved') {
			mark(q.id, 'sent');
			saved++;
		} else if (sent.kind === 'refused') {
			const first = Object.values(sent.problems)[0];
			mark(q.id, 'refused', first ?? 'Payday could not save this one.');
		} else break;
		onChange();
	}
	return saved;
}
