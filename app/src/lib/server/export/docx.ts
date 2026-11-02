/**
 * The list as a Word document, written by hand (ADR-0011): the minimum OOXML package Word opens —
 * content types, one relationship, one document part — in a stored zip. Courier New keeps the
 * columns straight, and a real tab stop just past the widest amount lines the names up, so text
 * copied out of Word still has its tabs.
 */
import { zip } from './zip.ts';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const FONT_HALF_POINTS = 22; // 11 pt
/** Courier New's every character is 0.6 em wide: 6.6 pt at 11 pt, or 132 twentieths of a point. */
const CHAR_TWIPS = 132;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** Text safe inside an XML element: the five entities, and no character XML 1.0 forbids. */
export function xmlText(text: string): string {
	return text
		.replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const RUN_PROPS =
	`<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>` +
	`<w:sz w:val="${FONT_HALF_POINTS}"/></w:rPr>`;

function paragraph(line: string, tabTwips: number): string {
	// The schema fixes the order inside w:pPr: tabs, then spacing, then the paragraph mark's own run
	// properties, which give an empty line the same height as a written one.
	const props =
		`<w:pPr><w:tabs><w:tab w:val="left" w:pos="${tabTwips}"/></w:tabs>` +
		`<w:spacing w:before="0" w:after="0"/>${RUN_PROPS}</w:pPr>`;
	if (!line) return `<w:p>${props}</w:p>`;
	const runProps = RUN_PROPS;
	const pieces = line
		.split('\t')
		.map((piece) => `<w:t xml:space="preserve">${xmlText(piece)}</w:t>`)
		.join('<w:tab/>');
	return `<w:p>${props}<w:r>${runProps}${pieces}</w:r></w:p>`;
}

export function docxFile(lines: readonly string[]): Uint8Array<ArrayBuffer> {
	// The tab stop sits two characters past the widest amount, so every name starts in one column.
	const widest = Math.max(0, ...lines.map((l) => (l.includes('\t') ? l.indexOf('\t') : 0)));
	const tabTwips = (widest + 2) * CHAR_TWIPS;
	const body = lines.map((l) => paragraph(l, tabTwips)).join('');
	const document =
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
		`<w:document xmlns:w="${W}"><w:body>${body}` +
		// A4, 20 mm margins.
		`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
		`<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/>` +
		`</w:sectPr></w:body></w:document>`;

	const utf8 = (s: string) => new TextEncoder().encode(s);
	return zip([
		{ name: '[Content_Types].xml', data: utf8(CONTENT_TYPES) },
		{ name: '_rels/.rels', data: utf8(RELS) },
		{ name: 'word/document.xml', data: utf8(document) }
	]);
}
