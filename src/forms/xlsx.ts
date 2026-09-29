// A small XLSX writer for form exports: several sheets, right-to-left, a bold
// frozen header with a filter, column widths, and numbers kept as numbers.
// An .xlsx file is a zip of XML parts; this writes them uncompressed ("stored"),
// which every spreadsheet program reads, so no third-party library is needed.

export type Cell = string | number | null | undefined;
export type Sheet = { name: string; rows: Cell[][]; widths?: number[]; rtl?: boolean; filter?: boolean };

const encoder = new TextEncoder();

const escapeXml = (text: string) =>
  text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]!))
    // XML 1.0 forbids most control characters; a pasted answer can contain them.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** A1-style column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Excel sheet names: at most 31 characters, none of []:*?/\ and unique. */
export function sheetName(name: string, taken: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet').slice(0, 31);
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${base.slice(0, 28)} ${n}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

function sheetXml(sheet: Sheet): string {
  const width = Math.max(1, ...sheet.rows.map(row => row.length));
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = `${columnName(c)}${r + 1}`;
      const style = r === 0 ? ' s="1"' : '';
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
      if (value == null || value === '') return '';
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(4, Math.min(80, w))}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const lastRef = `${columnName(width - 1)}${Math.max(1, sheet.rows.length)}`;
  const view = `<sheetViews><sheetView workbookViewId="0"${sheet.rtl ? ' rightToLeft="1"' : ''}>`
    + (sheet.rows.length > 1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '')
    + '</sheetView></sheetViews>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<dimension ref="A1:${lastRef}"/>${view}<sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${rows}</sheetData>`
    + (sheet.filter && sheet.rows.length > 1 ? `<autoFilter ref="A1:${lastRef}"/>` : '')
    + '</worksheet>';
}

/** Suggested widths from the longest value in each column. */
export function fitWidths(rows: Cell[][], max = 60): number[] {
  const width = Math.max(0, ...rows.map(row => row.length));
  return Array.from({ length: width }, (_, c) => Math.min(max, Math.max(10, ...rows.map(row => String(row[c] ?? '').length + 2))));
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const taken = new Set<string>();
  const names = sheets.map(sheet => sheetName(sheet.name, taken));
  const files: Array<[string, string]> = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets>${names.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + (sheets.some(sheet => sheet.filter && sheet.rows.length > 1)
        ? `<definedNames>${sheets.map((sheet, i) => sheet.filter && sheet.rows.length > 1
          ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeXml(names[i].replace(/'/g, "''"))}'!$A$1:$${columnName(Math.max(1, ...sheet.rows.map(row => row.length)) - 1)}$${sheet.rows.length}</definedName>` : '').join('')}</definedNames>`
        : '')
      + '</workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEAF7"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="top"/></xf>'
      + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>'],
    ...sheets.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)] as [string, string]),
  ];
  return zipStored(files.map(([name, text]) => [name, encoder.encode(text)]));
}

// ---- zip (stored) --------------------------------------------------------------------

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipStored(entries: Array<[string, Uint8Array]>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), nameBytes, data);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true); central.setUint16(12, 0, true); central.setUint16(14, 0x21, true);
    central.setUint32(16, crc, true); central.setUint32(20, data.length, true); central.setUint32(24, data.length, true);
    central.setUint16(28, nameBytes.length, true); central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
