import type { Cookies } from '@sveltejs/kit';
import type { Db } from '#lib/server/db/open.ts';
import { currentSessionId } from './cookie.ts';
import { stepUps, type StepUpAction } from './stepUp.ts';

/** Whether the session behind these cookies may do `action` right now. */
export async function stepUpAllows(
	db: Db,
	cookies: Cookies,
	url: URL,
	action: StepUpAction
): Promise<boolean> {
	const sessionId = currentSessionId(cookies, url);
	return sessionId !== null && (await stepUps.allows(db, sessionId, action));
}
