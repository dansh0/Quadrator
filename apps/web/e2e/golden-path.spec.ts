/**
 * Golden path (DESIGN.md §5 item 4): load image → draw quad boundary → tag
 * species → export, with an exact CSV assertion. Runs in the adapter's
 * fallback mode (see helpers.forceFallbackMode).
 */
import { expect, test } from '@playwright/test';
import {
  captureDownload,
  forceFallbackMode,
  loadImageAndDrawQuad,
  loadSpeciesButtons,
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await forceFallbackMode(page);
  await page.goto('/');
  await expect(page.getByTestId('home-load-images')).toBeVisible();
});

test('draw → tag → export produces the exact CSV', async ({ page }) => {
  await loadImageAndDrawQuad(page);
  await loadSpeciesButtons(page);

  // Point 1: ALG. Point 2: ALG + COR. 25 samples total (5×5 default grid).
  await expect(page.getByTestId('sample-position')).toHaveText(/Point 1 of 25/);
  await page.getByTestId('species-ALG').click();
  await page.getByTestId('next-sample').click();
  await expect(page.getByTestId('sample-position')).toHaveText(/Point 2 of 25/);
  await page.getByTestId('species-ALG').click();
  await page.getByTestId('species-COR').click();

  // The menu buttons live on the Image Prep tab (ImagePrepTab.vue).
  await page.getByTestId('tab-prep').click();
  const { name, text } = await captureDownload(page, () =>
    page.getByTestId('menu-export-data').click()
  );
  expect(name).toBe('quadrat-data.csv');

  const lines = text.split('\n');
  expect(lines[0]).toBe(
    'Quadrat Title,Image Path,ID Date,Species Code,Species,Group Name,Species Count,Species Coverage %'
  );
  // ID Date renders as Date.toString(); pin every other column exactly.
  const dateString = lines[1]!.split(',')[2]!;
  expect(dateString).toMatch(/GMT/);
  expect(lines[1]).toBe(`quad,web:1,${dateString},ALG,Algae_sp,Plant - Benthic,2,8`);
  expect(lines[2]).toBe(`quad,web:1,${dateString},COR,Coral_sp,Animal - Benthic,1,4`);
  expect(lines[3]).toBe('');
  expect(lines).toHaveLength(4); // header + 2 species + trailing newline
});

test('QA table reflects tagging and hotkeys tag the current point', async ({ page }) => {
  await loadImageAndDrawQuad(page);
  await loadSpeciesButtons(page);

  // First button's hotkey is 'q' (legacy layout); Enter advances.
  await page.keyboard.press('q');
  await page.keyboard.press('Enter');
  await page.getByTestId('species-COR').click();

  await page.getByTestId('tab-qa').click();
  const rows = page.getByTestId('qa-table').locator('tbody tr');
  await expect(rows).toHaveCount(25);
  await expect(rows.nth(0)).toContainText('ALG');
  await expect(rows.nth(1)).toContainText('COR');

  // Hotkeys must not fire while typing (legacy data-loss bug): rename the
  // quadrat with a hotkey letter and verify nothing got tagged.
  await page.getByTestId('tab-prep').click();
  await page.getByTestId('quadrat-name').locator('input').fill('qqq');
  await page.getByTestId('tab-qa').click();
  await expect(rows.nth(0)).toContainText('ALG'); // unchanged, no extra tags
  await expect(page.getByTestId('qa-table')).not.toContainText('UNKNOWN');
});
