/**
 * Navigating between samples while zoomed in brings the current point into
 * view — but only when it is not already comfortably visible, and it cuts
 * rather than sweeps when the move is a long one. d3-zoom needs real SVG
 * matrix support, so this can only be exercised in a browser; the rule itself
 * is unit-tested in `recentreTarget`.
 *
 * The motion preference has no UI today, so the smooth/off cases seed the
 * settings document before the app loads — which also exercises the path a
 * restored preference actually takes.
 */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { FIXTURES, forceFallbackMode, pickFiles } from './helpers.ts';

/** Must match RECENTRE_EDGE_MARGIN in packages/ui/src/canvas.ts. */
const EDGE_MARGIN = 0.15;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const centreOfBox = (b: Box) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

async function sampleCentre(page: Page, index: number) {
  return centreOfBox((await page.getByTestId(`sample-${index}`).boundingBox())!);
}

async function view(page: Page) {
  return (await page.getByTestId('canvas-svg').boundingBox())!;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const transformOf = (page: Page) =>
  page.getByTestId('canvas-svg').locator('g').first().getAttribute('transform');

/** Is a page point inside the inset where the view leaves things alone? */
function isComfortable(p: { x: number; y: number }, box: Box): boolean {
  const insetX = box.width * EDGE_MARGIN;
  const insetY = box.height * EDGE_MARGIN;
  return (
    p.x >= box.x + insetX &&
    p.x <= box.x + box.width - insetX &&
    p.y >= box.y + insetY &&
    p.y <= box.y + box.height - insetY
  );
}

/** Pre-seed the settings document; must run before the app boots. */
async function seedMotion(page: Page, motion: 'smooth' | 'instant' | 'off'): Promise<void> {
  await page.addInitScript((m) => {
    window.localStorage.setItem('quadrator.settings', JSON.stringify({ recentreMotion: m }));
  }, motion);
}

/** Load the fixture image, draw the quadrat and open the Species ID tab. */
async function setUp(page: Page): Promise<void> {
  await forceFallbackMode(page);
  await page.goto('/');
  await expect(page.getByTestId('home-load-images')).toBeVisible();
  await pickFiles(
    page,
    () => page.getByTestId('home-load-images').click(),
    path.join(FIXTURES, 'quad.png')
  );

  const svg = page.getByTestId('canvas-svg');
  await expect(svg).toBeVisible();
  const box = (await svg.boundingBox())!;
  for (const [fx, fy] of [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
    [0.1, 0.1],
  ] as const) {
    await svg.click({ position: { x: box.width * fx, y: box.height * fy } });
  }
  await expect(page.getByTestId('sample-0')).toBeVisible();
  // Prev/Next and the motion preference live on the Species ID tab
  // (SpeciesTab.vue); the canvas stays visible beside it.
  await page.getByTestId('tab-species').click();
  await expect(page.getByTestId('next-sample')).toBeVisible();
}

/** Index of the sample the cursor is on, from the position readout. */
async function currentIndex(page: Page): Promise<number> {
  const text = (await page.getByTestId('sample-position').textContent())!;
  return Number(/Point (\d+)/.exec(text)![1]) - 1;
}

/**
 * Walk forward until the NEXT step would be a move matching `accept`, and
 * stop just before it. Sample positions are randomised within their cells on
 * every run, so which step qualifies varies — it has to be measured rather
 * than assumed, or the test is a coin toss.
 */
async function stopBeforeMove(
  page: Page,
  accept: (travel: number, comfortable: boolean, box: Box) => boolean
): Promise<void> {
  for (let step = 0; step < 24; step++) {
    const box = await view(page);
    const successor = await page.getByTestId(`sample-${(await currentIndex(page)) + 1}`).boundingBox();
    if (successor !== null) {
      const c = centreOfBox(successor);
      if (accept(distance(c, centreOfBox(box)), isComfortable(c, box), box)) return;
    }
    await page.getByTestId('next-sample').click();
    await page.waitForTimeout(700); // let any pan settle before re-measuring
  }
  throw new Error('no qualifying move found in this quadrat');
}

/** Zoom in by `steps` wheel notches, confirming it took effect. */
async function zoomIn(page: Page, steps: number): Promise<void> {
  const centre = centreOfBox(await view(page));
  await page.mouse.move(centre.x, centre.y);
  const before = (await page.getByTestId('sample-0').boundingBox())!;
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => (await page.getByTestId('sample-0').boundingBox())!.width)
    .toBeGreaterThan(before.width);
}

test('brings an out-of-view sample to the centre', async ({ page }) => {
  await setUp(page);
  await zoomIn(page, 6);
  await stopBeforeMove(page, (_travel, comfortable) => !comfortable);

  const target = (await currentIndex(page)) + 1;
  await page.getByTestId('next-sample').click();

  await expect
    .poll(async () => distance(await sampleCentre(page, target), centreOfBox(await view(page))), {
      timeout: 3000,
    })
    .toBeLessThan(4);
});

test('leaves the view alone while the next point is already comfortable', async ({ page }) => {
  await setUp(page);
  // A gentle zoom keeps neighbouring points inside the inset, which is what
  // spares a repetitive tagging run from panning on every keystroke.
  await zoomIn(page, 1);

  // Find a consecutive pair that is currently well inside the view rather
  // than assuming one: sample positions are randomised within their cells,
  // and the first row sits near the top edge.
  const box = await view(page);
  let from: number | null = null;
  for (let i = 0; i < 24; i++) {
    const here = await page.getByTestId(`sample-${i}`).boundingBox();
    const next = await page.getByTestId(`sample-${i + 1}`).boundingBox();
    if (here === null || next === null) continue;
    if (isComfortable(centreOfBox(here), box) && isComfortable(centreOfBox(next), box)) {
      from = i;
      break;
    }
  }
  expect(from, 'expected some adjacent pair to be comfortably in view').not.toBeNull();

  // Select the first of the pair by clicking it — a canvas click never moves
  // the view, so this leaves the transform untouched.
  const c = await sampleCentre(page, from!);
  await page.mouse.click(c.x, c.y);
  await expect(page.getByTestId('sample-position')).toHaveText(
    new RegExp(`Point ${from! + 1} of 25`)
  );

  const before = await transformOf(page);
  await page.getByTestId('next-sample').click();
  await expect(page.getByTestId('sample-position')).toHaveText(
    new RegExp(`Point ${from! + 2} of 25`)
  );
  await page.waitForTimeout(700);

  expect(await transformOf(page)).toBe(before);
});

test('the pan eases rather than jumping', async ({ page }) => {
  await seedMotion(page, 'smooth');
  await setUp(page);
  await zoomIn(page, 6);
  // a move that is needed, and short enough to glide rather than cut
  await stopBeforeMove(
    page,
    (travel, comfortable, box) => !comfortable && travel <= Math.max(box.width, box.height)
  );
  await page.getByTestId('next-sample').click();

  const settled = await page.evaluate(async () => {
    const g = document.querySelector('[data-test="canvas-svg"] g')!;
    const readX = () => /translate\(([-\d.]+)/.exec(g.getAttribute('transform')!)![1]!;
    const first = readX();
    await new Promise((r) => setTimeout(r, 60));
    const mid = readX();
    await new Promise((r) => setTimeout(r, 800));
    return { first, mid, last: readX() };
  });

  expect(settled.mid).not.toBe(settled.first);
  expect(settled.last).not.toBe(settled.mid);
});

test('a very long move cuts instead of sweeping across the image', async ({ page }) => {
  // Even asked for smooth: a fast full-field sweep is what provokes motion
  // sickness, so a move longer than a viewport cuts instead.
  await seedMotion(page, 'smooth');
  await setUp(page);
  await zoomIn(page, 10);
  await stopBeforeMove(page, (travel, _c, box) => travel > Math.max(box.width, box.height));
  await page.getByTestId('next-sample').click();

  const samples = await page.evaluate(async () => {
    const g = document.querySelector('[data-test="canvas-svg"] g')!;
    const read = () => g.getAttribute('transform')!;
    const first = read();
    await new Promise((r) => setTimeout(r, 120));
    return { first, later: read() };
  });

  // already at its destination one frame later — no animation in between
  expect(samples.later).toBe(samples.first);
});

test('clicking a sample on the canvas does not move the view', async ({ page }) => {
  await setUp(page);
  await zoomIn(page, 6);

  const box = await view(page);
  let clicked: number | null = null;
  for (let i = 0; i < 25; i++) {
    const found = await page.getByTestId(`sample-${i}`).boundingBox();
    if (found === null) continue;
    const c = centreOfBox(found);
    if (isComfortable(c, box)) {
      clicked = i;
      await page.mouse.click(c.x, c.y);
      break;
    }
  }
  expect(clicked).not.toBeNull();
  await expect(page.getByTestId('sample-position')).toHaveText(
    new RegExp(`Point ${clicked! + 1} of 25`)
  );

  const before = await transformOf(page);
  await page.waitForTimeout(700);
  expect(await transformOf(page)).toBe(before);
});

test('at default zoom navigating never moves the view', async ({ page }) => {
  await setUp(page);
  const before = await transformOf(page);
  for (let i = 0; i < 5; i++) await page.getByTestId('next-sample').click();
  await page.waitForTimeout(700);
  expect(await transformOf(page)).toBe(before);
});

test('a persisted Off preference stops the view following at all', async ({ page }) => {
  await seedMotion(page, 'off');
  await setUp(page);
  await zoomIn(page, 6);

  const before = await transformOf(page);
  for (let i = 0; i < 6; i++) await page.getByTestId('next-sample').click();
  await page.waitForTimeout(700);

  expect(await transformOf(page)).toBe(before);
});

test('the default arrives without animating', async ({ page }) => {
  // No preference seeded: the shipped default is `instant`.
  await setUp(page);
  await zoomIn(page, 6);
  await stopBeforeMove(page, (_travel, comfortable) => !comfortable);
  await page.getByTestId('next-sample').click();

  const samples = await page.evaluate(async () => {
    const g = document.querySelector('[data-test="canvas-svg"] g')!;
    const read = () => g.getAttribute('transform')!;
    const first = read();
    await new Promise((r) => setTimeout(r, 120));
    return { first, later: read() };
  });
  expect(samples.later).toBe(samples.first);
});
