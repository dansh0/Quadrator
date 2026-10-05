/**
 * Species list built and edited in the app (Settings → Species), and
 * hotkeys rebound from the Species tab — no CSV needed. Runs in the
 * adapter's fallback mode (see helpers.forceFallbackMode).
 */
import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import {
  captureDownload,
  forceFallbackMode,
  loadImageAndDrawQuad,
  loadSpeciesButtons,
  pickFiles,
} from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await forceFallbackMode(page);
  await page.goto('/');
  await expect(page.getByTestId('home-load-images')).toBeVisible();
});

const cell = (page: Page, row: number, field: string) => page.getByTestId(`cell-${row}-${field}`);

test('build a list from scratch, tag with it, export exact results', async ({ page }) => {
  await loadImageAndDrawQuad(page);
  await page.getByTestId('tab-species').click();
  await page.getByTestId('create-species').click();
  await expect(page.getByTestId('species-editor')).toBeVisible();

  // Type like a spreadsheet: Tab across, Enter adds the next row.
  await cell(page, 0, 'code').click();
  await page.keyboard.type('Ulva');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Ulva sp.');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Algae');
  await cell(page, 0, 'color').fill('#4caf50');
  await cell(page, 0, 'code').click();
  await page.keyboard.press('Enter');
  await expect(cell(page, 1, 'code')).toBeFocused();
  await page.keyboard.type('Barn');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Barnacle');

  // Give Barnacle the 'b' key by pressing it in its Hotkey cell.
  await cell(page, 1, 'hotkey').click();
  await page.keyboard.press('b');
  await expect(cell(page, 1, 'hotkey')).toHaveText('b');
  await expect(cell(page, 0, 'hotkey')).toHaveText('auto · q');

  // Nothing typed above may have tagged the current point.
  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('species-editor')).toBeHidden();
  await expect(page.getByTestId('species-Ulva')).toHaveText('Ulva [q]');
  await expect(page.getByTestId('species-Barn')).toHaveText('Barn [b]');

  await page.keyboard.press('q');
  await page.keyboard.press('b');
  await page.keyboard.press('Enter');
  await page.keyboard.press('b');

  await page.getByTestId('tab-prep').click();
  const { text } = await captureDownload(page, () => page.getByTestId('menu-export-data').click());
  const lines = text.split('\n');
  const date = lines[1]!.split(',')[2]!;
  expect(lines.slice(1)).toEqual([
    `quad,web:1,${date},Ulva,Ulva sp.,Algae - ,1,4`,
    `quad,web:1,${date},Barn,Barnacle, - ,2,8`,
    '',
  ]);
});

test('export the list, wipe it, import it back: identical', async ({ page }, testInfo) => {
  await loadImageAndDrawQuad(page);
  await loadSpeciesButtons(page);

  await page.getByTestId('edit-species').click();
  await cell(page, 1, 'hotkey').click();
  await page.keyboard.press('1');
  const { name, text } = await captureDownload(page, () => page.getByTestId('editor-export').click());
  expect(name).toBe('species.csv');
  expect(text).toBe(
    'code,species,group1,group2,color,colorSelected,hotkey\n' +
      'ALG,Algae_sp,Plant,Benthic,#00aa00,#008800,\n' +
      'COR,Coral_sp,Animal,Benthic,#aa0000,#880000,1\n'
  );
  const file = testInfo.outputPath('species.csv');
  await writeFile(file, text, 'utf8');

  // Replace the draft with a stranger list, then import the export back.
  await page.getByTestId('row-menu-1').click();
  await page.getByTestId('row-delete').click();
  await cell(page, 0, 'code').fill('X');
  await pickFiles(page, () => page.getByTestId('editor-import').click(), file);
  await page.getByTestId('prompt-import-replace').click();
  await page.getByTestId('editor-save').click();

  await expect(page.getByTestId('species-ALG')).toHaveText('ALG [q]');
  await expect(page.getByTestId('species-COR')).toHaveText('COR [1]');
});

test('rebind a hotkey on the Species tab; it survives a reload', async ({ page }) => {
  await loadImageAndDrawQuad(page);
  await loadSpeciesButtons(page);
  await expect(page.getByTestId('species-COR')).toHaveText('COR [w]');

  await page.getByTestId('edit-hotkeys').click();
  await page.getByTestId('species-COR').click();
  await page.keyboard.press('q'); // ALG's key: the two swap
  await expect(page.getByTestId('species-COR')).toHaveText('COR [q]');
  await expect(page.getByTestId('species-ALG')).toHaveText('ALG [w]');
  await page.keyboard.press('Escape'); // done
  await expect(page.getByTestId('bind-hint')).toBeHidden();

  await page.keyboard.press('q');
  await page.getByTestId('tab-qa').click();
  await expect(page.getByTestId('qa-table').locator('tbody tr').first()).toContainText('COR');

  // The list (with its keys) persists; the session does not on the web.
  await page.reload();
  await loadImageAndDrawQuad(page);
  await page.getByTestId('tab-species').click();
  await expect(page.getByTestId('species-COR')).toHaveText('COR [q]');
});

test('Escape closes the editor, asking first when there are unsaved changes', async ({ page }) => {
  await loadImageAndDrawQuad(page);
  await loadSpeciesButtons(page);

  // Edit Hotkeys mode ends when the editor opens.
  await page.getByTestId('edit-hotkeys').click();
  await page.getByTestId('edit-species').click();
  await expect(page.getByTestId('species-editor')).toBeVisible();

  await cell(page, 0, 'species').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('species-editor')).toBeHidden();
  await expect(page.getByTestId('bind-hint')).toBeHidden();

  // With a change: first Esc restores the cell, the next one closes.
  await page.getByTestId('edit-species').click();
  await cell(page, 0, 'species').click();
  await page.keyboard.type(' changed');
  await page.keyboard.press('Escape');
  await expect(cell(page, 0, 'species')).toHaveValue('Algae_sp');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('species-editor')).toBeHidden();

  // An unsaved change elsewhere: Esc asks, Esc again keeps editing.
  await page.getByTestId('edit-species').click();
  await cell(page, 0, 'species').fill('Algae');
  await cell(page, 1, 'species').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('prompt-discard')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('prompt-discard')).toBeHidden();
  await expect(page.getByTestId('species-editor')).toBeVisible();
  await expect(cell(page, 0, 'species')).toHaveValue('Algae');
});

