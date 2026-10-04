/**
 * You cannot zoom out past the fill state.
 *
 * The floor is the scale at which one pair of the image's edges meets the
 * panel's. Any further out and the image would have background margins on
 * both axes at once, shrinking into the middle of the panel — less substrate
 * on screen, and smaller. The floor is unit-tested through `ZOOM_EXTENT` and
 * `fitContain`; this checks d3-zoom is actually wired to honour it.
 */
import { expect, test, type Page } from '@playwright/test';
import { forceFallbackMode, loadImageAndDrawQuad, settleView } from './helpers.ts';

const transformOf = (page: Page) =>
  page.getByTestId('canvas-svg').locator('g').first().getAttribute('transform');

const scaleOf = async (page: Page) =>
  Number(/scale\(([-\d.]+)\)/.exec((await transformOf(page))!)![1]);

/** Spin the wheel outward `notches` times over the middle of the canvas. */
async function zoomOut(page: Page, notches: number): Promise<void> {
  const box = (await page.getByTestId('image-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < notches; i++) await page.mouse.wheel(0, 120);
}

/**
 * Which axes show background beside the image. The panel clips, so "margin"
 * means the image's box stops short of the panel's edge.
 */
async function margins(page: Page): Promise<{ x: boolean; y: boolean }> {
  const panel = (await page.getByTestId('image-canvas').boundingBox())!;
  const image = (await page.locator('[data-test="canvas-svg"] image').boundingBox())!;
  const slack = 1; // sub-pixel layout
  return {
    x: image.x > panel.x + slack || image.x + image.width < panel.x + panel.width - slack,
    y: image.y > panel.y + slack || image.y + image.height < panel.y + panel.height - slack,
  };
}

test.beforeEach(async ({ page }) => {
  await forceFallbackMode(page);
  await page.goto('/');
  await expect(page.getByTestId('home-load-images')).toBeVisible();
  await loadImageAndDrawQuad(page);
});

test('zooming out repeatedly stops at the fill state', async ({ page }) => {
  // The boundary has just been framed, so this starts zoomed in.
  expect(await scaleOf(page)).toBeGreaterThan(1);

  await zoomOut(page, 30);
  await settleView(page);

  expect(await scaleOf(page)).toBe(1);
});

test('the image never shows margins on both axes at once', async ({ page }) => {
  await zoomOut(page, 30);
  await settleView(page);

  const { x, y } = await margins(page);
  expect(x && y, 'background on both axes means it zoomed out past fill').toBe(false);
});

test('one pair of edges still meets the panel at the floor', async ({ page }) => {
  await zoomOut(page, 30);
  await settleView(page);

  const panel = (await page.getByTestId('image-canvas').boundingBox())!;
  const image = (await page.locator('[data-test="canvas-svg"] image').boundingBox())!;

  const fillsWidth = Math.abs(image.width - panel.width) < 2;
  const fillsHeight = Math.abs(image.height - panel.height) < 2;
  expect(fillsWidth || fillsHeight, 'neither axis is filled').toBe(true);
});

test('the floor follows the window rather than pinning a magnification', async ({ page }) => {
  await zoomOut(page, 30);
  await settleView(page);
  const atFloor = await scaleOf(page);

  // A narrower panel re-fits the image, so the floor still means "fill".
  const view = page.viewportSize()!;
  await page.setViewportSize({ width: view.width - 300, height: view.height - 150 });
  await page.waitForTimeout(500);
  await zoomOut(page, 10);
  await settleView(page);

  expect(await scaleOf(page)).toBe(atFloor);
  const { x, y } = await margins(page);
  expect(x && y).toBe(false);
});

test('zooming in past the floor still works', async ({ page }) => {
  await zoomOut(page, 30);
  await settleView(page);
  expect(await scaleOf(page)).toBe(1);

  const box = (await page.getByTestId('image-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);

  expect(await scaleOf(page)).toBeGreaterThan(1);
});
