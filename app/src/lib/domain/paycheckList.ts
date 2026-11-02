/**
 * The owner's own paycheck list (Handwritten Paycheck List): the pay, a rule, what the paycheck must
 * cover in the owner's groups, then three totals. Pure: the writers in `server/export` turn its lines
 * into a text file, a PDF or a Word document.
 *
 *     30000	Salary
 *     ---------------------
 *     *4500	Outreach          `*` optional
 *     /3000	Mika/Ren          `/` already paid
 *
 *     21000	Lorna
 *     ---------------------
 *     ...	Total (without the *OPTIONAL)
 */
import { compareDates, type CalDate } from './dates.ts';
import { sum, type Minor } from './money.ts';

/** One bill, loan payment or set-aside share the paycheck covers. */
export type ListEntry = {
	name: string;
	amount: Minor;
	/** When it is due; orders the lines and the groups. */
	date: CalDate;
	group?: string;
	optional?: boolean;
	paid?: boolean;
};

/** At most one mark per line: paid outranks optional, since a paid bill is no longer optional. */
export type Mark = '' | '*' | '/';

export type ListLine = { mark: Mark; amount: Minor; name: string };

export type PaycheckList = {
	pays: ListLine[];
	/** The lines in blocks, one per group; a blank line separates them. */
	blocks: ListLine[][];
	/** Every line except the `*` ones. */
	withoutOptional: Minor;
	/** Only the unmarked lines: what this salary still has to pay. */
	currentWeek: Minor;
	/** Every line. */
	all: Minor;
};

export const RULE = '-'.repeat(21);

export const TOTAL_WITHOUT_OPTIONAL = 'Total (without the *OPTIONAL)';
export const TOTAL_CURRENT_WEEK = 'Total (current salary week)';
export const TOTAL_ALL = 'Total (ALL)';

export const markOf = (e: Pick<ListEntry, 'paid' | 'optional'>): Mark =>
	e.paid ? '/' : e.optional ? '*' : '';

/** Two spellings of one group, "GCash" and " gcash", are the same group. */
export const groupKey = (group: string | undefined): string =>
	(group ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const byDateThenName = (a: ListEntry, b: ListEntry) =>
	compareDates(a.date, b.date) || a.name.localeCompare(b.name);

/**
 * Lays out one paycheck. Entries sharing a group form one block and the ungrouped form another; the
 * blocks follow their earliest due date, and the lines within a block follow theirs. The totals are
 * read from the marks, so anyone can check them by eye.
 */
export function paycheckList(
	pays: readonly { name: string; amount: Minor }[],
	entries: readonly ListEntry[]
): PaycheckList {
	const groups = new Map<string, ListEntry[]>();
	for (const e of entries) {
		const key = groupKey(e.group);
		groups.set(key, [...(groups.get(key) ?? []), e]);
	}

	const sorted = [...groups].map(([key, list]) => ({ key, list: list.toSorted(byDateThenName) }));
	sorted.sort(
		(a, b) =>
			compareDates(a.list[0].date, b.list[0].date) ||
			// On the same day, a named group comes before the ungrouped lines, then by name.
			Number(a.key === '') - Number(b.key === '') ||
			a.key.localeCompare(b.key)
	);

	const blocks = sorted.map(({ list }) =>
		list.map((e): ListLine => ({ mark: markOf(e), amount: e.amount, name: e.name }))
	);
	const lines = blocks.flat();
	const total = (keep: (l: ListLine) => boolean) => sum(lines.filter(keep).map((l) => l.amount));

	return {
		pays: pays.map((p) => ({ mark: '', amount: p.amount, name: p.name })),
		blocks,
		withoutOptional: total((l) => l.mark !== '*'),
		currentWeek: total((l) => l.mark === ''),
		all: total(() => true)
	};
}

/**
 * An amount the way the owner writes it: whole units with no separators, "50000", and the cents only
 * when there are some, "1234.50". Read from the integer, never through a float (ADR-0007).
 */
export function listAmount(amount: Minor): string {
	const sign = amount < 0 ? '-' : '';
	const abs = Math.abs(amount);
	const cents = abs % 100;
	const whole = (abs - cents) / 100;
	return `${sign}${whole}${cents === 0 ? '' : `.${String(cents).padStart(2, '0')}`}`;
}

/** The list as lines of text, each `mark amount TAB name`, exactly as the owner writes it. */
export function listLines(list: PaycheckList): string[] {
	const line = (l: ListLine) => `${l.mark}${listAmount(l.amount)}\t${l.name}`;
	const out = [...list.pays.map(line), RULE];
	list.blocks.forEach((block, i) => {
		if (i > 0) out.push('');
		out.push(...block.map(line));
	});
	out.push(
		RULE,
		`${listAmount(list.withoutOptional)}\t${TOTAL_WITHOUT_OPTIONAL}`,
		`${listAmount(list.currentWeek)}\t${TOTAL_CURRENT_WEEK}`,
		'',
		`${listAmount(list.all)}\t${TOTAL_ALL}`
	);
	return out;
}
