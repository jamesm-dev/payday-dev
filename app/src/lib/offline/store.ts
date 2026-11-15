/**
 * What the phone keeps for when there is no signal (ADR-0029): the last copy of the home screen,
 * and the expenses logged while offline that the site has not saved yet. Both live in local storage
 * under two keys, belong to one person, and are read back defensively: storage can be full, turned
 * off, cleared by the browser, or hold something an older version wrote, and none of that may break
 * a page. Every function here fails quietly and reports nothing kept.
 *
 * `#lib/offline/guard.js`, a plain script on every page, removes them by the same two names; a unit
 * test keeps the names the same in both files.
 */
import type { CalDate } from '#lib/domain/dates.ts';
import type { CopyFacts, HomeView } from '#lib/server/money/home.ts';

export const COPY_KEY = 'payday-offline-copy';
export const QUEUE_KEY = 'payday-offline-queue';

export type ReadyView = Extract<HomeView, { state: 'ready' }>;

/** The last home screen this phone showed, and whose it was. */
export type Copy = { v: 1; owner: number; view: ReadyView; facts: CopyFacts };

/**
 * An expense logged on the phone. `waiting`: not saved on the site yet. `sent`: the site said it is
 * saved, and the copy may not show it yet (it is dropped at the next data from the site).
 * `refused`: the site said no, with its reason, and only the person can fix or remove it.
 */
export type Queued = {
	id: string;
	owner: number;
	/** In minor units, as the checks read it. */
	amount: number;
	/** Exactly as typed, which is what the site reads and checks again. */
	amountText: string;
	note: string;
	date: CalDate;
	/** When it was logged on the phone, ISO. */
	loggedAt: string;
	state: 'waiting' | 'sent' | 'refused';
	problem?: string;
};

function storage(): Storage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		// Safari with all storage blocked throws on the property itself.
		return null;
	}
}

function read(key: string): unknown {
	try {
		const raw = storage()?.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function write(key: string, value: unknown): boolean {
	try {
		const store = storage();
		if (!store) return false;
		store.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

function remove(key: string): void {
	try {
		storage()?.removeItem(key);
	} catch {
		// Nothing to remove, or storage is off: either way nothing is kept.
	}
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isDay = (v: unknown): v is CalDate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Enough of a copy to show without throwing: anything else is treated as no copy. */
function isCopy(v: unknown): v is Copy {
	if (!isObject(v) || v.v !== 1 || typeof v.owner !== 'number') return false;
	const { view, facts } = v;
	return (
		isObject(view) &&
		view.state === 'ready' &&
		typeof view.amount === 'string' &&
		Array.isArray(view.expenses) &&
		Array.isArray(view.reserved) &&
		Array.isArray(view.setAsides) &&
		Array.isArray(view.paidEarlyLines) &&
		isObject(facts) &&
		Number.isSafeInteger(facts.amountMinor) &&
		Number.isSafeInteger(facts.expensesTotalMinor) &&
		isDay(facts.balanceAsOf) &&
		isDay(facts.nextPayday) &&
		typeof facts.timeZone === 'string' &&
		typeof facts.at === 'string'
	);
}

function isQueued(v: unknown): v is Queued {
	return (
		isObject(v) &&
		typeof v.id === 'string' &&
		typeof v.owner === 'number' &&
		Number.isSafeInteger(v.amount) &&
		typeof v.amountText === 'string' &&
		typeof v.note === 'string' &&
		isDay(v.date) &&
		typeof v.loggedAt === 'string' &&
		(v.state === 'waiting' || v.state === 'sent' || v.state === 'refused')
	);
}

export function readCopy(): Copy | null {
	const copy = read(COPY_KEY);
	return isCopy(copy) ? copy : null;
}

export function dropCopy(): void {
	remove(COPY_KEY);
}

/** Every queued expense on the phone, whoever's; `owner` narrows it to one person's. */
export function readQueue(owner?: number): Queued[] {
	const list = read(QUEUE_KEY);
	if (!Array.isArray(list)) return [];
	return list.filter(isQueued).filter((q) => owner === undefined || q.owner === owner);
}

function saveQueue(queue: Queued[]): boolean {
	if (queue.length === 0) {
		remove(QUEUE_KEY);
		return true;
	}
	return write(QUEUE_KEY, queue);
}

/** Keeps one more expense. False when the phone would not keep it (storage full or off). */
export function enqueue(item: Queued): boolean {
	return saveQueue([...readQueue().filter((q) => q.id !== item.id), item]);
}

/** Changes one queued expense's state, by its id. */
export function mark(id: string, state: Queued['state'], problem?: string): void {
	saveQueue(
		readQueue().map((q) =>
			q.id === id ? { ...q, state, ...(problem ? { problem } : { problem: undefined }) } : q
		)
	);
}

export function unqueue(id: string): void {
	saveQueue(readQueue().filter((q) => q.id !== id));
}

/** Removes the copy and every queued expense: signing out, or deleting the account. */
export function forgetAll(): void {
	remove(COPY_KEY);
	remove(QUEUE_KEY);
}

/**
 * Fresh data from the site, for `owner`: anything of another person's goes (they cannot be sent by
 * this person, and must not be seen), the expenses already sent go (this data holds them), and the
 * copy becomes this screen. With no number to show (`view` null), no copy is kept.
 * Returns this person's queue as it now stands.
 */
export function adopt(owner: number, view: ReadyView | null, facts: CopyFacts | null): Queued[] {
	const copy = readCopy();
	if (copy && copy.owner !== owner) dropCopy();
	const queue = readQueue().filter((q) => q.owner === owner && q.state !== 'sent');
	saveQueue(queue);
	if (view && facts) write(COPY_KEY, { v: 1, owner, view, facts } satisfies Copy);
	else dropCopy();
	return queue;
}

/**
 * An id for an expense, made on the phone: `crypto.randomUUID()` where the browser has it, else the
 * same version 4 format from `crypto.getRandomValues` (older iPhones, before iOS 15.4).
 */
export function newId(): string {
	if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	const b = crypto.getRandomValues(new Uint8Array(16));
	b[6] = (b[6]! & 0x0f) | 0x40;
	b[8] = (b[8]! & 0x3f) | 0x80;
	const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
