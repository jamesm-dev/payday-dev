import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function colours(block: string): Record<string, string> {
	return Object.fromEntries(
		[...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]])
	);
}

const dark = colours(/:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '');

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

// Every pairing the app uses for text. AA for body text is 4.5:1.
const TEXT_PAIRS = [
	['text', 'bg'],
	['text', 'surface'],
	['text-muted', 'bg'],
	['text-muted', 'surface'],
	['accent', 'bg'],
	['on-accent', 'accent'],
	['text', 'surface-2'],
	['text-muted', 'surface-2'],
	['accent', 'surface-2'],
	['warn', 'bg'],
	['warn', 'surface'],
	['warn', 'surface-2']
] as const;

describe('TSK-DE00C5 tokens define one dark palette with AA text contrast', () => {
	it('defines the colour tokens once, and no light theme', () => {
		expect(Object.keys(dark).length).toBeGreaterThan(0);
		expect(css).toMatch(/color-scheme:\s*dark\s*;/);
		expect(css).not.toMatch(/prefers-color-scheme/);
		expect(css).not.toMatch(/color-scheme:[^;]*light/);
	});

	for (const [fg, bg] of TEXT_PAIRS) {
		it(`${fg} on ${bg} is at least 4.5:1`, () => {
			expect(contrast(dark[fg], dark[bg])).toBeGreaterThanOrEqual(4.5);
		});
	}
});
