/**
 * The shell must survive being made narrower.
 *
 * The right panel used to vanish permanently: the two columns sat in a
 * wrapping flex row, and the canvas column's min-content width is the fitted
 * SVG width, which fitContain sets to the full column width for any image
 * wider than the column. Shrinking the window by a single pixel was therefore
 * enough to push the panel onto a second flex line — which, because both
 * columns are `height: 100%` and the page never scrolls, starts below the
 * viewport. It then ratcheted: alone on the first line, the canvas took the
 * whole width and re-fitted larger, so restoring the window could never undo
 * it.
 *
 * Browser zoom is the same trigger by another route (it shrinks the CSS-pixel
 * viewport), so resizing covers both of the ways the user hit this.
 *
 * Every assertion here polls. A resize settles over a frame or two, and the
 * ResizeObserver that re-fits the canvas is another tick behind that, so a
 * single measurement can catch a half-applied layout. What the user actually
 * hit was a state the layout never left, so where it comes to rest is the
 * thing worth asserting.
 */
import { expect, test, type Page } from '@playwright/test';
import { forceFallbackMode, loadImageAndDrawQuad } from './helpers.ts';

const SETTLE_MS = 3000;

interface PanelState {
  topOnScreen: boolean;
  leftOnScreen: boolean;
  rightEdgeOnScreen: boolean;
  hasSize: boolean;
}

const USABLE: PanelState = {
  topOnScreen: true,
  leftOnScreen: true,
  rightEdgeOnScreen: true,
  hasSize: true,
};

/** Settles, then asserts the panel is wholly on screen and reachable. */
async function expectPanelUsable(page: Page, note: string): Promise<void> {
  const panel = page.getByTestId('right-panel');
  await expect(panel, note).toBeVisible();

  await expect
    .poll(
      async (): Promise<PanelState | null> => {
        const box = await panel.boundingBox();
        if (box === null) return null;
        const view = page.viewportSize()!;
        return {
          // A wrapped flex line starts at y = 100% of the row: off-screen,
          // with no scrollbar to reach it.
          topOnScreen: box.y < view.height - 1,
          leftOnScreen: box.x < view.width - 1,
          rightEdgeOnScreen: box.x + box.width <= view.width + 1,
          hasSize: box.width > 0 && box.height > 0,
        };
      },
      { message: note, timeout: SETTLE_MS }
    )
    .toEqual(USABLE);

  // Visible is not the same as reachable: prove it still takes a click.
  await expect(page.getByTestId('tab-prep'), `${note}: tabs are clickable`).toBeVisible();
  await page.getByTestId('tab-prep').click();
}

/** Resize and wait for the canvas to finish re-fitting to the new width. */
async function resizeTo(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await expect
    .poll(
      async () => {
        const svg = await page.getByTestId('canvas-svg').boundingBox();
        const panel = await page.getByTestId('right-panel').boundingBox();
        if (svg === null || panel === null) return false;
        // the canvas has re-fitted inside its column, clear of the panel
        return svg.x >= -1 && svg.x + svg.width <= panel.x + 1;
      },
      { message: `canvas settles at ${width}px`, timeout: SETTLE_MS }
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await forceFallbackMode(page);
  await page.goto('/');
  await expect(page.getByTestId('home-load-images')).toBeVisible();
  await loadImageAndDrawQuad(page);
});

test('the right panel survives a one-pixel narrowing', async ({ page }) => {
  // The exact case that used to break it: the canvas is fitted to the full
  // column width, so the row has no slack at all.
  const view = page.viewportSize()!;
  await expectPanelUsable(page, 'before resize');

  await page.setViewportSize({ width: view.width - 1, height: view.height });
  await expectPanelUsable(page, 'after 1px narrowing');
});

test('the right panel survives being narrowed repeatedly', async ({ page }) => {
  const { height } = page.viewportSize()!;
  for (const width of [1100, 900, 760, 640, 520]) {
    await resizeTo(page, width, height);
    await expectPanelUsable(page, `at ${width}px`);
  }
});

test('the panel holds its width until the canvas has none left to give', async ({ page }) => {
  const { height } = page.viewportSize()!;
  await resizeTo(page, 900, height);
  const wide = (await page.getByTestId('right-panel').boundingBox())!;
  expect(wide.width).toBeCloseTo(400, 0);

  await resizeTo(page, 700, height);
  const narrow = (await page.getByTestId('right-panel').boundingBox())!;
  expect(narrow.width, 'panel keeps its width while the canvas can shrink').toBeCloseTo(
    wide.width,
    0
  );
});

test('narrowing then restoring leaves the layout as it started', async ({ page }) => {
  // The ratchet: the old bug was irreversible, so a round trip is what
  // distinguishes "fixed" from "happened not to wrap yet".
  const view = page.viewportSize()!;
  const before = (await page.getByTestId('right-panel').boundingBox())!;

  await resizeTo(page, 600, view.height);
  await expectPanelUsable(page, 'while narrow');

  await resizeTo(page, view.width, view.height);
  await expectPanelUsable(page, 'after restoring');

  const after = (await page.getByTestId('right-panel').boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.width).toBeCloseTo(before.width, 0);
});

test('the canvas keeps rendering as the window narrows', async ({ page }) => {
  // The other half of the fix: the canvas column may now shrink, so it has to
  // re-fit rather than overflow behind the panel.
  const before = (await page.getByTestId('canvas-svg').boundingBox())!;
  const { height } = page.viewportSize()!;

  await resizeTo(page, 800, height);

  const after = (await page.getByTestId('canvas-svg').boundingBox())!;
  expect(after.width, 'canvas re-fitted smaller').toBeLessThan(before.width);
  expect(after.width).toBeGreaterThan(0);
  await expect(page.getByTestId('boundary-polygon')).toBeVisible();
});
