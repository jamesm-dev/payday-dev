import type { Cookies } from '@sveltejs/kit';
import { currentSessionId } from './cookie.ts';
import { stepUps, type StepUpAction } from './stepUp.ts';

/** Whether the session behind these cookies may do `action` right now. */
export function stepUpAllows(cookies: Cookies, url: URL, action: StepUpAction): boolean {
	const sessionId = currentSessionId(cookies, url);
	return sessionId !== null && stepUps.allows(sessionId, action);
}
