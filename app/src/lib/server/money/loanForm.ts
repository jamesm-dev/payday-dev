/**
 * What the loan forms may send, checked before anything reaches the database. Each kind of loan asks
 * only for the fields it needs, and a field it does not need is ignored, so a forged form cannot
 * give a bill-paying plan a card's minimum. Messages are for someone who has never kept a budget.
 * Pure: no database, no framework.
 */
import { isLoanType, type LoanType } from '#lib/domain/loans.ts';
import { TYPE_WORDS } from '#lib/loans/words.ts';
import { minor, parseMinor, type Minor } from '#lib/domain/money.ts';
import type { Checked, Problems } from './validate.ts';

export { TYPE_LABELS, TYPE_WORDS, bpToPercent } from '#lib/loans/words.ts';

const MAX_NAME = 60;
/** 1,000.00% a year: higher is a typo, and keeps every product in the engine a safe integer. */
const MAX_RATE_BP = 100_000;

/** Reads "22.99", "22.99%" or "5" as basis points from the digits, never through a float. */
export function parsePercentBp(raw: string): number | null {
	const match = /^(\d{1,4})(?:\.(\d{1,2}))?\s*%?$/.exec(raw.trim());
	if (!match) return null;
	return Number(match[1]) * 100 + (match[2] === undefined ? 0 : Number(match[2].padEnd(2, '0')));
}

const text = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

/** An amount owed: zero is allowed (paid off), a minus sign is not. */
export function checkOwed(raw: unknown, what = 'Enter how much is owed'): Checked<Minor> {
	const s = text(raw);
	if (!s)
		return { ok: false, problems: { balance: `${what}, like 1,200.50. Use 0 if it is paid off.` } };
	try {
		const amount = parseMinor(s);
		if (amount < 0)
			return { ok: false, problems: { balance: 'Enter the amount without a minus sign.' } };
		return { ok: true, value: amount };
	} catch (error) {
		return {
			ok: false,
			problems: {
				balance:
					error instanceof RangeError
						? 'That amount is too big.'
						: 'Use numbers only, like 1,200.50, with at most two digits after the dot.'
			}
		};
	}
}

export type LoanFields = {
	type: LoanType;
	name: string;
	lender: string | null;
	balance: Minor;
	/** Basis points a year; null is unknown. */
	rateBp: number | null;
	/** The schedule item that carries the payments; null for none. */
	scheduleItemId: number | null;
	minPctBp: number | null;
	minFloor: Minor | null;
};

/**
 * The add and edit forms: `name`, `lender`, `balance`, `rate` (empty is unknown), `item` (a schedule
 * item id, or empty) and, for a card, `minPct` and `minFloor`. The type comes from the address, not
 * the form.
 */
export function checkLoanFields(type: unknown, form: Record<string, unknown>): Checked<LoanFields> {
	const problems: Problems = {};
	if (!isLoanType(type))
		return { ok: false, problems: { type: 'Choose what kind of loan this is.' } };

	const name = text(form.name).replace(/\s+/g, ' ');
	if (!name) problems.name = 'Give it a name, like Visa or Car loan.';
	else if (name.length > MAX_NAME) problems.name = `Keep the name under ${MAX_NAME} letters.`;

	const lenderText = text(form.lender).replace(/\s+/g, ' ');
	if (lenderText.length > MAX_NAME) problems.lender = `Keep this under ${MAX_NAME} letters.`;

	const balance = checkOwed(form.balance);
	if (!balance.ok) problems.balance = balance.problems.balance;

	let rateBp: number | null = null;
	const rateText = text(form.rate);
	if (rateText) {
		rateBp = parsePercentBp(rateText);
		if (rateBp === null || rateBp > MAX_RATE_BP) {
			problems.rate =
				'Enter the yearly rate as a percentage, like 22.99. Leave it empty if you do not know.';
			rateBp = null;
		}
	}

	let scheduleItemId: number | null = null;
	const itemText = text(form.item);
	if (itemText) {
		if (!/^\d{1,9}$/.test(itemText)) problems.item = 'Choose one of the listed payments.';
		else scheduleItemId = Number(itemText);
	}

	let minPctBp: number | null = null;
	let minFloor: Minor | null = null;
	if (TYPE_WORDS[type].minimum) {
		const pctText = text(form.minPct);
		if (pctText) {
			minPctBp = parsePercentBp(pctText);
			if (minPctBp === null || minPctBp > 10_000) {
				problems.minPct = 'Enter a percentage from 0 to 100, like 2.';
				minPctBp = null;
			}
		}
		const floorText = text(form.minFloor);
		if (floorText) {
			try {
				const floor = parseMinor(floorText);
				if (floor < 0) throw new SyntaxError('negative');
				minFloor = minor(floor);
			} catch {
				problems.minFloor = 'Use numbers only, like 25 or 25.50.';
			}
		}
		if (
			!problems.minPct &&
			!problems.minFloor &&
			minPctBp === null &&
			minFloor === null &&
			scheduleItemId === null
		) {
			problems.minPct =
				'A card needs either a payment from your schedule, or its minimum: a percentage, a smallest amount, or both.';
		}
	}

	if (Object.keys(problems).length > 0 || !balance.ok) return { ok: false, problems };
	return {
		ok: true,
		value: {
			type,
			name,
			lender: lenderText || null,
			balance: balance.value,
			rateBp,
			scheduleItemId,
			minPctBp,
			minFloor
		}
	};
}

/** The field that carries one loan's balance at a check-in. */
export const loanField = (loanId: number | string) => `balance:${loanId}`;

/**
 * Every open loan listed must get a balance, zero allowed. Answers for loans that were not listed
 * are ignored, so a forged form cannot add one.
 */
export function checkLoanAnswers(
	form: Record<string, unknown>,
	ids: readonly number[]
): Checked<Map<number, Minor>> {
	const answers = new Map<number, Minor>();
	const problems: Problems = {};
	for (const id of ids) {
		const result = checkOwed(form[loanField(id)], 'Enter the balance');
		if (result.ok) answers.set(id, result.value);
		else problems[loanField(id)] = result.problems.balance;
	}
	if (Object.keys(problems).length > 0) return { ok: false, problems };
	return { ok: true, value: answers };
}
