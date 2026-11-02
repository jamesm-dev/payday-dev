/**
 * The words the loan screens use for each kind of loan. Plain text with no server code, so both the
 * forms and the server can import it.
 */
import type { LoanType } from '#lib/domain/loans.ts';

export const TYPE_LABELS: Record<LoanType, string> = {
	'credit-card': 'Credit card',
	instalment: 'Loan with fixed payments',
	bnpl: 'Buy now, pay later',
	informal: 'Money owed to a person'
};

/** The words each kind's form uses, and what it needs. */
export const TYPE_WORDS: Record<
	LoanType,
	{
		title: string;
		nameExample: string;
		lender: string;
		lenderExample: string;
		balance: string;
		rateHint: string;
		minimum: boolean;
	}
> = {
	'credit-card': {
		title: 'Add a credit card',
		nameExample: 'For example: Visa, or Store card',
		lender: 'Who is it with?',
		lenderExample: 'The bank or store. You can leave this empty.',
		balance: 'How much is owed on it now?',
		rateHint:
			'The yearly rate (APR) on your statement. If you do not know it, leave it empty: Payday will say it is unknown.',
		minimum: true
	},
	instalment: {
		title: 'Add a loan with fixed payments',
		nameExample: 'For example: Car loan, Student loan, Personal loan',
		lender: 'Who is it with?',
		lenderExample: 'The bank or lender. You can leave this empty.',
		balance: 'How much is left to pay?',
		rateHint:
			'The yearly rate (APR) on your agreement. If you do not know it, leave it empty: Payday will say it is unknown.',
		minimum: false
	},
	bnpl: {
		title: 'Add a buy now, pay later plan',
		nameExample: 'For example: Laptop instalments, Sofa plan',
		lender: 'Who runs the plan?',
		lenderExample: 'For example: Afterpay, Klarna, the shop. You can leave this empty.',
		balance: 'How much is left to pay?',
		rateHint:
			'Most of these plans charge no interest, so this starts at 0. Change it if yours does; empty means you do not know.',
		minimum: false
	},
	informal: {
		title: 'Add money you owe a person',
		nameExample: 'For example: Loan from Dad, Money owed to a friend',
		lender: 'Who do you owe?',
		lenderExample: 'Their name. You can leave this empty.',
		balance: 'How much is left to pay back?',
		rateHint:
			'Most of these charge no interest, so this starts at 0. Change it if yours does; empty means you do not know.',
		minimum: false
	}
};

/** Plain rate text for refilling an input: 2299 -> "22.99". */
export function bpToPercent(bp: number): string {
	const whole = Math.floor(bp / 100);
	const rest = bp % 100;
	return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0').replace(/0$/, '')}`;
}

/** What the loan form's boxes hold, as typed. */
export type LoanValues = {
	name: string;
	lender: string;
	balance: string;
	rate: string;
	item: string;
	minPct: string;
	minFloor: string;
};

/** The boxes of a submitted loan form, as strings, for refilling after a mistake. */
export function loanValues(form: Record<string, unknown>): LoanValues {
	const field = (key: keyof LoanValues) => String(form[key] ?? '');
	return {
		name: field('name'),
		lender: field('lender'),
		balance: field('balance'),
		rate: field('rate'),
		item: field('item'),
		minPct: field('minPct'),
		minFloor: field('minFloor')
	};
}
