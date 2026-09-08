import { existsSync } from 'node:fs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const hasArabic = (value) => /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(value);

function writePdfLine(document, value, options = {}) {
  const text = String(value);
  const { size = 12, color = '#222222' } = options;
  document.fontSize(size).fillColor(color);
  if (!hasArabic(text)) {
    document.x = document.page.margins.left;
    document.text(text, { align: 'left', lineGap: 5 });
    return;
  }

  // PDFKit shapes an Arabic run correctly, but its bidi layout can merge a Latin
  // model name/URL into the wrong side. Lay mixed lines out token-by-token from
  // the right edge while retaining each token's own glyph order.
  const tokens = text.trim().split(/\s+/);
  const gap = document.widthOfString(' ');
  let x = document.page.width - document.page.margins.right;
  const y = document.y;
  for (const token of tokens) {
    const width = document.widthOfString(token);
    if (x - width < document.page.margins.left) {
      document.y += size * 1.55;
      x = document.page.width - document.page.margins.right;
    }
    x -= width;
    document.text(token, x, document.y, { lineBreak: false });
    x -= gap;
  }
  document.x = document.page.margins.left;
  document.y = Math.max(document.y, y) + size * 1.55;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export function requestedArtifactType(text = '') {
  const value = String(text).toLowerCase();
  if (/\b(?:xlsx|excel)\b|إكسل|اكسل|جدول بيانات/.test(value)) return 'xlsx';
  if (/\b(?:docx|word)\b|وورد|ملف ورد/.test(value)) return 'docx';
  if (/\bpdf\b|بي\s?دي\s?اف|تقرير بصيغة/.test(value)) return 'pdf';
  return null;
}

function cleanLines(body) {
  return String(body).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 500);
}

async function makeXlsx(title, body) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Reid';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('التقرير', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }] });
  sheet.mergeCells('A1:F1');
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').alignment = { horizontal: 'right', vertical: 'middle' };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5E3F9E' } };
  sheet.getRow(1).height = 30;
  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = `أُنشئ بواسطة ريّد - ${new Date().toLocaleString('ar-OM')}`;
  sheet.getCell('A2').alignment = { horizontal: 'right' };
  sheet.getCell('A2').font = { color: { argb: 'FF666666' }, italic: true };
  const lines = cleanLines(body);
  let rowNumber = 4;
  for (const line of lines) {
    const cells = line.includes('|') ? line.split('|').map((value) => value.trim()).filter(Boolean) : [line];
    if (cells.length > 1 && cells.every((value) => /^:?-{3,}:?$/.test(value))) continue;
    const row = sheet.getRow(rowNumber++);
    cells.slice(0, 6).forEach((value, index) => { row.getCell(index + 1).value = value.replace(/^[-*#]+\s*/, ''); });
    row.alignment = { horizontal: 'right', vertical: 'top', wrapText: true };
    row.border = { bottom: { style: 'hair', color: { argb: 'FFE2DDEE' } } };
  }
  for (let column = 1; column <= 6; column += 1) sheet.getColumn(column).width = column === 1 ? 42 : 22;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function makeDocx(title, body) {
  const paragraphs = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, bidirectional: true, alignment: AlignmentType.LEFT }),
    ...cleanLines(body).map((line) => new Paragraph({
      bidirectional: true,
      // OOXML swaps logical left/right alignment for bidi paragraphs.
      alignment: AlignmentType.LEFT,
      spacing: { after: 140 },
      children: [new TextRun({ text: line.replace(/^[-*#]+\s*/, ''), size: 24, rightToLeft: true })],
    })),
  ];
  const document = new Document({ creator: 'Reid', title, sections: [{ properties: {}, children: paragraphs }] });
  return Buffer.from(await Packer.toBuffer(document));
}

async function makePdf(title, body) {
  const document = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 54, left: 54, right: 54 }, info: { Title: title, Author: 'Reid' } });
  const chunks = [];
  document.on('data', (chunk) => chunks.push(chunk));
  const font = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'].find(existsSync);
  if (font) document.font(font);
  writePdfLine(document, title, { size: 20, color: '#5E3F9E' });
  document.moveDown(0.5);
  for (const line of cleanLines(body)) {
    const clean = line.replace(/^[-*#]+\s*/, '');
    writePdfLine(document, clean);
  }
  document.end();
  return await new Promise((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
}

export async function generateArtifact(type, body, title = 'تقرير ريّد') {
  if (!['xlsx', 'docx', 'pdf'].includes(type)) throw new Error('unsupported_artifact_type');
  const buffer = type === 'xlsx' ? await makeXlsx(title, body) : type === 'docx' ? await makeDocx(title, body) : await makePdf(title, body);
  const metadata = {
    xlsx: { mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
    docx: { mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' },
    pdf: { mimetype: 'application/pdf', extension: 'pdf' },
  }[type];
  return { buffer, mimetype: metadata.mimetype, fileName: `Reid-report-${stamp()}.${metadata.extension}` };
}
