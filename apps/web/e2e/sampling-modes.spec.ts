/**
 * The sampling/shape controls end to end: a square quadrat drawn in two
 * clicks, sampled on a regular grid. Runs in the adapter's fallback mode
 * (see helpers.forceFallbackMode).
 */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { FIXTURES, forceFallbackMode, pickFiles } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await forceFallbackMode(page);
  await page.goto('/');
  await expect(page.getByTestId('home-load-images')).toBeVisible();
  await pickFiles(
    page,
    () => page.getByTestId('home-load-images').click(),
    path.join(FIXTURES, 'quad.png')
  );
  await expect(page.getByTestId('canvas-svg')).toBeVisible();
});

/** Pick a value from one of the Vuetify selects by its visible label. */
async function choose(page: import('@playwright/test').Page, testId: string, label: string) {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
}

test('square shape completes on the second click and samples on a regular grid', async ({
  page,
}) => {
  await choose(page, 'shape-select', 'Square');
  await choose(page, 'sampling-select', 'Regular grid');
  await expect(page.getByTestId('grid-origin-select')).toBeVisible();

  await page.getByTestId('rows-input').locator('input').fill('2');
  await page.getByTestId('cols-input').locator('input').fill('2');

  const svg = page.getByTestId('canvas-svg');
  const box = (await svg.boundingBox())!;

  // One side, left to right across the middle of the image.
  await svg.click({ position: { x: box.width * 0.25, y: box.height * 0.3 } });
  await expect(page.getByTestId('boundary-polygon')).toBeHidden();

  await svg.click({ position: { x: box.width * 0.55, y: box.height * 0.3 } });
  await expect(page.getByTestId('boundary-polygon')).toBeVisible();

  // 2×2 grid → 4 points and 2 interior grid lines.
  await expect(page.getByTestId('sample-3')).toBeVisible();
  await expect(page.getByTestId('sample-4')).toHaveCount(0);
  await expect(page.getByTestId('cut-line')).toHaveCount(2);

  // The committed ring really is a square on screen.
  const points = (await page.getByTestId('boundary-polygon').getAttribute('points'))!;
  const ring = points
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x: x!, y: y! };
    });
  expect(ring).toHaveLength(4);
  const sides = ring.map((p, i) => {
    const q = ring[(i + 1) % 4]!;
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
  for (const side of sides) {
    expect(side).toBeCloseTo(sides[0]!, 3);
  }
});

test("the 'fill' placement samples the quadrat corners on a smaller grid", async ({ page }) => {
  await choose(page, 'shape-select', 'Quad');
  await choose(page, 'sampling-select', 'Regular grid');
  await choose(page, 'grid-origin-select', 'Fill (edges + interior)');

  await page.getByTestId('rows-input').locator('input').fill('3');
  await page.getByTestId('cols-input').locator('input').fill('3');
  await expect(page.getByTestId('grid-size-hint')).toContainText('3 × 3 points on a 2 × 2 grid');

  const svg = page.getByTestId('canvas-svg');
  const box = (await svg.boundingBox())!;
  const corners = [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
  ] as const;
  for (const [fx, fy] of corners) {
    await svg.click({ position: { x: box.width * fx, y: box.height * fy } });
  }

  // 9 points, and a 2×2 grid has one interior line each way
  await expect(page.getByTestId('sample-8')).toBeVisible();
  await expect(page.getByTestId('sample-9')).toHaveCount(0);
  await expect(page.getByTestId('cut-line')).toHaveCount(2);

  // sample 0 sits ON the quadrat's first corner, not inside a cell
  const points = (await page.getByTestId('boundary-polygon').getAttribute('points'))!;
  const [cornerX, cornerY] = points.trim().split(/\s+/)[0]!.split(',').map(Number);
  const dot = (await page.getByTestId('sample-0').boundingBox())!;
  const svgBox = (await svg.boundingBox())!;
  expect(Math.abs(dot.x + dot.width / 2 - (svgBox.x + cornerX!))).toBeLessThan(2);
  expect(Math.abs(dot.y + dot.height / 2 - (svgBox.y + cornerY!))).toBeLessThan(2);
});

test('random sampling places points but draws no grid', async ({ page }) => {
  await choose(page, 'shape-select', 'Quad');
  await choose(page, 'sampling-select', 'Random');
  await expect(page.getByTestId('grid-origin-select')).toHaveCount(0);

  await page.getByTestId('rows-input').locator('input').fill('2');
  await page.getByTestId('cols-input').locator('input').fill('2');

  const svg = page.getByTestId('canvas-svg');
  const box = (await svg.boundingBox())!;
  for (const [fx, fy] of [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
  ] as const) {
    await svg.click({ position: { x: box.width * fx, y: box.height * fy } });
  }

  await expect(page.getByTestId('boundary-polygon')).toBeVisible();
  await expect(page.getByTestId('sample-3')).toBeVisible();
  await expect(page.getByTestId('cut-line')).toHaveCount(0);
});
