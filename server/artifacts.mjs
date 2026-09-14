import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';

const here = dirname(fileURLToPath(import.meta.url));
// Bundled with the service on purpose. The deployment image ships no fonts at
// all, so a system lookup silently fell back to Helvetica and dropped every
// Arabic glyph. Reports must never be produced with a font that cannot render
// the language they are written in.
const bundled = {
  regular: join(here, 'assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  bold: join(here, 'assets/fonts/IBMPlexSansArabic-SemiBold.ttf'),
};

export function resolveFonts(env = process.env) {
  const regular = env.REID_PDF_FONT || bundled.regular;
  if (!existsSync(regular)) throw new Error('pdf_font_missing');
  const bold = env.REID_PDF_FONT_BOLD || bundled.bold;
  return { regular, bold: existsSync(bold) ? bold : regular };
}

const lines = value => String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 500);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const arabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
export const hasArabic = value => arabic.test(String(value));
const stripMarkers = line => line.replace(/^[-*#•]+\s*/, '').trim();
const isSeparatorRow = cells => cells.length > 0 && cells.every(cell => /^:?-{2,}:?$/.test(cell));

export function classifyLine(raw) {
  const line = String(raw).trim();
  if (/^#{1,3}\s+/.test(line)) return { kind: 'heading', text: stripMarkers(line), level: Math.min(line.match(/^#+/)[0].length, 3) };
  if (line.includes('|')) {
    const cells = line.split('|').map(cell => cell.trim()).filter((cell, index, all) => !(cell === '' && (index === 0 || index === all.length - 1)));
    if (cells.length > 1) return isSeparatorRow(cells) ? { kind: 'separator' } : { kind: 'row', cells: cells.slice(0, 6) };
  }
  if (/^[-*•]\s+/.test(line)) return { kind: 'bullet', text: stripMarkers(line) };
  return { kind: 'text', text: line };
}

export function requestedArtifactType(text = '') {
  const value = String(text).toLowerCase();
  if (/\b(?:xlsx|excel)\b|إكسل|اكسل|جدول بيانات/.test(value)) return 'xlsx';
  if (/\b(?:docx|word)\b|وورد|ملف ورد/.test(value)) return 'docx';
  if (/\bpdf\b|بي\s?دي\s?اف|تقرير/.test(value)) return 'pdf';
  return null;
}

// PDFKit shapes an Arabic run correctly through fontkit and already reverses
// glyph order inside it, but it applies no bidi algorithm across runs: a Latin
// word or URL inside an Arabic sentence lands on the wrong side. Lay the line
// out in runs — Arabic runs right-to-left, Latin runs left-to-right — so a
// mixed sentence keeps both readable.
export function splitRuns(tokens) {
  const runs = [];
  for (const token of tokens) {
    const rtl = hasArabic(token);
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.tokens.push(token);
    else runs.push({ rtl, tokens: [token] });
  }
  // A neutral run (digits, punctuation) between two Arabic runs belongs to the
  // Arabic flow; standalone it keeps its own order either way.
  const resolved = runs.map((run, index) => {
    if (run.rtl || /[A-Za-z]/.test(run.tokens.join(''))) return run;
    const before = runs[index - 1], after = runs[index + 1];
    return before?.rtl && after?.rtl ? { ...run, rtl: true } : run;
  });
  return resolved.reduce((merged, run) => {
    const last = merged[merged.length - 1];
    if (last && last.rtl === run.rtl) last.tokens.push(...run.tokens);
    else merged.push({ rtl: run.rtl, tokens: [...run.tokens] });
    return merged;
  }, []);
}

export function wrapTokens(tokens, width, measure, gap) {
  const out = [];
  let current = [], used = 0;
  for (const token of tokens) {
    const size = measure(token);
    if (current.length && used + gap + size > width) { out.push(current); current = []; used = 0; }
    if (current.length) used += gap;
    current.push(token); used += size;
  }
  if (current.length) out.push(current);
  return out.length ? out : [[]];
}

function createPdfWriter(doc, fonts) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  const use = ({ size, bold = false, color = '#222222' }) => doc.font(bold ? fonts.bold : fonts.regular).fontSize(size).fillColor(color);
  const room = height => { if (doc.y + height > bottom()) { doc.addPage(); return true; } return false; };

  function drawLine(tokens, style, box) {
    const gap = doc.widthOfString(' ');
    let cursor = box.right;
    for (const run of splitRuns(tokens)) {
      const widths = run.tokens.map(token => doc.widthOfString(token));
      const runWidth = widths.reduce((total, value) => total + value, 0) + gap * (run.tokens.length - 1);
      cursor -= runWidth;
      let inner = cursor;
      const ordered = run.rtl ? [...run.tokens].reverse() : run.tokens;
      const orderedWidths = run.rtl ? [...widths].reverse() : widths;
      ordered.forEach((token, index) => { doc.text(token, inner, doc.y, { lineBreak: false }); inner += orderedWidths[index] + gap; });
      cursor -= gap;
    }
    doc.x = box.left;
  }

  // Every writer call owns its own page breaks. The previous implementation
  // checked the remaining space once per paragraph, so a wrapped line silently
  // ran past the bottom edge and was drawn outside the printable page.
  function paragraph(text, { size = 11.5, bold = false, color = '#222222', indent = 0, bullet = null, after = 5 } = {}) {
    const box = { left: left + indent, right: right - indent };
    use({ size, bold, color });
    const height = size * 1.62;
    if (!hasArabic(text)) {
      for (const piece of String(text).split(/\s{2,}/)) {
        room(height);
        doc.text(piece, box.left, doc.y, { width: box.right - box.left, align: 'left', lineGap: 4 });
      }
      doc.y += after;
      return;
    }
    const gap = doc.widthOfString(' ');
    const rows = wrapTokens(String(text).trim().split(/\s+/), box.right - box.left, token => doc.widthOfString(token), gap);
    rows.forEach((tokens, index) => {
      room(height);
      if (bullet && index === 0) { use({ size, bold: false, color }); doc.text(bullet, box.right + 4, doc.y, { lineBreak: false }); use({ size, bold, color }); }
      drawLine(tokens, { size }, box);
      doc.y += height;
    });
    doc.y += after;
  }

  function tableRow(cells, { header = false } = {}) {
    const size = header ? 11 : 10.5;
    use({ size, bold: header, color: header ? '#FFFFFF' : '#222222' });
    const columns = cells.length;
    const span = (right - left) / columns;
    const height = size * 1.62;
    const rows = cells.map(cell => wrapTokens(String(cell).trim().split(/\s+/), span - 12, token => doc.widthOfString(token), doc.widthOfString(' ')));
    const tallest = Math.max(...rows.map(row => row.length));
    room(height * tallest + 6);
    const top = doc.y;
    if (header) doc.save().rect(left, top - 3, right - left, height * tallest + 6).fill('#5E3F9E').restore();
    use({ size, bold: header, color: header ? '#FFFFFF' : '#222222' });
    rows.forEach((row, column) => {
      // First cell sits at the right edge: the reading order of the table is
      // the reading order of the language.
      const cellRight = right - column * span - 6;
      const box = { left: cellRight - span + 12, right: cellRight };
      doc.y = top;
      row.forEach(tokens => { drawLine(tokens, { size }, box); doc.y += height; });
    });
    doc.y = top + height * tallest + 4;
    if (!header) doc.save().moveTo(left, doc.y - 2).lineTo(right, doc.y - 2).lineWidth(0.5).strokeColor('#E1DAEB').stroke().restore();
  }

  return { paragraph, tableRow, left, right };
}

async function makePdf(title, body, env) {
  const fonts = resolveFonts(env);
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 48, bottom: 64, left: 52, right: 52 }, info: { Title: title, Author: 'Reid' } });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  doc.registerFont('reid', fonts.regular);
  doc.registerFont('reid-bold', fonts.bold);
  const writer = createPdfWriter(doc, { regular: 'reid', bold: 'reid-bold' });

  // The banner is sized to the title it actually holds. A fixed 130pt band let
  // a long title spill out of it and render white on white.
  doc.font('reid-bold').fontSize(22);
  const titleRows = wrapTokens(String(title).trim().split(/\s+/), doc.page.width - 104 - 38, token => doc.widthOfString(token), doc.widthOfString(' '));
  const banner = Math.max(130, 60 + titleRows.length * 34);
  doc.save().rect(0, 0, doc.page.width, banner).fill('#2B1D3C').restore();
  doc.y = 44;
  writer.paragraph(title, { size: 22, bold: true, color: '#FFFFFF', indent: 19, after: 0 });
  doc.y = banner + 26;

  let pendingHeader = true;
  for (const raw of lines(body)) {
    const item = classifyLine(raw);
    if (item.kind === 'separator') continue;
    if (item.kind === 'row') { writer.tableRow(item.cells, { header: pendingHeader }); pendingHeader = false; continue; }
    pendingHeader = true;
    if (item.kind === 'heading') writer.paragraph(item.text, { size: item.level === 1 ? 16 : 14, bold: true, color: '#5E3F9E', after: 9 });
    else if (item.kind === 'bullet') writer.paragraph(item.text, { indent: 18, bullet: '•', after: 4 });
    else writer.paragraph(item.text);
  }

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    // The footer is drawn inside the bottom margin. PDFKit paginates whenever a
    // write lands past that margin, so leaving it in place appended one blank
    // page per real page — the document silently doubled in length.
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('reid').fontSize(8).fillColor('#776C82');
    doc.text('Reid • reidpro.com', 52, doc.page.height - 42, { lineBreak: false });
    doc.text(`${page - range.start + 1} / ${range.count}`, doc.page.width - 102, doc.page.height - 42, { width: 50, align: 'right', lineBreak: false });
    doc.page.margins.bottom = margin;
  }
  doc.end();
  return await new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
}

const docxCell = (text, header) => new TableCell({
  width: { size: 100, type: WidthType.PERCENTAGE },
  shading: header ? { fill: '5E3F9E' } : undefined,
  children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, children: [new TextRun({ text, size: 22, bold: header, rightToLeft: true, color: header ? 'FFFFFF' : '222222' })] })],
});

async function makeDocx(title, body) {
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE, bidirectional: true, alignment: AlignmentType.RIGHT })];
  let pending = [];
  const flush = () => {
    if (!pending.length) return;
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: pending.map((cells, index) => new TableRow({ children: cells.map(cell => docxCell(cell, index === 0)) })) }));
    pending = [];
  };
  for (const raw of lines(body)) {
    const item = classifyLine(raw);
    if (item.kind === 'separator') continue;
    if (item.kind === 'row') { pending.push(item.cells); continue; }
    flush();
    if (item.kind === 'heading') children.push(new Paragraph({ text: item.text, heading: item.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, bidirectional: true, alignment: AlignmentType.RIGHT }));
    else children.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 140 },
      ...(item.kind === 'bullet' ? { bullet: { level: 0 } } : {}),
      children: [new TextRun({ text: item.text, size: 24, rightToLeft: true })],
    }));
  }
  flush();
  return Buffer.from(await Packer.toBuffer(new Document({ creator: 'Reid', title, sections: [{ properties: {}, children }] })));
}

async function makeXlsx(title, body) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Reid';
  const sheet = workbook.addWorksheet('التقرير', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }] });
  sheet.mergeCells('A1:F1');
  const header = sheet.getCell('A1');
  header.value = title;
  header.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5E3F9E' } };
  header.alignment = { horizontal: 'right' };

  let index = 3;
  for (const raw of lines(body)) {
    const item = classifyLine(raw);
    if (item.kind === 'separator') continue;
    const row = sheet.getRow(index);
    if (item.kind === 'row') item.cells.forEach((cell, column) => { row.getCell(column + 1).value = cell; });
    else row.getCell(1).value = item.kind === 'bullet' ? `• ${item.text}` : item.text;
    if (item.kind === 'heading') row.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF5E3F9E' } };
    row.alignment = { horizontal: 'right', vertical: 'top', wrapText: true };
    index += 1;
  }
  for (let column = 1; column <= 6; column += 1) sheet.getColumn(column).width = column === 1 ? 42 : 22;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function generateArtifact(type, body, title = 'تقرير ريّد', env = process.env) {
  if (!['pdf', 'docx', 'xlsx'].includes(type)) throw new Error('unsupported_artifact_type');
  const buffer = type === 'pdf' ? await makePdf(title, body, env) : type === 'docx' ? await makeDocx(title, body) : await makeXlsx(title, body);
  const meta = {
    pdf: ['application/pdf', 'pdf'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  }[type];
  return { buffer, mimetype: meta[0], fileName: `Reid-${stamp()}.${meta[1]}` };
}
