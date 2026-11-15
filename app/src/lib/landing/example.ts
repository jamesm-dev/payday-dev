/**
 * The product page's "try it" example: Payday's arithmetic in miniature. What comes in this payday,
 * less every bill and loan payment due before the next one, is what is safe to spend until then.
 * All money is whole minor units (centavos, cents), never a float (ADR-0007). It is an example on
 * the public page, never anyone's budget: the app's own engine is in src/lib/domain.
 */

export type ExampleInput = {
	/** The pay that lands this payday. */
	pay: number;
	/** Every bill due before the next payday. */
	bills: number;
	/** Every loan payment due before the next payday. */
	loans: number;
	/** Days until the next payday, 1 or more. */
	days: number;
};

export type ExampleResult = {
	/** Safe to spend until payday; below zero when the bills and loans need more than the pay. */
	safe: number;
	/** About this much a day, rounded down to a whole unit of money; 0 when nothing is left. */
	perDay: number;
	/** What the pay is short by, 0 when it covers everything. */
	short: number;
	/** The shares of the bar: bills, loans and what is left, as parts of the larger of pay and costs. */
	shares: { bills: number; loans: number; safe: number };
};

/** The sliders' range and first position, in minor units of the example currency (pesos). */
export const EXAMPLE = {
	currency: 'PHP',
	pay: { min: 500_000, max: 8_000_000, step: 50_000, start: 1_800_000 },
	bills: { min: 0, max: 6_000_000, step: 50_000, start: 750_000 },
	loans: { min: 0, max: 3_000_000, step: 50_000, start: 250_000 },
	days: { min: 1, max: 31, step: 1, start: 15 }
} as const;

const UNIT = 100;

export function exampleNumber({ pay, bills, loans, days }: ExampleInput): ExampleResult {
	for (const [name, value] of Object.entries({ pay, bills, loans, days })) {
		if (!Number.isSafeInteger(value) || value < 0)
			throw new RangeError(`${name} must be a whole number`);
	}
	if (days < 1) throw new RangeError('days must be 1 or more');

	const safe = pay - bills - loans;
	const perDay = safe > 0 ? Math.floor(safe / days / UNIT) * UNIT : 0;
	const whole = Math.max(pay, bills + loans);
	const share = (part: number) => (whole === 0 ? 0 : part / whole);
	return {
		safe,
		perDay,
		short: safe < 0 ? -safe : 0,
		shares: { bills: share(bills), loans: share(loans), safe: share(Math.max(safe, 0)) }
	};
}
