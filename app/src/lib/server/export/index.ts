/** The three formats a paycheck list downloads as, by the extension in its address. */
import { docxFile } from './docx.ts';
import { pdfFile } from './pdf.ts';
import { textFile } from './text.ts';

export const FORMATS = {
	txt: { type: 'text/plain; charset=utf-8', write: (lines: string[]) => textFile(lines) },
	pdf: {
		type: 'application/pdf',
		write: (lines: string[], title: string) => pdfFile(lines, title)
	},
	docx: {
		type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		write: (lines: string[]) => docxFile(lines)
	}
} as const;

export type Format = keyof typeof FORMATS;
export const isFormat = (v: string): v is Format => Object.hasOwn(FORMATS, v);
