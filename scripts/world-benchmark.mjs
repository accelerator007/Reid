#!/usr/bin/env node
/* Measures what the 3D agent world actually costs.
 *
 * tests/e2e/agent-world.spec.ts asserts the budgets that are the same on every
 * machine — draw calls, triangles, disposal. Frame rate is not one of those:
 * CI renders through SwiftShader on a CPU, so a threshold there would either
 * fail on every run or pass on a GPU that is already fast. This script exists
 * to produce the number on a real machine and record it in AGENTS.md.
 *
 *   npm run dev &                       # or any server for the harness page
 *   node scripts/world-benchmark.mjs    # add --url / --seconds to override
 */
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > -1 ? process.argv[at + 1] : fallback;
};
const base = arg('url', 'http://127.0.0.1:5173');
const seconds = Number(arg('seconds', 6));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const results = [];

for (const scenario of [
  { name: 'high · 1440x900', quality: 'high', viewport: { width: 1440, height: 900 } },
  { name: 'medium · 1440x900', quality: 'medium', viewport: { width: 1440, height: 900 } },
  { name: 'low · 390x844 (phone)', quality: 'low', viewport: { width: 390, height: 844 } },
  { name: 'high · dark', quality: 'high', viewport: { width: 1440, height: 900 }, dark: true },
]) {
  const page = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: 1 });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  // A missing favicon is not a renderer failure; anything else is.
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) failures.push(message.text()); });

  const started = Date.now();
  const query = new URLSearchParams({ quality: scenario.quality });
  if (scenario.dark) query.set('dark', '1');
  await page.goto(`${base}/tests/harness/world.html?${query}`, { waitUntil: 'load' });
  await page.waitForSelector('.agent-world[data-ready="true"]', { timeout: 120_000 });
  const firstFrame = Date.now() - started;

  // Let the scene settle before counting: the first frames include shader
  // compilation, which is a load cost, not a frame cost.
  await page.waitForTimeout(4000);
  const before = await page.evaluate(() => ({ frames: window.agentWorld.stats().frames, at: performance.now() }));
  await page.waitForTimeout(seconds * 1000);
  const after = await page.evaluate(() => ({ ...window.agentWorld.stats(), at: performance.now() }));
  const fps = ((after.frames - before.frames) / (after.at - before.at)) * 1000;

  const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);

  // Nothing may render while the map is off screen.
  await page.evaluate(() => window.scrollTo(0, 4000));
  await page.waitForTimeout(900);
  const idleBefore = await page.evaluate(() => window.agentWorld.stats().frames);
  await page.waitForTimeout(1200);
  const idleAfter = await page.evaluate(() => window.agentWorld.stats().frames);

  // And unmounting must give the GPU everything back.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#unmount');
  await page.waitForTimeout(400);
  const released = await page.evaluate(() => window.agentWorld === null);

  results.push({
    scenario: scenario.name,
    fps: Number(fps.toFixed(1)),
    firstFrameMs: firstFrame,
    drawCalls: after.drawCalls,
    triangles: after.triangles,
    geometries: after.geometries,
    textures: after.textures,
    programs: after.programs,
    heapMB: Number((heap / 1048576).toFixed(1)),
    degraded: after.degraded,
    framesWhileOffScreen: idleAfter - idleBefore,
    releasedOnUnmount: released,
    errors: failures.length,
  });
  await page.close();
}

await browser.close();
console.table(results);
const broken = results.filter(result => result.errors || !result.releasedOnUnmount || result.framesWhileOffScreen > 1);
if (broken.length) {
  console.error('\nFAILED:', JSON.stringify(broken, null, 2));
  process.exit(1);
}
console.log('\nRenderer:', 'measured through the browser above; SwiftShader in CI is CPU-bound and not representative of a GPU.');
