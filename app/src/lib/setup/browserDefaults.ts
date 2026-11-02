/**
 * Guesses for the first setup question, read from the browser. They only prefill a form the owner
 * still confirms, so a wrong guess costs one tap.
 */
const EURO = ['DE', 'FR', 'ES', 'IT', 'NL', 'IE', 'PT', 'BE', 'AT', 'FI', 'GR', 'LU'];

const BY_REGION: Record<string, string> = {
	US: 'USD',
	GB: 'GBP',
	CA: 'CAD',
	AU: 'AUD',
	NZ: 'NZD',
	CH: 'CHF',
	SG: 'SGD',
	HK: 'HKD',
	MX: 'MXN',
	BR: 'BRL',
	ZA: 'ZAR',
	SE: 'SEK',
	NO: 'NOK',
	DK: 'DKK',
	PL: 'PLN',
	PH: 'PHP',
	IN: 'INR',
	...Object.fromEntries(EURO.map((r) => [r, 'EUR']))
};

/** The currency usually used where a browser language like "en-GB" is spoken, or null. */
export function guessCurrency(language: string): string | null {
	try {
		const region = new Intl.Locale(language).maximize().region;
		return (region && BY_REGION[region]) || null;
	} catch {
		return null;
	}
}

export function guessTimeZone(): string | null {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
	} catch {
		return null;
	}
}
