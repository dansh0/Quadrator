/**
 * Session round-trip in the browser: save → reload the tab (all web file
 * ids die with the page) → load the session from the downloaded file →
 * tagging data intact, image recovered through the relink flow
 * (persistentFileIds: false).
 */
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  captureDownload,
  FIXTURES,
  forceFallbackMode,
  loadImageAndDrawQuad,
  loadSpeciesButtons,
  pickFiles,
} from './helpers.ts';

test('save session → reload → load from file → relink image → data intact', async ({ page }, testInfo) => {
  await forceFallbackMode(page);
  await page.goto('/');
  await loadImageAndDrawQuad(page);
  await loadSpeciesButtons(page);
  await page.getByTestId('species-ALG').click();

  // The menu buttons live on the Image Prep tab (ImagePrepTab.vue).
  await page.getByTestId('tab-prep').click();
  const { name, text } = await captureDownload(page, () =>
    page.getByTestId('menu-save-session').click()
  );
  expect(name).toMatch(/\.json$/);
  const saved = JSON.parse(text) as { schemaVersion: number };
  expect(saved.schemaVersion).toBe(2);
  const sessionFile = testInfo.outputPath('saved-session.json');
  await writeFile(sessionFile, text, 'utf8');

  // Fresh tab: adapter-scoped ids are gone.
  await page.reload();
  await pickFiles(page, () => page.getByTestId('home-open-session').click(), sessionFile);

  // The stored image id no longer resolves → relink flow.
  await expect(page.getByTestId('image-load-error')).toBeVisible();
  await pickFiles(
    page,
    () => page.getByTestId('relink-image').click(),
    path.join(FIXTURES, 'quad.png')
  );
  await expect(page.getByTestId('canvas-svg')).toBeVisible();
  await expect(page.getByTestId('boundary-polygon')).toBeVisible();

  // Tagging survived the round-trip (species buttons persist via settings).
  await page.getByTestId('tab-qa').click();
  const rows = page.getByTestId('qa-table').locator('tbody tr');
  await expect(rows).toHaveCount(25);
  await expect(rows.nth(0)).toContainText('ALG');
});

test('autosave snapshot offers Continue Last Session after a reload', async ({ page }) => {
  await forceFallbackMode(page);
  await page.goto('/');
  await loadImageAndDrawQuad(page);

  // The leading autosave fires when the image is added — before the
  // boundary exists; the boundary lands in the TRAILING write of the 5s
  // throttle window (packages/ui/src/autosave.ts), so outwait it.
  await expect(page.getByTestId('tab-prep')).toBeVisible();
  await page.waitForTimeout(5_500);

  await page.reload();
  await expect(page.getByTestId('home-continue-last')).toBeVisible();
  await page.getByTestId('home-continue-last').click();

  // Restored session: boundary + samples there, image awaiting relink.
  await expect(page.getByTestId('image-load-error')).toBeVisible();
  await page.getByTestId('tab-qa').click();
  await expect(page.getByTestId('qa-table').locator('tbody tr')).toHaveCount(25);
});
