/**
 * Money as integer minor units (cents), ADR-0007. Everything here works on whole numbers or on the
 * digits of a string; an amount never passes through a float.
 */

declare const minorBrand: unique symbol;

/** A whole number of minor units. Only `minor()` and the helpers below make one. */
export type Minor = number & { readonly [minorBrand]: 'Minor' };

/** Brands a number as Minor, throwing unless it is a safe integer. */
export function minor(n: number): Minor {
	if (!Number.isSafeInteger(n)) {
		throw new RangeError(`Not a whole number of minor units: ${n}`);
	}
	// Normalise -0 to 0 so equality and formatting never see a negative zero.
	return (n === 0 ? 0 : n) as Minor;
}

export function add(a: Minor, b: Minor): Minor {
	return minor(a + b);
}

export function sub(a: Minor, b: Minor): Minor {
	return minor(a - b);
}

export function neg(a: Minor): Minor {
	return minor(0 - a);
}

export function sum(values: readonly Minor[]): Minor {
	let total = 0;
	for (const v of values) total = minor(total + v);
	return minor(total);
}

/**
 * Splits `total` into `parts` amounts that sum exactly to it. The remainder goes one unit at a
 * time to the earliest parts. A negative total splits its magnitude and negates each part.
 */
export function splitEvenly(total: Minor, parts: number): Minor[] {
	if (!Number.isSafeInteger(parts) || parts < 1) {
		throw new RangeError(`Cannot split into ${parts} parts`);
	}
	const negative = total < 0;
	const magnitude = Math.abs(total);
	const remainder = magnitude % parts;
	const base = (magnitude - remainder) / parts;
	const out: Minor[] = [];
	for (let i = 0; i < parts; i++) {
		const share = base + (i < remainder ? 1 : 0);
		out.push(negative ? neg(minor(share)) : minor(share));
	}
	return out;
}

const AMOUNT = /^(-?)(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?$/;

/**
 * Parses user input such as `1,234.56`, `12`, `12.5` or `-3.07` into minor units, reading the
 * digits of the string. Throws a SyntaxError on junk, on more than two decimals, and on a bare
 * `-` or `.`; throws a RangeError when the amount is too large to hold exactly.
 */
export function parseMinor(text: string): Minor {
	const match = AMOUNT.exec(text.trim());
	const whole = match?.[2];
	const fraction = match?.[3];
	if (!match || (whole === undefined && fraction === undefined)) {
		throw new SyntaxError(`Not an amount: "${text}"`);
	}
	const major = whole === undefined ? 0 : Number(whole.replaceAll(',', ''));
	const cents = fraction === undefined ? 0 : Number(fraction.padEnd(2, '0'));
	const value = minor(major * 100 + cents);
	return match[1] === '-' ? neg(value) : value;
}

/**
 * Formats an integer amount of minor units (cents) as a decimal string, without ever passing the
 * amount through a float (ADR-0007). Currency and locale arrive with first-run setup in Phase 1.
 */
export function formatMinor(minorUnits: number): string {
	if (!Number.isSafeInteger(minorUnits)) {
		throw new RangeError(`Not a whole number of minor units: ${minorUnits}`);
	}
	const sign = minorUnits < 0 ? '-' : '';
	const abs = Math.abs(minorUnits);
	const major = Math.floor(abs / 100).toLocaleString('en-US');
	const cents = String(abs % 100).padStart(2, '0');
	return `${sign}${major}.${cents}`;
}
