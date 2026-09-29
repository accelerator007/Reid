// Walks every forms screen and dialog at phone, tablet and desktop widths
// against the mocked Supabase, reports anything wider than the screen, saves
// screenshots, and reads the share dialog's QR code back with jsQR.
//
//   VITE_SUPABASE_URL=https://mock.supabase.test VITE_SUPABASE_ANON_KEY=anon npm run dev -- --host 127.0.0.1 &
//   node scripts/forms-preview.mjs [out-dir]
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { previewSession, respondForLocalApi, respondForPreview } from './visual-preview-fixtures.mjs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const out = process.argv[2] || 'test-results/forms';
const widths = (process.env.FORMS_WIDTHS || '320,360,375,414,768,1024,1280,1440').split(',').map(Number);
const shots = new Set((process.env.FORMS_SHOTS || '360,1440').split(',').map(Number));
const F1 = '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', F2 = '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const visible = locator => locator.filter({ visible: true }).first();

const screens = [
  ['home', '/forms', async () => {}],
  ['templates', '/forms', async page => visible(page.getByRole('button', { name: 'نموذج جديد' })).click()],
  ['share', '/forms', async page => visible(page.getByRole('button', { name: 'مشاركة' })).click()],
  ['menu', '/forms', async page => visible(page.getByRole('button', { name: 'خيارات النموذج' })).click()],
  ['access', '/forms', async page => { await visible(page.getByRole('button', { name: 'خيارات النموذج' })).click(); await page.getByRole('menuitem', { name: 'الأشخاص والوصول' }).click(); }],
  ['editor', `/forms/${F1}`, async () => {}],
  ['add-question', `/forms/${F1}`, async page => visible(page.getByRole('button', { name: 'إضافة سؤال' })).click()],
  ['summary', `/forms/${F1}/responses`, async () => {}],
  ['single', `/forms/${F1}/responses`, async page => page.getByRole('tab', { name: 'فردي' }).click()],
  ['table', `/forms/${F1}/responses`, async page => page.getByRole('tab', { name: 'جدول' }).click()],
  ['settings', `/forms/${F1}/settings`, async () => {}],
  ['respond', `/f/${F1}`, async () => {}],
  ['respond-errors', `/f/${F1}`, async page => { await page.getByRole('button', { name: 'التالي' }).click(); await page.waitForTimeout(500); }],
  ['respond-page2', `/f/${F1}`, async page => {
    await page.getByLabel('الاسم الكامل').fill('سالم');
    await page.getByRole('radio', { name: '4 من 5 — جيد جدًا' }).click();
    await page.locator('.respond-scale__option').filter({ hasText: /^8$/ }).click();
    await page.getByRole('button', { name: 'التالي' }).click();
  }],
  ['respond-sent', `/f/${F1}`, async page => {
    await page.getByLabel('الاسم الكامل').fill('سالم');
    await page.getByRole('radio', { name: '5 من 5 — ممتاز' }).click();
    await page.locator('.respond-scale__option').filter({ hasText: /^10$/ }).click();
    await page.getByRole('button', { name: 'التالي' }).click();
    await page.getByRole('button', { name: 'إرسال' }).click();
    await page.waitForTimeout(900);
  }],
  ['respond-closed', `/f/${F2}`, async () => {}],
  ['respond-missing', '/f/00000000-0000-4000-8000-000000000000', async () => {}],
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
let problems = 0;
for (const width of widths) {
  const mobile = width <= 414;
  const context = await browser.newContext({ viewport: { width, height: 860 }, isMobile: mobile, hasTouch: mobile, locale: 'ar-OM', deviceScaleFactor: 1 });
  await context.addInitScript(([key, value]) => {
    localStorage.setItem(key, value);
    localStorage.setItem('reid-lang', 'ar');
    localStorage.setItem('reid-theme', 'light');
  }, ['sb-mock-auth-token', JSON.stringify(previewSession)]);
  await context.route('https://mock.supabase.test/**', respondForPreview);
  await context.route(`${base}/api/**`, respondForLocalApi);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [name, path, act] of screens) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    try { await act(page); } catch (error) { problems += 1; console.log(`✗ ${width} ${name}: ${error.message.split('\n')[0]}`); continue; }
    await page.waitForTimeout(450);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) { problems += 1; console.log(`⚠ ${width} ${name}: horizontal overflow ${overflow}px`); }
    if (shots.has(width)) await page.screenshot({ path: `${out}/${width}-${name}.png`, fullPage: !['templates', 'share', 'access', 'menu', 'add-question'].includes(name) });
    if (name === 'share' && width === 1440) {
      await page.waitForTimeout(600);
      const image = await page.evaluate(() => {
        const canvas = document.querySelector('.fx-qr canvas');
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.width);
        return { width: canvas.width, pixels: Array.from(data.data) };
      });
      for (const scale of [1, 0.5, 0.33]) {
        const size = Math.floor(image.width * scale);
        const scaled = new Uint8ClampedArray(size * size * 4);
        for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
          const from = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * 4;
          scaled.set(image.pixels.slice(from, from + 4), (y * size + x) * 4);
        }
        const decoded = jsQR(scaled, size, size)?.data;
        const ok = decoded === `${base}/f/${F1}`;
        if (!ok) problems += 1;
        console.log(`${ok ? '✓' : '✗'} QR at ${size}px reads ${decoded ?? 'nothing'}`);
      }
    }
  }
  if (errors.length) { problems += 1; console.log(`page errors at ${width}:`, [...new Set(errors)].join(' | ')); }
  console.log(`— ${width}px checked`);
  await context.close();
}
await browser.close();
console.log(problems ? `${problems} problem(s)` : 'no problems');
process.exitCode = problems ? 1 : 0;
