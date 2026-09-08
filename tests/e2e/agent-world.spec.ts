import { expect, test, type Page } from '@playwright/test';

/* The 3D agent world, exercised where it actually runs.
 *
 * Vitest cannot open a WebGL context and the real map lives behind an
 * authenticated /dashboard, so this drives tests/harness/world.html, which
 * mounts the same component with every operational state present at once.
 *
 * Everything asserted here is the same on every machine: scene cost, input,
 * accessibility, and cleanup. Frame rate is deliberately absent — CI renders
 * through SwiftShader on a CPU, so any threshold would be a lie in one
 * direction or the other. `scripts/world-benchmark.mjs` measures that.
 */

const HARNESS = '/tests/harness/world.html';
const READY = '.agent-world[data-ready="true"]';
// Software rendering compiles the shaders slowly; a real GPU is here in a blink.
const SETTLE = { timeout: 120_000 };

type Stats = { drawCalls: number; triangles: number; geometries: number; textures: number; programs: number; frames: number; agents: number; degraded: number };
const stats = (page: Page) => page.evaluate(() => (window as unknown as { agentWorld: { stats(): Stats } }).agentWorld.stats());

test('builds the campus from the topology and keeps every robot reachable', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));

  await page.goto(`${HARNESS}?quality=high`);
  await page.waitForSelector(READY, SETTLE);

  const labels = page.locator('.agent-world-label');
  await expect(labels).toHaveCount(11);
  // Every nameplate is projected onto the canvas rather than parked off screen.
  const parked = await labels.evaluateAll(nodes => nodes.filter(node => (node as HTMLElement).style.transform.includes('-100vw')).length);
  expect(parked).toBe(0);

  const scene = await stats(page);
  expect(scene.agents).toBe(11);
  expect(failures).toEqual([]);
});

test('selects an agent by pointer and by keyboard alone', async ({ page }) => {
  await page.goto(HARNESS);
  await page.waitForSelector(READY, SETTLE);

  await page.getByRole('button', { name: /^OPERATIONS/ }).click();
  await expect(page.locator('#selected')).toHaveText('operations');
  await expect(page.getByRole('button', { name: /^OPERATIONS/ })).toHaveAttribute('aria-pressed', 'true');

  // The canvas is hidden from assistive technology on purpose, so the
  // nameplates have to carry the whole interaction.
  await expect(page.locator('.agent-world-canvas')).toHaveAttribute('aria-hidden', 'true');
  await page.getByRole('button', { name: /^FINANCE/ }).focus();
  await expect(page.locator('#selected')).toHaveText('finance');
});

test('stays inside its scene budget, and spends less on a weak device', async ({ page }) => {
  await page.goto(`${HARNESS}?quality=high`);
  await page.waitForSelector(READY, SETTLE);
  const high = await stats(page);

  // Not a performance threshold: a ceiling on what the scene is allowed to
  // become. Eleven stations, one desert, and no texture atlas to speak of.
  expect(high.drawCalls).toBeLessThanOrEqual(360);
  expect(high.triangles).toBeLessThanOrEqual(80_000);
  expect(high.geometries).toBeLessThanOrEqual(60);
  expect(high.textures).toBeLessThanOrEqual(4);

  await page.goto(`${HARNESS}?quality=low`);
  await page.waitForSelector(READY, SETTLE);
  const low = await stats(page);
  expect(low.drawCalls).toBeLessThan(high.drawCalls);
  expect(low.triangles).toBeLessThan(high.triangles);
});

test('stops rendering when the map is off screen and releases the GPU on unmount', async ({ page }) => {
  await page.goto(`${HARNESS}?quality=low`);
  await page.waitForSelector(READY, SETTLE);

  await page.evaluate(() => window.scrollTo(0, 4000));
  await page.waitForTimeout(1200);
  const idle = (await stats(page)).frames;
  await page.waitForTimeout(1500);
  expect((await stats(page)).frames).toBe(idle);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  expect((await stats(page)).frames).toBeGreaterThan(idle);

  await page.click('#unmount');
  await expect.poll(() => page.evaluate(() => (window as unknown as { agentWorld: unknown }).agentWorld === null)).toBe(true);
  await expect(page.locator('.agent-world-canvas')).toHaveCount(0);
});

test('falls back to the classic map instead of failing when WebGL is missing', async ({ page }) => {
  // A locked-down browser, a blocklisted driver, or a machine with no GPU at
  // all: the map is a control surface, so it may not simply disappear.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...rest: unknown[]) {
      if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
      return (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto(HARNESS);
  await expect.poll(() => page.evaluate(() => (window as unknown as { agentWorldUnsupported?: boolean }).agentWorldUnsupported === true), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('.agent-world-canvas')).toHaveCount(0);
});

test('still renders the place for a reader who asked for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${HARNESS}?quality=low`);
  await page.waitForSelector(READY, SETTLE);
  await expect(page.locator('.agent-world-label')).toHaveCount(11);

  // Rendering is on demand, not sixty times a second.
  const settled = (await stats(page)).frames;
  await page.waitForTimeout(1500);
  expect((await stats(page)).frames).toBe(settled);

  // And it still answers input.
  await page.getByRole('button', { name: /^SALES/ }).click();
  await expect(page.locator('#selected')).toHaveText('sales');
  await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(settled);
});
