/*
 * Each writer is checked by reading its own output back: the text file byte for byte, the PDF's
 * cross-reference table against where its objects really are, and the Word document's zip entries
 * against their checksums.
 */
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { docxFile, xmlText } from './docx.ts';
import { pdfFile, pdfString } from './pdf.ts';
import { expandTabs, textFile } from './text.ts';

const LINES = [
	'30000\tSalary',
	'---------------------',
	'*4500\tOutreach',
	'/3000\tMika/Ren',
	'',
	'21000\tLorna (rent)',
	'---------------------',
	'102600\tTotal (without the *OPTIONAL)'
];

const ascii = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('TSK-65262C the text file opens in Notepad as written', () => {
	it('keeps the tabs and ends every line with a Windows line break', () => {
		const text = new TextDecoder().decode(textFile(LINES));
		expect(text).toBe(LINES.map((l) => `${l}\r\n`).join(''));
		expect(text).toContain('30000\tSalary\r\n');
		expect(text.split('\r\n')).toHaveLength(LINES.length + 1);
	});

	it('is UTF-8, so a name like Piñas or ₱ survives', () => {
		const bytes = textFile(['100\tLas Piñas ₱']);
		expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toBe('100\tLas Piñas ₱\r\n');
	});

	it('expands tabs to the next stop of eight, as Notepad draws them', () => {
		expect(expandTabs('30000\tSalary')).toBe('30000   Salary');
		expect(expandTabs('102600\tTotal')).toBe('102600  Total');
		expect(expandTabs('12345678\tX')).toBe('12345678        X');
	});
});

/** Every `N 0 obj` the xref table points at, read from where it says each one starts. */
function readXref(pdf: string) {
	const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)?.[1]);
	expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
	const [, count] = /^xref\n0 (\d+)\n/.exec(pdf.slice(startxref))!;
	const entries = pdf
		.slice(startxref)
		.split('\n')
		.slice(3, 2 + Number(count));
	return entries.map((entry, i) => {
		expect(entry).toMatch(/^\d{10} 00000 n $/);
		const offset = Number(entry.slice(0, 10));
		return { id: i + 1, at: pdf.slice(offset, offset + 12) };
	});
}

describe('TSK-BC8F24 the PDF', () => {
	const pdf = ascii(pdfFile(LINES, 'Paycheck 2026-11-13'));

	it('is a PDF whose cross-reference table points at every object', () => {
		expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
		for (const { id, at } of readXref(pdf)) expect(at.startsWith(`${id} 0 obj\n`)).toBe(true);
	});

	it('gives every content stream its true length', () => {
		const streams = [...pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)];
		expect(streams.length).toBeGreaterThan(0);
		for (const [, length, data] of streams) expect(data.length).toBe(Number(length));
	});

	it('draws each line in Courier, with tabs laid out as spaces', () => {
		expect(pdf).toContain('/BaseFont /Courier /Encoding /WinAnsiEncoding');
		expect(pdf).toContain('(30000   Salary) Tj');
		expect(pdf).toContain('(21000   Lorna \\(rent\\)) Tj');
		expect(pdf).toContain('(102600  Total \\(without the *OPTIONAL\\)) Tj');
		expect(pdf).toContain('/Title (Paycheck 2026-11-13)');
	});

	it('runs onto a second A4 page when the first is full', () => {
		const long = Array.from({ length: 60 }, (_, i) => `${i}\tLine ${i}`);
		const doc = ascii(pdfFile(long, 'Long'));
		expect(doc).toContain('/Count 2');
		expect(doc).toContain('/MediaBox [0 0 595.28 841.89]');
		expect(doc).toContain('(59      Line 59) Tj');
		for (const { id, at } of readXref(doc)) expect(at.startsWith(`${id} 0 obj\n`)).toBe(true);
	});

	it('writes Latin text in WinAnsi and anything Courier cannot draw as ?', () => {
		expect(pdfString('Piñas')).toBe('(Pi\\361as)');
		expect(pdfString('€5 – ok')).toBe('(\\2005 \\226 ok)');
		expect(pdfString('₱ 🙂')).toBe('(? ?)');
		expect(pdfString('a\\b')).toBe('(a\\\\b)');
	});

	it('is only 7-bit bytes, so string offsets are byte offsets', () => {
		const bytes = pdfFile(['100\tLas Piñas ₱'], 'x');
		expect(bytes.every((b) => b < 0x80)).toBe(true);
	});
});

/** The entries of a stored zip, read from its central directory, each checked against its CRC. */
function readZip(bytes: Uint8Array): Map<string, string> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = bytes.length - 22;
	expect(view.getUint32(end, true)).toBe(0x06054b50);
	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	const out = new Map<string, string>();
	for (let i = 0; i < count; i++) {
		expect(view.getUint32(at, true)).toBe(0x02014b50);
		expect(view.getUint16(at + 10, true)).toBe(0); // stored
		const crc = view.getUint32(at + 16, true);
		const size = view.getUint32(at + 24, true);
		const nameLength = view.getUint16(at + 28, true);
		const local = view.getUint32(at + 42, true);
		const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
		expect(view.getUint32(local, true)).toBe(0x04034b50);
		const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		const data = bytes.subarray(dataAt, dataAt + size);
		expect(crc32(data)).toBe(crc);
		out.set(name, new TextDecoder().decode(data));
		at += 46 + nameLength;
	}
	return out;
}

describe('TSK-E37AA3 the Word document', () => {
	const files = readZip(docxFile(LINES));
	const document = files.get('word/document.xml')!;

	it('is a zip holding the three parts Word needs, each with a correct checksum', () => {
		expect([...files.keys()]).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
		expect(files.get('[Content_Types].xml')).toContain(
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
		);
		expect(files.get('_rels/.rels')).toContain('Target="word/document.xml"');
	});

	it('has one paragraph per line, with a real tab between amount and name', () => {
		expect(document.match(/<w:p>/g)).toHaveLength(LINES.length);
		expect(document).toContain(
			'<w:t xml:space="preserve">30000</w:t><w:tab/><w:t xml:space="preserve">Salary</w:t>'
		);
		expect(document).toContain('<w:t xml:space="preserve">Lorna (rent)</w:t>');
	});

	it('sets the tab stop past the widest amount, in Courier New, on A4', () => {
		// The widest amount is "102600", six characters: (6 + 2) x 132 twips.
		expect(document).toContain('<w:tab w:val="left" w:pos="1056"/>');
		expect(document).toContain('w:ascii="Courier New"');
		expect(document).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
	});

	it('balances every element it opens', () => {
		for (const tag of ['w:p', 'w:r', 'w:pPr', 'w:rPr', 'w:tabs', 'w:body', 'w:document']) {
			const opens = document.match(new RegExp(`<${tag}[ >]`, 'g'))?.length ?? 0;
			const closes = document.match(new RegExp(`</${tag}>`, 'g'))?.length ?? 0;
			expect([tag, opens]).toEqual([tag, closes]);
		}
	});

	it('escapes names safely and drops characters XML forbids', () => {
		expect(xmlText('A & B <c> "d"')).toBe('A &amp; B &lt;c&gt; &quot;d&quot;');
		expect(xmlText('bad\u0001char')).toBe('badchar');
		expect(xmlText('₱ Piñas 🙂')).toBe('₱ Piñas 🙂');
	});

	it('makes the same bytes for the same list', () => {
		expect(docxFile(LINES)).toEqual(docxFile(LINES));
	});
});
