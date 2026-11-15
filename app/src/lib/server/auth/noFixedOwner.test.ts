import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * TSK-4da7e9: there is no fixed owner. Anyone can sign up, so code that assumes "the owner is id 1"
 * would hand a stranger the first person's budget. This scans the sign-in code, the routes, the money,
 * reminder and export code and the hooks for the ways that assumption comes back: the old `OWNER_ID` constant, and a literal 1 standing in
 * for an owner id. Test files may name owner 1; they build that person on purpose.
 */
const SRC = join(import.meta.dirname, '..', '..', '..');
const SCANNED = [
	join(SRC, 'lib', 'server', 'auth'),
	join(SRC, 'lib', 'server', 'money'),
	join(SRC, 'lib', 'server', 'reminders'),
	join(SRC, 'lib', 'server', 'export'),
	join(SRC, 'routes'),
	join(SRC, 'hooks.server.ts')
];
/** Dev-only: the demo seed names owner 1 on purpose (and refuses to run in production). */
const EXEMPT = [join(SRC, 'lib', 'server', 'money', 'seed.ts')];

/** Ways a literal owner id 1 gets written. Each is checked on code with its comments removed. */
const FIXED_OWNER: { pattern: RegExp; what: string }[] = [
	{ pattern: /\bOWNER_ID\b/, what: 'the OWNER_ID constant' },
	{
		pattern: /\b(?:owner|ownerId|owner_id)\s*(?:[:=]|[!=]==?|\?\?|\|\|)\s*1\b/,
		what: 'ownerId set to or compared with 1'
	},
	{
		pattern: /\bownerId\s*\??\s*:\s*number\s*=\s*1\b/,
		what: 'an ownerId parameter that defaults to 1'
	},
	{
		pattern: /\beq\(\s*[\w.]*\b(?:owner\.id|ownerId|owner_id)\s*,\s*1\s*\)/,
		what: 'a query for owner 1'
	},
	{
		pattern: /\((?:db|tx|await getDb\(\))\s*,\s*1\s*[,)]/,
		what: 'a literal owner id 1 passed as the owner argument'
	},
	{ pattern: /\bvalues\(\s*\{\s*id\s*:\s*1\b/, what: 'an owner row inserted under id 1' }
];

const withoutComments = (code: string) =>
	code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function sourceFiles(path: string): string[] {
	if (statSync(path).isFile()) return EXEMPT.includes(path) ? [] : [path];
	return readdirSync(path, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile() && /\.(?:ts|js|svelte)$/.test(e.name))
		.filter((e) => !/\.(?:test|spec)\.(?:ts|js)$/.test(e.name))
		.map((e) => join(e.parentPath, e.name))
		.filter((file) => !EXEMPT.includes(file) && !file.split(sep).includes('scripts'));
}

function fixedOwnerIn(code: string): string[] {
	const text = withoutComments(code);
	return FIXED_OWNER.filter(({ pattern }) => pattern.test(text)).map(({ what }) => what);
}

describe('TSK-4da7e9 no code assumes a fixed owner', () => {
	it('finds the files it is meant to scan', () => {
		const files = SCANNED.flatMap(sourceFiles);
		expect(files.some((f) => f.endsWith('passkeys.ts'))).toBe(true);
		expect(files.some((f) => f.includes('signin'))).toBe(true);
		expect(files.some((f) => f.endsWith('loans.ts'))).toBe(true);
		expect(files.some((f) => f.endsWith('hooks.server.ts'))).toBe(true);
		expect(files.some((f) => f.endsWith('seed.ts'))).toBe(false);
	});

	it('notices each way an owner id 1 is written (so the scan cannot silently match nothing)', () => {
		expect(fixedOwnerIn("import { OWNER_ID } from './passkeys.ts';")).toHaveLength(1);
		expect(fixedOwnerIn('const ownerId = 1;')).toHaveLength(1);
		expect(fixedOwnerIn('return ownerId === 1;')).toHaveLength(1);
		expect(fixedOwnerIn('const ownerId = input.ownerId ?? 1;')).toHaveLength(1);
		expect(fixedOwnerIn('db.select().from(owner).where(eq(owner.id, 1))')).toHaveLength(1);
		expect(fixedOwnerIn('db.insert(owner).values({ id: 1, passwordHash })')).toHaveLength(1);
		expect(fixedOwnerIn('await listItems(db, 1)')).toHaveLength(1);
		expect(fixedOwnerIn('await eraseBudget(tx, 1, sessionId)')).toHaveLength(1);
		expect(fixedOwnerIn('await loadPlan(await getDb(), 1, now)')).toHaveLength(1);
		expect(fixedOwnerIn('await listItems(db, ownerId)')).toEqual([]);
		expect(fixedOwnerIn('const ownerId = locals.ownerId; // owner 1 is the first')).toEqual([]);
		expect(fixedOwnerIn('/* ownerId = 1 was the old way */ const ownerId = 2;')).toEqual([]);
	});

	it('finds no OWNER_ID and no hard-coded owner id 1 in the code that serves people', () => {
		const found = SCANNED.flatMap(sourceFiles).flatMap((file) =>
			fixedOwnerIn(readFileSync(file, 'utf8')).map(
				(what) => `${relative(SRC, file).split('\\').join('/')}: ${what}`
			)
		);
		expect(
			found,
			'Anyone can sign up, so no code may assume which owner is "the" owner. Take the owner id from the signed-in session (locals.ownerId) or from the credential, never from a constant.'
		).toEqual([]);
	});
});
