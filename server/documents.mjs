import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export const documentLimits = {
  bytes: 12 * 1024 * 1024,
  text: 48_000,
  sheets: 20,
  cells: 5_000,
};

const formats = new Map([
  ['application/pdf', 'pdf'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
]);

const extensions = new Map([['pdf', 'pdf'], ['docx', 'docx'], ['xlsx', 'xlsx']]);

export function safeDocumentName(value = '') {
  const clean = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim();
  return (clean || 'ملف').slice(0, 180);
}

export function documentFormat({ mimetype = '', fileName = '' } = {}) {
  const mime = String(mimetype).toLowerCase().split(';')[0].trim();
  if (formats.has(mime)) return formats.get(mime);
  const extension = safeDocumentName(fileName).toLowerCase().split('.').pop();
  return extensions.get(extension) || null;
}

const textValue = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if ('result' in value) return textValue(value.result);
    if ('text' in value) return textValue(value.text);
    if ('hyperlink' in value) return textValue(value.text || value.hyperlink);
  }
  return String(value).trim();
};

async function extractSpreadsheet(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const output = [];
  let cells = 0;
  for (const sheet of workbook.worksheets.slice(0, documentLimits.sheets)) {
    output.push(`ورقة: ${sheet.name}`);
    sheet.eachRow({ includeEmpty: false }, row => {
      if (cells >= documentLimits.cells) return;
      const values = [];
      row.eachCell({ includeEmpty: false }, cell => {
        if (cells++ >= documentLimits.cells) return;
        const value = textValue(cell.value);
        if (value) values.push(value);
      });
      if (values.length) output.push(values.join(' | '));
    });
    if (cells >= documentLimits.cells) break;
  }
  return output.join('\n');
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    const pages = Array.from({ length: Math.min(Number(info.total) || 1, 250) }, (_, index) => index + 1);
    return (await parser.getText({ partial: pages })).text;
  } finally {
    await parser.destroy();
  }
}

export async function extractDocument(buffer, metadata = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('document_empty');
  if (buffer.length > documentLimits.bytes) throw new Error('document_too_large');
  const format = documentFormat(metadata);
  if (!format) throw new Error('document_type_unsupported');
  let extracted = '';
  try {
    if (format === 'pdf') extracted = await extractPdf(buffer);
    else if (format === 'docx') extracted = (await mammoth.extractRawText({ buffer })).value;
    else extracted = await extractSpreadsheet(buffer);
  } catch (error) {
    const code = /password|encrypted/iu.test(String(error?.message || '')) ? 'document_encrypted' : 'document_invalid';
    throw new Error(code, { cause: error });
  }
  const text = String(extracted || '').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (!text) throw new Error('document_no_text');
  return {
    format,
    fileName: safeDocumentName(metadata.fileName),
    mimetype: String(metadata.mimetype || '').toLowerCase().split(';')[0] || null,
    byteSize: buffer.length,
    text: text.slice(0, documentLimits.text),
    truncated: text.length > documentLimits.text,
  };
}

export function documentMessage(document, caption = '') {
  const note = String(caption || '').trim().slice(0, 2_000);
  const suffix = document.truncated ? ' (تمت قراءة أول 48 ألف حرف)' : '';
  return `${note ? `${note}\n\n` : ''}أرسل ملفًا: ${document.fileName}${suffix}`.slice(0, 8_000);
}

export function documentContext(rows = []) {
  if (!rows.length) return '';
  let remaining = 24_000;
  return rows.map((row, index) => {
    const sender = row.sender_name || row.sender_phone || 'مرسل غير معروف';
    const text = String(row.extracted_text || '').slice(0, Math.min(12_000, remaining));
    remaining -= text.length;
    return text ? `<document index="${index + 1}" name="${safeDocumentName(row.file_name)}" sender="${safeDocumentName(sender)}">\n${text}\n</document>` : '';
  }).filter(Boolean).join('\n\n');
}
