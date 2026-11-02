// Regenerates the PNG app icons in static/ from src/lib/assets/favicon.svg, using the Chromium
// that Playwright already installs. Run from app/: `pnpm icons`.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile('src/lib/assets/favicon.svg', 'utf8');
// Maskable and Apple icons are cropped by the phone and cannot be transparent, so they get a
// full-bleed square of the app's background (--color-bg) with the mark at 75%: its disc then stays
// inside the maskable safe zone, a centred circle of 40% radius (205 of 512).
const square = svg
	.replace(
		'<circle',
		'<rect width="512" height="512" fill="#141415"/><g transform="translate(64 64) scale(0.75)"><circle'
	)
	.replace('</svg>', '</g></svg>');

const icons = [
	{ file: 'static/icon-192.png', size: 192, source: svg },
	{ file: 'static/icon-512.png', size: 512, source: svg },
	{ file: 'static/icon-maskable-512.png', size: 512, source: square },
	{ file: 'static/apple-touch-icon.png', size: 180, source: square }
];

const browser = await chromium.launch();
try {
	for (const { file, size, source } of icons) {
		const page = await browser.newPage({ viewport: { width: size, height: size } });
		await page.setContent(
			`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`
		);
		await page.locator('svg').screenshot({ path: file, omitBackground: true });
		await page.close();
		console.log(`wrote ${file}`);
	}
} finally {
	await browser.close();
}
