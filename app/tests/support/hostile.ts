/*
 * Targets for the sign-in `next` parameter that must never leave the site. The unit test and the
 * browser test read the same list. Several collapse into `//evil.example` once a URL parser has
 * resolved dot-segments, which is what a browser does with a Location header.
 */
export const HOSTILE_NEXT = [
	'//evil.example',
	'/.//evil.example',
	'/a/..//evil.example',
	'/%2e//evil.example',
	'/%2E//evil.example',
	'/.%2e//evil.example',
	'/%2e%2e//evil.example',
	'/././/evil.example',
	'/\\evil.example',
	'/%5cevil.example',
	'/%5Cevil.example',
	'/a/%5c..%5c/evil.example',
	'/\\/evil.example',
	'/.\\/evil.example',
	'/\t/evil.example',
	'/\n/evil.example',
	'https://evil.example/',
	'javascript:alert(1)'
];
