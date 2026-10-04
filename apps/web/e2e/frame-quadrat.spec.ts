/**
 * Committing a boundary frames it: the view glides so the quadrat fills the
 * canvas, bar a 30px margin on whichever axis binds first. It is a one-time
 * opening move — nothing later re-runs it.
 *
 * d3-zoom needs real SVG matrix support, so the wiring can only be exercised
 * in a browser; the framing math itself is unit-tested in `fitRingTransform`
 * and `interpolateTransform`.
 */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { FIXTURES, forceFallbackMode, pickFiles } from './helpers.ts';

/** Must match FIT_MARGIN_PX in packages/ui/src/canvas.ts. */
const MARGIN = 30;
/** Stroke width inflates the polygon's box by about a pixel a side. */
const TOLERANCE = 3;

async function loadImage(page: Page): Promise<void> {
  await forceFallbackMode(page);
  await page.goto('/');
  await expect(page.getByTestId('home-load-images')).toBeVisible();
  await pickFiles(
    page,
    () => page.getByTestId('home-load-images').click(),
    path.join(FIXTURES, 'quad.png')
  );
  await expect(page.getByTestId('canvas-svg')).toBeVisible();
}

/**
 * Draw a quad covering `from`–`to` of the SVG box. A small ring makes the
 * framing a large, unmistakable zoom rather than a nudge.
 */
async function drawQuad(page: Page, from: number, to: number): Promise<void> {
  const svg = page.getByTestId('canvas-svg');
  const box = (await svg.boundingBox())!;
  for (const [fx, fy] of [
    [from, from],
    [to, from],
    [to, to],
    [from, to],
    [from, from],
  ] as const) {
    await svg.click({ position: { x: box.width * fx, y: box.height * fy } });
  }
  await expect(page.getByTestId('boundary-polygon')).toBeVisible();
}

const transformOf = (page: Page) =>
  page.getByTestId('canvas-svg').locator('g').first().getAttribute('transform');

const scaleOf = async (page: Page) =>
  Number(/scale\(([-\d.]+)\)/.exec((await transformOf(page))!)![1]);

/** Wait until the framing animation has come to rest. */
async function settled(page: Page): Promise<string> {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = (await transformOf(page))!;
        const stable = now === last;
        last = now;
        return stable;
      },
      { message: 'view settles', timeout: 5000 }
    )
    .toBe(true);
  return last;
}

test('frames the quadrat to the canvas, less the margin', async ({ page }) => {
  await loadImage(page);
  await drawQuad(page, 0.3, 0.6);
  await settled(page);

  const canvas = (await page.getByTestId('image-canvas').boundingBox())!;
  const ring = (await page.getByTestId('boundary-polygon').boundingBox())!;

  const left = ring.x - canvas.x;
  const right = canvas.x + canvas.width - (ring.x + ring.width);
  const top = ring.y - canvas.y;
  const bottom = canvas.y + canvas.height - (ring.y + ring.height);

  // Centred: the gaps match on each axis.
  expect(left).toBeCloseTo(right, 0);
  expect(top).toBeCloseTo(bottom, 0);

  // The binding axis sits at the margin; the other gets more.
  const binding = Math.min(left, top);
  expect(binding).toBeGreaterThan(MARGIN - TOLERANCE);
  expect(binding).toBeLessThan(MARGIN + TOLERANCE);
  expect(Math.max(left, top)).toBeGreaterThanOrEqual(binding - TOLERANCE);
});

test('the framing is a zoom, not just a pan', async ({ page }) => {
  await loadImage(page);
  await drawQuad(page, 0.3, 0.6);
  await settled(page);
  // a ring 30% of the image should end up well past whole-image scale
  expect(await scaleOf(page)).toBeGreaterThan(2);
});

test('it glides rather than jumping', async ({ page }) => {
  await loadImage(page);
  await drawQuad(page, 0.3, 0.6);

  // Sample the scale while the animation should still be running.
  const samples = await page.evaluate(async () => {
    const g = document.querySelector('[data-test="canvas-svg"] g')!;
    const read = () => g.getAttribute('transform')!;
    const out: string[] = [read()];
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 70));
      out.push(read());
    }
    return out;
  });

  const distinct = new Set(samples);
  expect(distinct.size, 'intermediate frames were drawn').toBeGreaterThan(2);
});

test('resizing the window does not re-frame', async ({ page }) => {
  await loadImage(page);
  await drawQuad(page, 0.3, 0.6);
  const framed = await settled(page);
  // Guard the guard: if framing never happened, "nothing changed" would be
  // trivially true and this test would pass on a broken feature.
  expect(await scaleOf(page), 'the quadrat was framed first').toBeGreaterThan(2);

  const view = page.viewportSize()!;
  await page.setViewportSize({ width: view.width - 220, height: view.height - 120 });
  await page.waitForTimeout(800);
  expect(await transformOf(page)).toBe(framed);

  await page.setViewportSize(view);
  await page.waitForTimeout(800);
  expect(await transformOf(page)).toBe(framed);
});

test('leaving and returning to the tab does not re-frame', async ({ page }) => {
  await loadImage(page);
  await drawQuad(page, 0.3, 0.6);
  const framed = await settled(page);
  expect(await scaleOf(page), 'the quadrat was framed first').toBeGreaterThan(2);

  await page.getByTestId('tab-species').click();
  await expect(page.getByTestId('next-sample')).toBeVisible();
  await page.getByTestId('tab-prep').click();
  await page.waitForTimeout(800);

  expect(await transformOf(page)).toBe(framed);
});

test('a fresh boundary on the same image frames the new ring', async ({ page }) => {
  // Reset Nodes clears the boundary; committing the next one is a new
  // definition, so it frames again — that is not a re-frame of the old one.
  await loadImage(page);
  await drawQuad(page, 0.3, 0.6);
  const first = await settled(page);

  await page.getByTestId('menu-reset-nodes').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('boundary-polygon')).toHaveCount(0);

  await drawQuad(page, 0.1, 0.9);
  const second = await settled(page);

  expect(second).not.toBe(first);
  // the larger ring needs less magnification than the small one
  expect(await scaleOf(page)).toBeLessThan(Number(/scale\(([-\d.]+)\)/.exec(first)![1]));
});
