// Design preview: renders authenticated pages against a mocked Supabase so the
// interface can be reviewed and screenshotted without a real account or any
// Production data. Nothing leaves the machine: every Supabase request is
// answered by the fixtures below.
//
//   VITE_SUPABASE_URL=https://mock.supabase.test VITE_SUPABASE_ANON_KEY=anon npm run dev -- --host 127.0.0.1 &
//   node scripts/visual-preview.mjs [out-dir]
//
// Environment: PREVIEW_URL (default http://127.0.0.1:5173), PREVIEW_PAGES
// (comma list, default a representative set), PREVIEW_ROLE (default owner).
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { previewSession as session, respondForLocalApi, respondForPreview as respond } from './visual-preview-fixtures.mjs';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const out = process.argv[2] || 'test-results/preview';
const pages = (process.env.PREVIEW_PAGES || '/,/owner,/today,/assistant,/projects').split(',');
const supabaseHost = 'mock.supabase.test';

const variants = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
for (const variant of variants) {
  for (const theme of (process.env.PREVIEW_THEMES || 'light,dark').split(',')) {
    for (const lang of (process.env.PREVIEW_LANGS || 'ar').split(',')) {
      const context = await browser.newContext({
        viewport: variant.viewport, isMobile: variant.isMobile, hasTouch: variant.hasTouch,
        colorScheme: theme === 'dark' ? 'dark' : 'light', locale: lang === 'ar' ? 'ar-OM' : 'en-US', deviceScaleFactor: 1,
      });
      // The app remembers language and theme per browser; seed both.
      await context.addInitScript(([key, value, language, scheme]) => {
        localStorage.setItem(key, value);
        localStorage.setItem('reid-lang', language);
        localStorage.setItem('reid-theme', scheme);
      }, [`sb-${supabaseHost.split('.')[0]}-auth-token`, JSON.stringify(session), lang, theme]);
      await context.route(`https://${supabaseHost}/**`, respond);
      await context.route(`${base}/api/**`, respondForLocalApi);
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', error => problems.push(error.message));
      for (const path of pages) {
        await page.goto(base + path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const file = `${out}/${variant.name}-${theme}-${lang}${path === '/' ? '-home' : path.replaceAll('/', '-')}.png`;
        await page.screenshot({ path: file, fullPage: variant.name === 'desktop' });
        console.log(`${file}${overflow > 1 ? `  ⚠ horizontal overflow ${overflow}px` : ''}`);
        // PREVIEW_TABS=2,3 also captures those tabs (1-based) on pages that have tabs.
        for (const index of (process.env.PREVIEW_TABS || '').split(',').filter(Boolean)) {
          const tab = page.getByRole('tab').nth(Number(index) - 1);
          if (!(await tab.count())) continue;
          await tab.click();
          await page.waitForTimeout(300);
          const tabFile = file.replace(/\.png$/, `-tab${index}.png`);
          await page.screenshot({ path: tabFile, fullPage: variant.name === 'desktop' });
          const tabOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          console.log(`${tabFile}${tabOverflow > 1 ? `  ⚠ horizontal overflow ${tabOverflow}px` : ''}`);
        }
      }
      if (problems.length) console.log(`page errors (${variant.name}/${theme}/${lang}):`, [...new Set(problems)].join(' | '));
      await context.close();
    }
  }
}
await browser.close();
