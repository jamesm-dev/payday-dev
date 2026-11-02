/**
 * The list as a PDF, written by hand (ADR-0011): A4 pages of Courier, one of the 14 fonts every PDF
 * reader has, so nothing is embedded. Courier draws Windows-1252 (WinAnsi) text; any other character
 * becomes `?` here, while the text file and the Word document keep it.
 */
import { expandTabs } from './text.ts';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56.69; // 20 mm
const FONT_SIZE = 11;
const LEADING = 15;
const LINES_PER_PAGE = Math.floor((A4.height - 2 * MARGIN) / LEADING);

/** The Windows-1252 bytes 0x80 to 0x9F, which differ from Latin-1. */
const CP1252: Record<string, number> = {
	'€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
	'‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
	'”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
	'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f
}; // prettier-ignore

/** One character as its WinAnsi byte, or `?` when Courier cannot draw it. */
function winAnsi(ch: string): number {
	const code = ch.codePointAt(0)!;
	if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return code;
	return CP1252[ch] ?? 0x3f;
}

/** A PDF string literal, kept 7-bit: `( ) \` escaped, anything above 0x7E written as octal. */
export function pdfString(text: string): string {
	let out = '(';
	for (const ch of text) {
		const b = winAnsi(ch);
		if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
		else if (b > 0x7e) out += `\\${b.toString(8).padStart(3, '0')}`;
		else out += String.fromCharCode(b);
	}
	return `${out})`;
}

function pageContent(lines: readonly string[]): string {
	const ops = [
		'BT',
		`/F1 ${FONT_SIZE} Tf`,
		`${LEADING} TL`,
		`${MARGIN} ${(A4.height - MARGIN - FONT_SIZE).toFixed(2)} Td`
	];
	lines.forEach((line, i) => {
		if (i > 0) ops.push('T*');
		if (line) ops.push(`${pdfString(expandTabs(line))} Tj`);
	});
	ops.push('ET');
	return `${ops.join('\n')}\n`;
}

/** A complete PDF. `title` goes in the document information, which readers show as its name. */
export function pdfFile(lines: readonly string[], title: string): Uint8Array<ArrayBuffer> {
	const pages: string[][] = [];
	for (let i = 0; i < Math.max(lines.length, 1); i += LINES_PER_PAGE) {
		pages.push(lines.slice(i, i + LINES_PER_PAGE));
	}

	// Objects: 1 catalog, 2 page tree, 3 font, 4 info, then a page and its content for each page.
	const pageId = (n: number) => 5 + n * 2;
	const objects: string[] = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		`<< /Type /Pages /Kids [${pages.map((_, n) => `${pageId(n)} 0 R`).join(' ')}] /Count ${pages.length} >>`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
		`<< /Title ${pdfString(title)} /Producer (Payday) >>`
	];
	for (const [n, page] of pages.entries()) {
		const content = pageContent(page);
		objects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] ` +
				`/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(n) + 1} 0 R >>`,
			`<< /Length ${content.length} >>\nstream\n${content}endstream`
		);
	}

	// Every byte so far is 7-bit, so string length is byte length and the offsets below are exact.
	let body = '%PDF-1.4\n';
	const offsets: number[] = [];
	objects.forEach((obj, i) => {
		offsets.push(body.length);
		body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
	});
	const xref = body.length;
	body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
	body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return new TextEncoder().encode(body);
}
