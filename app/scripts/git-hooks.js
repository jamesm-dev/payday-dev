// Points git at the repository's .githooks/, so commits are linked to tasks and a push runs the
// checks. Runs from `prepare` on every install, so a fresh clone gets the hooks without anyone
// remembering. Does nothing where there is no git checkout, such as a Docker build.
import { execFileSync } from 'node:child_process';

try {
	/** @type {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} */
	const quiet = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
	if (execFileSync('git', ['rev-parse', '--is-inside-work-tree'], quiet).trim() === 'true') {
		// Relative to the repository root, where git runs hooks from.
		execFileSync('git', ['config', 'core.hooksPath', '.githooks'], quiet);
	}
} catch {
	// No git binary, or not inside a checkout: nothing to wire.
}
