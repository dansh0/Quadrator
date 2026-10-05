// @vitest-environment happy-dom
/**
 * Species editor dialog (Settings → Species). Vuetify teleports dialog
 * content to <body>, so cells are found with document.body queries, and
 * every test unmounts (enableAutoUnmount) and clears the body.
 */
import { InMemoryPlatformAdapter } from '@quadrator/core';
import { enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import SpeciesEditorDialog from '../src/components/species/SpeciesEditorDialog.vue';
import SpeciesTab from '../src/components/tabs/SpeciesTab.vue';
import { useSessionStore } from '../src/stores/session.ts';
import { useSpeciesStore } from '../src/stores/species.ts';
import {
  SPECIES_CSV,
  mountWithShell,
  seedSession,
  stubVisualViewport,
  taggedQuadrat,
} from './helpers.ts';

beforeAll(stubVisualViewport);
enableAutoUnmount(afterEach);
afterEach(() => {
  document.body.innerHTML = '';
});

const flush = () => new Promise((r) => setTimeout(r, 0));

function $(selector: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-test="${selector}"]`);
}

function must(selector: string): HTMLElement {
  const el = $(selector);
  expect(el, `expected ${selector}`).not.toBeNull();
  return el!;
}

async function type(selector: string, value: string): Promise<void> {
  const input = must(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}

async function press(selector: string, key: string): Promise<KeyboardEvent> {
  const el = must(selector);
  el.focus();
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  await flush();
  return event;
}

async function shortcut(selector: string, key: string, mods: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...mods });
  must(selector).dispatchEvent(event);
  await flush();
  return event;
}

const value = (selector: string) => (must(selector) as HTMLInputElement).value;

async function click(selector: string): Promise<void> {
  must(selector).click();
  await flush();
}

const saveDisabled = () => must('editor-save').hasAttribute('disabled');

/** Editor open over the three-species list; optionally with tagged samples. */
async function openEditor(codesOnFirstSample: string[] = []) {
  const platform = new InMemoryPlatformAdapter();
  await platform.saveSettings({ speciesCsvText: SPECIES_CSV });
  const shell = mountWithShell(SpeciesEditorDialog, platform, { modelValue: false });
  await useSpeciesStore().init(platform);
  const session = seedSession([taggedQuadrat('q1', 3)]);
  session.quadrats[0]!.samples[0]!.codes = [...codesOnFirstSample];
  await shell.wrapper.setProps({ modelValue: true });
  await flush();
  return shell;
}

const closed = (wrapper: { emitted: (e: string) => unknown[][] | undefined }) =>
  wrapper.emitted('update:modelValue')?.at(-1)?.[0] === false;

describe('SpeciesEditorDialog', () => {
  it('shows the saved list as editable rows, with automatic keys', async () => {
    await openEditor();
    expect((must('cell-0-code') as HTMLInputElement).value).toBe('Ulva');
    expect((must('cell-2-species') as HTMLInputElement).value).toBe('Mytilus sp.');
    expect(must('cell-0-hotkey').textContent?.trim()).toBe('auto · q');
    expect(must('editor-preview').textContent).toContain('Barn [w]');
  });

  const listShown = (cell: string) => must(cell).getAttribute('aria-expanded') === 'true';
  const shownOptions = () =>
    [...document.body.querySelectorAll('[data-test^="combo-option-"]')].map((o) => o.textContent?.trim());

  async function clickInto(selector: string): Promise<void> {
    must(selector).focus();
    await click(selector);
  }

  it('clicking a filled group cell lists the other groups in the column', async () => {
    await openEditor();
    await clickInto('cell-1-group1'); // Barn: 'Animal'; Myt is also 'Animal'
    expect(listShown('cell-1-group1')).toBe(true);
    expect(shownOptions()).toEqual(['Algae', 'Animal']);
    // the cell's own group is highlighted, so Enter keeps it
    expect(must('combo-option-1').classList.contains('v-list-item--active')).toBe(true);
    expect(document.activeElement).toBe(must('cell-1-group1'));
  });

  it('typing filters the list; Down + Enter picks; the pick is one undo step', async () => {
    await openEditor();
    must('cell-2-group1').focus();
    await type('cell-2-group1', 'al');
    expect(shownOptions()).toEqual(['Algae', 'Animal']); // the cell's own 'al' is not offered
    await type('cell-2-group1', 'alg');
    expect(shownOptions()).toEqual(['Algae']);

    await press('cell-2-group1', 'ArrowDown');
    await press('cell-2-group1', 'Enter');
    expect(value('cell-2-group1')).toBe('Algae');
    expect(listShown('cell-2-group1')).toBe(false);
    expect(document.activeElement).toBe(must('cell-2-group1')); // Enter picked, did not move

    await click('editor-undo');
    expect(value('cell-2-group1')).toBe('alg');
  });

  it('Enter with nothing highlighted closes the list and moves down as usual', async () => {
    await openEditor();
    must('cell-0-group1').focus();
    await type('cell-0-group1', 'an');
    await press('cell-0-group1', 'Enter');
    expect(value('cell-0-group1')).toBe('an');
    expect(document.activeElement).toBe(must('cell-1-group1'));
  });

  it('a mouse pick sets the cell and closes the list', async () => {
    await openEditor();
    await clickInto('cell-1-group2'); // 'Sessile'; Ulva's is 'Intertidal'
    const option = must('combo-option-0');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    option.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true); // focus stays in the cell
    await click('combo-option-0');
    expect(value('cell-1-group2')).toBe('Intertidal');
    expect(listShown('cell-1-group2')).toBe(false);
  });

  it('a new group is just typed, and becomes a choice for the other rows', async () => {
    await openEditor();
    must('cell-2-group1').focus();
    await type('cell-2-group1', 'Mollusc');
    expect(listShown('cell-2-group1')).toBe(false); // nothing else matches
    await clickInto('cell-0-group1');
    expect(shownOptions()).toEqual(['Animal', 'Mollusc']);
  });

  it('colour cells list the column\'s other colours, each with a swatch', async () => {
    await openEditor();
    await clickInto('cell-0-color'); // Ulva: #4caf50
    expect(listShown('cell-0-color')).toBe(true);
    expect(shownOptions()).toEqual(['#9c27b0', '#2196f3']);
    const swatch = must('combo-option-1').querySelector<HTMLElement>('.option-swatch');
    expect(swatch?.style.background).toMatch(/#2196f3|rgb\(33, 150, 243\)/);

    await press('cell-0-color', 'ArrowDown');
    await press('cell-0-color', 'ArrowDown');
    await press('cell-0-color', 'Enter');
    expect(value('cell-0-color')).toBe('#2196f3');

    // typing filters by the code, selected colours have their own column's list
    must('cell-1-colorSelected').focus();
    await type('cell-1-colorSelected', '#15');
    expect(shownOptions()).toEqual(['#1565c0']);
  });

  it('Esc closes the list only; with it closed, arrows move rows; Alt+Down opens it', async () => {
    const { wrapper } = await openEditor();
    await clickInto('cell-0-group1');
    expect(listShown('cell-0-group1')).toBe(true);
    await press('cell-0-group1', 'Escape');
    expect(listShown('cell-0-group1')).toBe(false);
    expect(closed(wrapper)).toBe(false);

    await press('cell-0-group1', 'ArrowDown');
    expect(document.activeElement).toBe(must('cell-1-group1'));

    const alt = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true });
    must('cell-1-group1').dispatchEvent(alt);
    await flush();
    expect(listShown('cell-1-group1')).toBe(true);
  });

  it('starts with one blank row when there is no list yet', async () => {
    mountWithShell(SpeciesEditorDialog, new InMemoryPlatformAdapter(), { modelValue: true });
    await flush();
    expect($('grid-row-0')).not.toBeNull();
    expect($('grid-row-1')).toBeNull();
    expect((must('cell-0-code') as HTMLInputElement).value).toBe('');
  });

  it('Save validates, persists the edited list and closes', async () => {
    const { wrapper, platform } = await openEditor();
    await type('cell-1-species', 'Barnacles');
    await click('editor-save');

    expect(useSpeciesStore().entries[1]!.species).toBe('Barnacles');
    const persisted = (await platform.loadSettings()) as { speciesCsvText: string };
    expect(persisted.speciesCsvText).toContain('Barn,Barnacles,');
    expect(closed(wrapper)).toBe(true);
  });

  it('flags problems on the cell and refuses to save until fixed', async () => {
    await openEditor();
    await type('cell-1-code', 'Ulva');
    expect(saveDisabled()).toBe(true);
    expect(must('editor-issues').textContent).toMatch(/row 2, code: 'Ulva' is already used on row 1/);
    expect(must('cell-1-code').closest('td')!.classList.contains('cell--error')).toBe(true);

    await type('cell-1-code', 'Barn');
    expect(saveDisabled()).toBe(false);
    expect($('editor-issues')).toBeNull();
  });

  it('the Hotkey cell takes the key pressed; Delete returns it to automatic', async () => {
    await openEditor();
    const event = await press('cell-2-hotkey', 'z');
    expect(event.defaultPrevented).toBe(true);
    expect(must('cell-2-hotkey').textContent?.trim()).toBe('z');

    await press('cell-2-hotkey', 'Delete');
    expect(must('cell-2-hotkey').textContent?.trim()).toBe('auto · e');

    await press('cell-2-hotkey', 'Q'); // Caps Lock
    expect(must('cell-2-hotkey').textContent?.trim()).toBe('q');
    expect(must('cell-0-hotkey').closest('td')!.classList.contains('cell--error')).toBe(false);
    // Ulva now falls back to the next free key; nothing clashes
    expect(must('cell-0-hotkey').textContent?.trim()).toBe('auto · w');

    await press('cell-2-hotkey', 'Enter'); // moves down instead of binding
    expect(must('cell-2-hotkey').textContent?.trim()).toBe('q');
    await press('cell-1-hotkey', '!');
    expect(must('key-message').textContent).toMatch(/can't be a hotkey/);
  });

  it('Enter moves down a column and adds a row past the last one', async () => {
    await openEditor();
    await press('cell-0-species', 'Enter');
    expect(document.activeElement).toBe(must('cell-1-species'));

    await press('cell-2-species', 'Enter');
    expect($('grid-row-3')).not.toBeNull();
    expect(document.activeElement).toBe(must('cell-3-species'));

    await press('cell-3-species', 'ArrowUp');
    expect(document.activeElement).toBe(must('cell-2-species'));
  });

  it('Escape restores the cell being edited, without closing the dialog', async () => {
    const { wrapper } = await openEditor();
    const cell = must('cell-0-species');
    cell.focus();
    await type('cell-0-species', 'typo');
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect((must('cell-0-species') as HTMLInputElement).value).toBe('Ulva sp.');
    expect(closed(wrapper)).toBe(false);
  });

  it('Escape with nothing to restore closes the editor', async () => {
    const { wrapper } = await openEditor();
    await press('cell-1-species', 'Escape');
    expect(closed(wrapper)).toBe(true);
  });

  it('Escape in a Hotkey cell closes the editor rather than binding', async () => {
    const { wrapper } = await openEditor();
    await press('cell-0-hotkey', 'Escape');
    expect(closed(wrapper)).toBe(true);
    expect(useSpeciesStore().hotkeyFor('Ulva')).toBe('q');
  });

  it('a second Escape after restoring a cell closes the editor', async () => {
    const { wrapper } = await openEditor();
    const cell = must('cell-0-species');
    cell.focus();
    await type('cell-0-species', 'typo');
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(closed(wrapper)).toBe(false);
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(closed(wrapper)).toBe(true);
  });

  it('Escape with unsaved changes asks first; Escape again keeps editing', async () => {
    const { wrapper } = await openEditor();
    await type('cell-0-species', 'changed');
    await press('cell-1-species', 'Escape'); // a different, unedited cell
    expect($('prompt-discard')).not.toBeNull();
    expect(closed(wrapper)).toBe(false);

    await press('prompt-discard', 'Escape');
    expect($('prompt-discard')).toBeNull();
    expect(closed(wrapper)).toBe(false);
    expect((must('cell-0-species') as HTMLInputElement).value).toBe('changed');
  });

  it('pasting a block from a spreadsheet fills cells and adds rows', async () => {
    await openEditor();
    const target = must('cell-2-code');
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => 'Myt\tMussel\nPat\tLimpet\nChit\tChiton\n' },
    });
    target.dispatchEvent(paste);
    await flush();

    expect(paste.defaultPrevented).toBe(true);
    expect((must('cell-2-species') as HTMLInputElement).value).toBe('Mussel');
    expect((must('cell-3-code') as HTMLInputElement).value).toBe('Pat');
    expect((must('cell-4-species') as HTMLInputElement).value).toBe('Chiton');
  });

  it('row menu deletes a row', async () => {
    await openEditor();
    await click('row-menu-0');
    await click('row-delete');
    expect((must('cell-0-code') as HTMLInputElement).value).toBe('Barn');
    expect($('grid-row-2')).toBeNull();
  });

  it('Cancel with unsaved changes asks before discarding', async () => {
    const { wrapper } = await openEditor();
    await type('cell-0-species', 'changed');
    await click('editor-cancel');
    expect($('prompt-discard')).not.toBeNull();

    await click('prompt-keep-editing');
    expect(closed(wrapper)).toBe(false);

    await click('editor-cancel');
    await click('prompt-discard-yes');
    expect(closed(wrapper)).toBe(true);
    expect(useSpeciesStore().entries[0]!.species).toBe('Ulva sp.');
  });

  it('Cancel without changes just closes', async () => {
    const { wrapper } = await openEditor();
    await click('editor-cancel');
    expect($('prompt-discard')).toBeNull();
    expect(closed(wrapper)).toBe(true);
  });

  it('Import into a non-empty list asks: replace or merge by code', async () => {
    const { platform } = await openEditor();
    platform.queueSpeciesOpen('code,species\nBarn,Barnacle (new)\nPat,Limpet\n');
    await click('editor-import');
    await click('prompt-import-merge');
    expect((must('cell-1-species') as HTMLInputElement).value).toBe('Barnacle (new)');
    expect((must('cell-3-code') as HTMLInputElement).value).toBe('Pat');

    platform.queueSpeciesOpen('code,species\nPat,Limpet\n');
    await click('editor-import');
    await click('prompt-import-replace');
    expect((must('cell-0-code') as HTMLInputElement).value).toBe('Pat');
    expect($('grid-row-1')).toBeNull();
  });

  it('Import shows a parse error and leaves the draft alone', async () => {
    const { platform } = await openEditor();
    platform.queueSpeciesOpen('wrong,header\n');
    await click('editor-import');
    expect(must('editor-error').textContent).toMatch(/code/);
    expect((must('cell-0-code') as HTMLInputElement).value).toBe('Ulva');
  });

  it('Export writes the draft as CSV, hotkeys included', async () => {
    const { platform } = await openEditor();
    await press('cell-0-hotkey', '1');
    platform.queueSaveTarget({ id: '/species.csv', name: 'species.csv' });
    await click('editor-export');
    expect(platform.exportedCsvs).toHaveLength(1);
    expect(platform.exportedCsvs[0]!.text).toBe(
      'code,species,group1,group2,color,colorSelected,hotkey\n' +
        'Ulva,Ulva sp.,Algae,Intertidal,#4caf50,#2e7d32,1\n' +
        'Barn,Cirripedia spp,Animal,Sessile,#9c27b0,#7c1790,\n' +
        'Myt,Mytilus sp.,Animal,Sessile,#2196f3,#1565c0,\n'
    );
  });

  it('renaming a tagged code offers to rename the tags too', async () => {
    await openEditor(['Ulva', 'Barn']);
    await type('cell-0-code', 'Ulv');
    await click('editor-save');
    expect(must('prompt-codes').textContent).toMatch(/Ulva → Ulv \(1 sample\)/);

    await click('prompt-codes-rename');
    expect(useSpeciesStore().codes).toEqual(['Ulv', 'Barn', 'Myt']);
    expect(useSessionStore().session!.quadrats[0]!.samples[0]!.codes).toEqual(['Ulv', 'Barn']);
  });

  it('Keep old tags saves the rename but leaves the samples alone', async () => {
    await openEditor(['Ulva']);
    await type('cell-0-code', 'Ulv');
    await click('editor-save');
    await click('prompt-codes-keep');
    expect(useSpeciesStore().codes).toEqual(['Ulv', 'Barn', 'Myt']);
    expect(useSessionStore().session!.quadrats[0]!.samples[0]!.codes).toEqual(['Ulva']);
  });

  it('deleting a tagged code warns before saving; Cancel keeps the list', async () => {
    await openEditor(['Barn']);
    await click('row-menu-1');
    await click('row-delete');
    await click('editor-save');
    expect(must('prompt-codes').textContent).toMatch(/Barn \(1 sample\)/);
    expect(must('prompt-codes').textContent).toMatch(/UNKNOWN CODE/);

    await click('prompt-codes-cancel');
    expect(useSpeciesStore().codes).toEqual(['Ulva', 'Barn', 'Myt']);

    await click('editor-save');
    await click('prompt-codes-save');
    expect(useSpeciesStore().codes).toEqual(['Ulva', 'Myt']);
  });

  it('untagged renames and deletes save without asking', async () => {
    const { wrapper } = await openEditor();
    await type('cell-0-code', 'Ulv');
    await click('editor-save');
    expect($('prompt-codes')).toBeNull();
    expect(closed(wrapper)).toBe(true);
  });
});

describe('SpeciesEditorDialog undo/redo', () => {
  it('starts with nothing to undo or redo', async () => {
    await openEditor();
    expect(must('editor-undo').hasAttribute('disabled')).toBe(true);
    expect(must('editor-redo').hasAttribute('disabled')).toBe(true);
  });

  it('typing in one cell is one step; Undo and Redo buttons walk it', async () => {
    await openEditor();
    must('cell-0-species').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    for (const v of ['U', 'Ul', 'Ulv']) await type('cell-0-species', v);
    must('cell-1-species').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await type('cell-1-species', 'B');

    await click('editor-undo');
    expect(value('cell-1-species')).toBe('Cirripedia spp');
    expect(value('cell-0-species')).toBe('Ulv');
    await click('editor-undo');
    expect(value('cell-0-species')).toBe('Ulva sp.');
    expect(must('editor-undo').hasAttribute('disabled')).toBe(true);

    await click('editor-redo');
    expect(value('cell-0-species')).toBe('Ulv');
    await click('editor-redo');
    expect(value('cell-1-species')).toBe('B');
    expect(must('editor-redo').hasAttribute('disabled')).toBe(true);
  });

  it('Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y work from a cell, overriding the browser', async () => {
    await openEditor();
    await type('cell-0-code', 'X');
    const undo = await shortcut('cell-0-code', 'z');
    expect(undo.defaultPrevented).toBe(true);
    expect(value('cell-0-code')).toBe('Ulva');
    await shortcut('cell-0-code', 'Z', { shiftKey: true });
    expect(value('cell-0-code')).toBe('X');
    await shortcut('cell-0-code', 'z');
    await shortcut('cell-0-code', 'y');
    expect(value('cell-0-code')).toBe('X');
  });

  it('Ctrl+Z in a Hotkey cell undoes instead of being refused as a key', async () => {
    await openEditor();
    await press('cell-2-hotkey', 'z');
    expect(must('cell-2-hotkey').textContent?.trim()).toBe('z');
    await shortcut('cell-2-hotkey', 'z');
    expect(must('cell-2-hotkey').textContent?.trim()).toBe('auto · e');
    expect($('key-message')).toBeNull();
  });

  it('row deletes, Enter-added rows and pastes are steps of their own', async () => {
    await openEditor();
    await click('row-menu-0');
    await click('row-delete');
    expect(value('cell-0-code')).toBe('Barn');
    await press('cell-1-code', 'Enter'); // last row → adds one
    expect($('grid-row-2')).not.toBeNull();

    await click('editor-undo');
    expect($('grid-row-2')).toBeNull();
    await click('editor-undo');
    expect(value('cell-0-code')).toBe('Ulva');
  });

  it('an import is one step', async () => {
    const { platform } = await openEditor();
    platform.queueSpeciesOpen('code,species\nPat,Limpet\n');
    await click('editor-import');
    await click('prompt-import-replace');
    expect($('grid-row-1')).toBeNull();
    await click('editor-undo');
    expect(value('cell-0-code')).toBe('Ulva');
    expect(value('cell-2-code')).toBe('Myt');
  });

  it('undoing back to the saved list leaves nothing to discard', async () => {
    const { wrapper } = await openEditor();
    await type('cell-0-species', 'changed');
    await click('editor-undo');
    await click('editor-cancel');
    expect($('prompt-discard')).toBeNull();
    expect(closed(wrapper)).toBe(true);
  });

  it('a new edit after undo clears redo; reopening starts a fresh history', async () => {
    const { wrapper } = await openEditor();
    await type('cell-0-code', 'A');
    await click('editor-undo');
    await type('cell-1-code', 'B');
    expect(must('editor-redo').hasAttribute('disabled')).toBe(true);

    await click('editor-save');
    await wrapper.setProps({ modelValue: false }); // what the parent's v-model does
    await wrapper.setProps({ modelValue: true });
    await flush();
    expect(must('editor-undo').hasAttribute('disabled')).toBe(true);
  });
});

describe('species editor over the Species tab', () => {
  it('typing in the grid never tags the current sample', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ hotkeysEnabled: true, speciesCsvText: SPECIES_CSV });
    const { wrapper } = mountWithShell(SpeciesTab, platform);
    seedSession([taggedQuadrat('q1', 3)]);
    await useSpeciesStore().init(platform);
    await wrapper.vm.$nextTick();

    await wrapper.find('[data-test="edit-species"]').trigger('click');
    await flush();
    await press('cell-0-species', 'q'); // Ulva's hotkey, typed into a cell
    await press('cell-1-hotkey', 'w'); // and into the capture cell
    await press('cell-0-species', 'Enter'); // would advance the cursor

    const sample = useSessionStore().currentQuadrat!.samples[0]!;
    expect(sample.codes).toEqual([]);
  });
});
