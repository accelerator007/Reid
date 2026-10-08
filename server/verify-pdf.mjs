#!/usr/bin/env node
// Post-deploy smoke check. The deployment image carries no system fonts, so the
// only way to know Arabic reports still render is to build one inside the image
// that will serve them. Run: docker compose exec api node verify-pdf.mjs
import { generateArtifact, resolveFonts } from './artifacts.mjs';

const fonts = resolveFonts();
const pdf = await generateArtifact('pdf', '# تقرير تحقق\n- بند عربي داخل صورة الإنتاج\n- Latin and 2026 in the same line', 'تقرير تحقق');
const raw = pdf.buffer.toString('latin1');
const faces = [...raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+\-,#]+)/g)].map(match => match[1]);

const problems = [];
if (!raw.startsWith('%PDF-')) problems.push('output is not a PDF');
if (!/\/FontFile2/.test(raw)) problems.push('no font program is embedded');
if (!faces.length) problems.push('no font is declared');
if (faces.some(face => /Helvetica|Times|Courier/.test(face))) problems.push(`a base-14 face cannot render Arabic: ${faces.join(',')}`);
if ((raw.match(/\/Type\s*\/Page[^s]/g) || []).length !== 1) problems.push('a short report must be exactly one page');

if (problems.length) {
  console.error(`Arabic PDF verification failed:\n${problems.map(item => `  - ${item}`).join('\n')}`);
  process.exit(1);
}
console.log(`Arabic PDF verified: ${fonts.regular}, faces ${faces.join(', ')}, ${pdf.buffer.length} bytes`);
