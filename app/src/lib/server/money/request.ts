import { error } from '@sveltejs/kit';

/** The signed-in owner. The guard in hooks.server.ts already turned everyone else away. */
export function requireOwner(locals: App.Locals): number {
	if (locals.ownerId === null) error(401, 'Sign in to continue.');
	return locals.ownerId;
}

/** A submitted form as plain strings (a file field would arrive as a File and be ignored). */
export async function readForm(request: Request): Promise<Record<string, unknown>> {
	const data = await request.formData();
	const out: Record<string, unknown> = {};
	for (const [key, value] of data) if (typeof value === 'string') out[key] = value;
	return out;
}
