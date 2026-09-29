// Lists the elements that stick out of the viewport on a phone, which is what
// causes horizontal page scrolling. Uses the same mocked Supabase as the
// design preview. Usage: node scripts/find-overflow.mjs /today /assistant
import { chromium } from 'playwright';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const { respondForPreview, previewSession } = await import('./visual-preview-fixtures.mjs');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript(([key, value]) => localStorage.setItem(key, value), ['sb-mock-auth-token', JSON.stringify(previewSession)]);
await context.route('https://mock.supabase.test/**', respondForPreview);
const page = await context.newPage();
for (const path of process.argv.slice(2)) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const offenders = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // The deepest visible elements wider than the screen are the culprits;
    // their ancestors are only wide because of them.
    const wide = [...document.querySelectorAll('body *')].filter(element =>
      getComputedStyle(element).visibility !== 'hidden' && element.getBoundingClientRect().width > width + 1);
    return wide.filter(element => !wide.some(other => other !== element && element.contains(other)))
      .map(element => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')} width=${Math.round(element.getBoundingClientRect().width)} text="${(element.textContent || '').trim().slice(0, 40)}"`)
      .slice(0, 12);
  });
  console.log(path, offenders.length ? '\n  ' + offenders.join('\n  ') : 'no overflow');
}
await browser.close();
