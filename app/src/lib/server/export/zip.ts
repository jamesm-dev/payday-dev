/**
 * The smallest zip writer a Word document needs: stored entries, no compression, UTF-8 names. The
 * checksum is Node's own `zlib.crc32` (ADR-0011). The timestamp is fixed at 1980-01-01, the zip
 * format's first day, so the same list always makes the same bytes.
 */
import { crc32 } from 'node:zlib';

const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const DOS_TIME = 0;
const UTF8_NAMES = 0x0800;

export type ZipEntry = { name: string; data: Uint8Array };

export function zip(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
	const chunks: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const { name, data } of entries) {
		const nameBytes = new TextEncoder().encode(name);
		const crc = crc32(data);

		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true); // version needed: 2.0
		local.setUint16(6, UTF8_NAMES, true);
		local.setUint16(8, 0, true); // stored
		local.setUint16(10, DOS_TIME, true);
		local.setUint16(12, DOS_DATE, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, data.length, true);
		local.setUint32(22, data.length, true);
		local.setUint16(26, nameBytes.length, true);
		local.setUint16(28, 0, true);
		chunks.push(new Uint8Array(local.buffer), nameBytes, data);

		const dir = new DataView(new ArrayBuffer(46));
		dir.setUint32(0, 0x02014b50, true);
		dir.setUint16(4, 20, true); // made by: 2.0
		dir.setUint16(6, 20, true);
		dir.setUint16(8, UTF8_NAMES, true);
		dir.setUint16(10, 0, true);
		dir.setUint16(12, DOS_TIME, true);
		dir.setUint16(14, DOS_DATE, true);
		dir.setUint32(16, crc, true);
		dir.setUint32(20, data.length, true);
		dir.setUint32(24, data.length, true);
		dir.setUint16(28, nameBytes.length, true);
		// Extra, comment, disk, internal and external attributes are all zero.
		dir.setUint32(42, offset, true);
		central.push(new Uint8Array(dir.buffer), nameBytes);

		offset += 30 + nameBytes.length + data.length;
	}

	const centralSize = central.reduce((n, c) => n + c.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, entries.length, true);
	end.setUint16(10, entries.length, true);
	end.setUint32(12, centralSize, true);
	end.setUint32(16, offset, true);

	const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}
