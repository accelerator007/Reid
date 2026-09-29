import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { buildXlsx, columnName, crc32, fitWidths, sheetName } from './xlsx';
import { centreHole, inFinder, qrMatrix } from './qr';

/** Reads the stored (uncompressed) entries back out of a zip. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    expect(method).toBe(0);
    expect(crc32(data)).toBe(crc);
    files.set(name, new TextDecoder().decode(data));
    at += 30 + nameLength + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  return files;
}

describe('xlsx writer', () => {
  it('names columns like a spreadsheet', () => {
    expect([0, 25, 26, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
  });

  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('keeps sheet names legal and unique', () => {
    const taken = new Set<string>();
    expect(sheetName('الردود/الأسبوع [1]', taken)).toBe('الردود الأسبوع  1');
    expect(sheetName('Sheet', taken)).toBe('Sheet');
    expect(sheetName('sheet', taken)).toBe('sheet 2');
    expect(sheetName('x'.repeat(40), taken)).toHaveLength(31);
  });

  it('writes a right-to-left workbook with two sheets, numbers and a filter', () => {
    const files = unzip(buildXlsx([
      { name: 'الردود', rows: [['الاسم', 'التقييم'], ['سالم & ريم <2>', 4], ['', 5]], widths: fitWidths([['الاسم', 'التقييم']]), rtl: true, filter: true },
      { name: 'الملخص', rows: [['السؤال', 'المتوسط'], ['التقييم', 4.5]], rtl: true },
    ]));
    expect([...files.keys()]).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']));
    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain('<c r="B2"><v>4</v></c>');
    expect(sheet).toContain('سالم &amp; ريم &lt;2&gt;');
    expect(sheet).toContain('<autoFilter ref="A1:B3"/>');
    expect(sheet).toContain('state="frozen"');
    expect(sheet).not.toContain('r="A3"');
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="الملخص" sheetId="2" r:id="rId2"/>');
    expect(files.get('xl/worksheets/sheet2.xml')).toContain('<v>4.5</v>');
  });
});

describe('QR code', () => {
  /** Paints the symbol the way drawQr does (finders solid, centre cleared) and decodes it. */
  function decode(text: string, cell: number) {
    const matrix = qrMatrix(text);
    const size = matrix.length, quiet = 4, side = (size + quiet * 2) * cell;
    const hole = centreHole(size);
    const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let row = 0; row < size; row += 1) for (let col = 0; col < size; col += 1) {
      const cleared = row >= hole.from && row <= hole.to && col >= hole.from && col <= hole.to && !inFinder(row, col, size);
      if (!matrix[row][col] || cleared) continue;
      for (let y = 0; y < cell; y += 1) for (let x = 0; x < cell; x += 1) {
        const i = (((row + quiet) * cell + y) * side + (col + quiet) * cell + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 20;
      }
    }
    return jsQR(pixels, side, side)?.data;
  }

  it('still reads with the centre cleared for the logo, at several sizes', () => {
    const link = 'https://reidpro.com/f/5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    for (const cell of [3, 5, 8]) expect(decode(link, cell)).toBe(link);
  });

  it('keeps the cleared centre small', () => {
    const size = qrMatrix('https://reidpro.com/f/5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').length;
    const hole = centreHole(size);
    expect(((hole.to - hole.from + 1) ** 2) / size ** 2).toBeLessThan(0.08);
  });
});
