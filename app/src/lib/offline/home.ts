/**
 * The home screen's offline work (ADR-0029), loaded only when it is needed: when something is kept
 * on the phone, or when the quick-add form is sent. It stays out of the home screen's first
 * JavaScript (its 60 KB budget). The service worker keeps it with the rest of the build, so it loads
 * with no signal too.
 */
import { applyAction } from '$app/forms';
import { checkExpense } from '#lib/checks.ts';
import type { CopyFacts } from '#lib/server/money/home.ts';
import { ownerTodayIn } from './adjust.ts';
import { sendExpense } from './send.ts';
import { enqueue, newId, type Queued } from './store.ts';

export { withQueued } from './adjust.ts';
export { sendQueue } from './send.ts';

type Fields = { amount: string; note: string; date: string };

/** What became of an expense sent from the quick-add form. */
export type Added = 'saved' | 'refused' | 'kept' | 'kept-signed-out' | 'not-kept';

const refuse = (fields: Fields, problems: Record<string, string>) =>
	applyAction({
		type: 'failure',
		status: 400,
		data: { expense: { values: fields, problems } },
		location: '/'
	});

/**
 * The quick-add form, sent the way `enhance` would, with an id made here so a repeat saves nothing.
 *
 * - Saved: it is also kept on the phone as sent, until data the site sends afterwards holds it. If
 *   that data never arrives (the page that follows fails to load), the copy still shows it, so it
 *   is not typed in twice.
 * - Not saved, for any reason but the site's own refusal (no network, signed out, the site down or
 *   answering oddly): checked by the site's own rules and kept on the phone, to send later.
 */
export async function addFromForm(
	element: HTMLFormElement,
	owner: string,
	facts: CopyFacts
): Promise<Added> {
	const entered = new FormData(element);
	const fields: Fields = {
		amount: String(entered.get('amount') ?? ''),
		note: String(entered.get('note') ?? ''),
		date: String(entered.get('date') ?? '')
	};
	const id = newId();
	const checked = checkExpense(fields, ownerTodayIn(facts, new Date()));
	const queued = (state: Queued['state']): Queued | null =>
		checked.ok
			? {
					id,
					owner,
					amount: checked.value.amount,
					amountText: fields.amount,
					note: checked.value.note ?? '',
					date: checked.value.spentOn,
					loggedAt: new Date().toISOString(),
					state,
					...(state === 'sent' ? { sentAt: Date.now() } : {})
				}
			: null;

	const sent = await sendExpense({ ...fields, clientId: id });
	if (sent.kind === 'saved') {
		const item = queued('sent');
		if (item) enqueue(item);
		element.reset();
		await applyAction(sent.result);
		return 'saved';
	}
	if (sent.kind === 'refused') {
		await applyAction(sent.result);
		return 'refused';
	}
	if (!checked.ok) {
		await refuse(fields, checked.problems);
		return 'refused';
	}
	if (!enqueue(queued('waiting')!)) {
		await refuse(fields, {
			amount: 'Payday could not be reached, and this phone could not keep it. Please try again.'
		});
		return 'not-kept';
	}
	element.reset();
	await applyAction({ type: 'success', status: 200, location: '/' });
	return sent.kind === 'signed-out' ? 'kept-signed-out' : 'kept';
}
