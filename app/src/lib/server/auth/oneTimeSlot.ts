/**
 * A place to leave a value for exactly one later read, kept in server memory. The new recovery
 * codes go here between the POST that makes them and the GET that shows them, so that a reload
 * of the page shows nothing instead of re-sending the form and silently replacing them again.
 * One machine, so memory is enough; a restart in that gap only costs the owner another regenerate.
 */
export type OneTimeSlot<T> = {
	put(key: string, value: T, now?: number): void;
	/** Returns the value and removes it. Undefined when empty or expired. */
	take(key: string, now?: number): T | undefined;
	size(): number;
};

export function createOneTimeSlot<T>(ttlMs = 2 * 60 * 1000, maxKeys = 50): OneTimeSlot<T> {
	const slots = new Map<string, { value: T; expiresAt: number }>();
	return {
		put(key, value, now = Date.now()) {
			for (const [k, slot] of slots) if (slot.expiresAt <= now) slots.delete(k);
			slots.delete(key);
			slots.set(key, { value, expiresAt: now + ttlMs });
			while (slots.size > maxKeys) slots.delete(slots.keys().next().value as string);
		},
		take(key, now = Date.now()) {
			const slot = slots.get(key);
			slots.delete(key);
			return slot && slot.expiresAt > now ? slot.value : undefined;
		},
		size: () => slots.size
	};
}

/** The codes just made, per session. */
export const newRecoveryCodes = createOneTimeSlot<string[]>();
