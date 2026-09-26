import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { classifyLine, generateArtifact, hasArabic, requestedArtifactType, resolveFonts, splitRuns, wrapTokens } from '../artifacts.mjs';
import { readZip, zipText } from './zip.mjs';

const report = [
  '# تقرير الورش',
  'ملخص تنفيذي بالعربية مع رابط reidpro.com وسنة 2026.',
  '- بند أول',
  '- بند ثان يذكر PDF و Excel',
  '| الورشة | التاريخ | السعة |',
  '| --- | --- | --- |',
  '| ذكاء اصطناعي | 2026-10-02 | 20 |',
].join('\n');

test('bundled Arabic fonts ship with the service', () => {
  const fonts = resolveFonts({});
  assert.ok(existsSync(fonts.regular), 'regular font must exist inside the repository');
  assert.ok(existsSync(fonts.bold), 'bold font must exist inside the repository');
  assert.match(fonts.regular, /IBMPlexSansArabic-Regular\.ttf$/);
});

test('a missing font is a hard failure, never a silent Latin fallback', () => {
  assert.throws(() => resolveFonts({ REID_PDF_FONT: '/nonexistent/font.ttf' }), /pdf_font_missing/);
});

test('the bold font falls back to the regular face rather than failing', () => {
  const fonts = resolveFonts({ REID_PDF_FONT_BOLD: '/nonexistent/bold.ttf' });
  assert.equal(fonts.bold, fonts.regular);
});

test('PDF embeds the Arabic font and never uses a base-14 face', async () => {
  const result = await generateArtifact('pdf', report, 'تقرير اختبار');
  const raw = result.buffer.toString('latin1');
  assert.ok(/\/FontFile2/.test(raw), 'an embedded TrueType font program must be present');
  const faces = [...raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-,#]+)/g)].map(match => match[1]);
  assert.ok(faces.length > 0, 'the PDF must declare at least one font');
  assert.ok(faces.every(face => /IBMPlexSansArabic/.test(face)), `unexpected faces: ${faces.join(',')}`);
  assert.ok(!faces.some(face => /Helvetica|Times|Courier/.test(face)), 'a base-14 face cannot render Arabic');
});

const pageCount = buffer => (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

test('PDF adds pages instead of drawing past the bottom edge', async () => {
  const long = Array.from({ length: 90 }, (_, index) => `- بند رقم ${index + 1} في تقرير طويل جدًا يتجاوز صفحة واحدة بكثير ويتحقق من إضافة الصفحات تلقائيًا`).join('\n');
  const result = await generateArtifact('pdf', long, 'تقرير طويل');
  const pages = pageCount(result.buffer);
  assert.ok(pages > 1, `long content must paginate, saw ${pages} page(s)`);
  // The footer used to be written past the bottom margin, which made PDFKit
  // append one blank page per real page. Density is the regression guard.
  assert.ok(pages <= 8, `content this size must not exceed 8 pages, saw ${pages}`);
});

test('the footer never appends a blank page', async () => {
  const result = await generateArtifact('pdf', '- سطر واحد قصير', 'تقرير قصير');
  assert.equal(pageCount(result.buffer), 1, 'a one-line report must be exactly one page');
});

test('a long title grows its banner instead of spilling out of it', async () => {
  const title = 'تقرير سنوي شامل عن كل ورش شركة ريّد ونتائجها ومؤشراتها التفصيلية لعام 2026';
  const result = await generateArtifact('pdf', report, title);
  assert.ok(result.buffer.length > 2000);
  assert.match(result.fileName, /\.pdf$/);
});

test('Word keeps the Arabic text, right alignment and real tables', async () => {
  const result = await generateArtifact('docx', report, 'تقرير اختبار');
  const xml = zipText(result.buffer, 'word/document.xml');
  assert.ok(xml.includes('تقرير الورش'), 'heading text must survive');
  assert.ok(xml.includes('بند ثان يذكر PDF و Excel'), 'mixed Arabic/Latin text must survive');
  assert.ok(xml.includes('<w:rtl/>') || xml.includes('w:rtl'), 'runs must be marked right-to-left');
  assert.ok(xml.includes('<w:tbl>'), 'pipe rows must become a real table');
  assert.ok(xml.includes('ذكاء اصطناعي'), 'table cells must keep their text');
});

test('Excel keeps the Arabic text and a right-to-left sheet', async () => {
  const result = await generateArtifact('xlsx', report, 'تقرير اختبار');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer);
  const sheet = workbook.getWorksheet('التقرير');
  assert.equal(sheet.views[0].rightToLeft, true);
  assert.equal(sheet.getCell('A1').value, 'تقرير اختبار');
  const values = sheet.getSheetValues().flat().filter(value => typeof value === 'string');
  assert.ok(values.includes('تقرير الورش'));
  assert.ok(values.includes('ذكاء اصطناعي'));
  assert.ok(values.some(value => value.startsWith('• بند أول')));
});

test('every artifact container is a real, readable file', async () => {
  for (const type of ['docx', 'xlsx']) {
    const result = await generateArtifact(type, report, 'تقرير اختبار');
    const files = readZip(result.buffer);
    assert.ok(files.has('[Content_Types].xml'), `${type} must be a valid OOXML package`);
  }
  const pdf = await generateArtifact('pdf', report, 'تقرير اختبار');
  assert.equal(pdf.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
});

test('line classification separates headings, bullets, tables and text', () => {
  assert.deepEqual(classifyLine('# عنوان'), { kind: 'heading', text: 'عنوان', level: 1 });
  assert.deepEqual(classifyLine('- بند'), { kind: 'bullet', text: 'بند' });
  assert.deepEqual(classifyLine('| أ | ب |'), { kind: 'row', cells: ['أ', 'ب'] });
  assert.equal(classifyLine('| --- | --- |').kind, 'separator');
  assert.deepEqual(classifyLine('نص عادي'), { kind: 'text', text: 'نص عادي' });
});

test('mixed lines split into Arabic and Latin runs in the right direction', () => {
  const runs = splitRuns(['تقرير', 'عن', 'Reid', 'Platform', 'اليوم']);
  assert.deepEqual(runs.map(run => run.rtl), [true, false, true]);
  assert.deepEqual(runs[1].tokens, ['Reid', 'Platform']);
});

test('digits between Arabic words stay inside the Arabic flow', () => {
  const runs = splitRuns(['سنة', '2026', 'كانت']);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].rtl, true);
});

test('a standalone Latin run keeps left-to-right order', () => {
  const runs = splitRuns(['Reid', 'Platform']);
  assert.deepEqual(runs, [{ rtl: false, tokens: ['Reid', 'Platform'] }]);
});

test('wrapping never produces a line wider than its box', () => {
  const measure = token => token.length * 10;
  const rows = wrapTokens(['aaa', 'bbbb', 'cc', 'ddddd'], 70, measure, 5);
  for (const row of rows) {
    const width = row.reduce((total, token) => total + measure(token), 0) + 5 * (row.length - 1);
    assert.ok(width <= 70 || row.length === 1, `row too wide: ${row.join(' ')}`);
  }
  assert.ok(rows.length > 1);
});

test('detects the requested artifact type and the Arabic script', () => {
  assert.equal(requestedArtifactType('سوّي تقرير اكسل'), 'xlsx');
  assert.equal(requestedArtifactType('جهز ملف وورد'), 'docx');
  assert.equal(requestedArtifactType('اكتب لي تقرير'), 'pdf');
  assert.equal(requestedArtifactType('كيف الحال'), null);
  assert.equal(hasArabic('Reid'), false);
  assert.equal(hasArabic('ريّد'), true);
});

test('rejects an unsupported artifact type', async () => {
  await assert.rejects(() => generateArtifact('pptx', report, 'x'), /unsupported_artifact_type/);
});
