import test from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact, requestedArtifactType } from '../src/artifacts.js';

test('detects requested report formats in Arabic and English', () => {
  assert.equal(requestedArtifactType('سوي تقرير إكسل'), 'xlsx');
  assert.equal(requestedArtifactType('جهز ملف Word'), 'docx');
  assert.equal(requestedArtifactType('أرسله PDF'), 'pdf');
  assert.equal(requestedArtifactType('لخص الموضوع'), null);
});

test('generates valid non-empty Excel, Word and PDF containers', async () => {
  const xlsx = await generateArtifact('xlsx', 'البند | القيمة\nالمشاريع | 5');
  const docx = await generateArtifact('docx', 'ملخص التقرير\nالنتيجة جيدة');
  const pdf = await generateArtifact('pdf', 'ملخص التقرير\nالنتيجة جيدة');
  assert.equal(xlsx.buffer.subarray(0, 2).toString(), 'PK');
  assert.equal(docx.buffer.subarray(0, 2).toString(), 'PK');
  assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
  assert.ok(xlsx.buffer.length > 1000 && docx.buffer.length > 1000 && pdf.buffer.length > 1000);
});
