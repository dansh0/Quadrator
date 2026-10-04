import type { Download, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * The pickers of the File System Access API cannot be driven by automation,
 * so E2E runs in the adapter's fallback mode (`<input type=file>` +
 * downloads), which Playwright's filechooser/download events fully control.
 * Must be installed before the app loads (the adapter detects capabilities
 * at construction).
 */
export async function forceFallbackMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w['showOpenFilePicker'];
    delete w['showSaveFilePicker'];
  });
}

/** Click something that opens a file dialog and answer it with fixtures. */
export async function pickFiles(page: Page, trigger: () => Promise<void>, ...files: string[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await trigger();
  await (await chooser).setFiles(files);
}

/** Click something that starts a download and return the file's text. */
export async function captureDownload(page: Page, trigger: () => Promise<void>): Promise<{ name: string; text: string; download: Download }> {
  const waiting = page.waitForEvent('download');
  await trigger();
  const download = await waiting;
  const file = await download.path();
  return { name: download.suggestedFilename(), text: await readFile(file, 'utf8'), download };
}

/**
 * Wait until the canvas view stops moving.
 *
 * Committing a boundary starts a one-time framing animation (see
 * `frameQuadrat` in ImageCanvas.vue), so the transform is in motion for a few
 * hundred ms after the ring closes. Anything that reads or depends on the
 * transform has to let that finish first, or it races.
 */
export async function settleView(page: Page): Promise<string> {
  let last = '';
  await expect
    .poll(
      async () => {
        const now =
          (await page.getByTestId('canvas-svg').locator('g').first().getAttribute('transform')) ??
          '';
        const stable = now !== '' && now === last;
        last = now;
        return stable;
      },
      { message: 'canvas view settles', timeout: 5000 }
    )
    .toBe(true);
  return last;
}

/**
 * Load the fixture image from the home screen and draw the standard quad
 * boundary (clicks at 10%/90% corners of the canvas — quad mode
 * auto-completes on the 4th node and generates the 5×5 sample grid), then
 * wait for the framing animation to come to rest.
 */
export async function loadImageAndDrawQuad(page: Page): Promise<void> {
  await pickFiles(
    page,
    () => page.getByTestId('home-load-images').click(),
    path.join(FIXTURES, 'quad.png')
  );

  const svg = page.getByTestId('canvas-svg');
  await expect(svg).toBeVisible();
  const box = (await svg.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.width * fx, y: box.height * fy });
  // Default draw mode is polygon: four corners, then close the ring by
  // clicking the first node again (legacy 0.025-per-axis close rule).
  for (const [fx, fy] of [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
    [0.1, 0.1],
  ] as const) {
    await svg.click({ position: at(fx, fy) });
  }
  await expect(page.getByTestId('boundary-polygon')).toBeVisible();
  await expect(page.getByTestId('sample-0')).toBeVisible();
  await settleView(page);
}

/** Load the two-species fixture button set on the Species ID tab. */
export async function loadSpeciesButtons(page: Page): Promise<void> {
  await page.getByTestId('tab-species').click();
  await pickFiles(
    page,
    () => page.getByTestId('load-buttons').click(),
    path.join(FIXTURES, 'buttons.csv')
  );
  await expect(page.getByTestId('species-ALG')).toBeVisible();
}
