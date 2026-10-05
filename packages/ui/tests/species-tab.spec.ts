// @vitest-environment happy-dom
import { InMemoryPlatformAdapter } from '@quadrator/core';
import { enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import SpeciesTab from '../src/components/tabs/SpeciesTab.vue';
import { useSessionStore } from '../src/stores/session.ts';
import { useSpeciesStore } from '../src/stores/species.ts';
import { useTaggingStore } from '../src/stores/tagging.ts';
import { SPECIES_CSV, mountWithShell, seedSession, stubVisualViewport, taggedQuadrat } from './helpers.ts';

beforeAll(stubVisualViewport);
// Each tab listens on window; one left mounted would also answer the next
// test's keypresses.
enableAutoUnmount(afterEach);

async function mountTab(nSamples = 4) {
  const platform = new InMemoryPlatformAdapter();
  await platform.saveSettings({ hotkeysEnabled: true, speciesCsvText: SPECIES_CSV });
  const shell = mountWithShell(SpeciesTab, platform);
  seedSession([taggedQuadrat('q1', nSamples)]);
  await useSpeciesStore().init(platform);
  await shell.wrapper.vm.$nextTick();
  return shell;
}

function keydown(key: string, target?: EventTarget, init: KeyboardEventInit = {}): void {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, ...init });
  if (target) Object.defineProperty(event, 'target', { value: target });
  window.dispatchEvent(event);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('SpeciesTab', () => {
  it('shows the empty state until buttons are loaded', () => {
    const { wrapper } = mountWithShell(SpeciesTab);
    expect(wrapper.find('[data-test="no-buttons"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="download-template"]').exists()).toBe(true);
  });

  it('renders a button per species with hotkey labels', async () => {
    const { wrapper } = await mountTab();
    expect(wrapper.find('[data-test="species-Ulva"]').text()).toBe('Ulva [q]');
    expect(wrapper.find('[data-test="species-Barn"]').text()).toBe('Barn [w]');
    expect(wrapper.find('[data-test="species-Myt"]').text()).toBe('Myt [e]');
  });

  it('clicking a species button toggles the code on the current sample', async () => {
    const { wrapper } = await mountTab();
    const session = useSessionStore();

    await wrapper.find('[data-test="species-Ulva"]').trigger('click');
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual(['Ulva']);
    await wrapper.find('[data-test="species-Ulva"]').trigger('click');
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual([]);
  });

  it('Prev/Next move the cursor and update the position readout', async () => {
    const { wrapper } = await mountTab(3);
    expect(wrapper.find('[data-test="sample-position"]').text()).toContain('Point 1 of 3');

    await wrapper.find('[data-test="next-sample"]').trigger('click');
    expect(wrapper.find('[data-test="sample-position"]').text()).toContain('Point 2 of 3');
    await wrapper.find('[data-test="prev-sample"]').trigger('click');
    expect(wrapper.find('[data-test="sample-position"]').text()).toContain('Point 1 of 3');
  });

  it('hotkeys tag the current sample and arrows/Enter navigate', async () => {
    await mountTab(3);
    const session = useSessionStore();
    const tagging = useTaggingStore();

    keydown('q'); // Ulva
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual(['Ulva']);
    keydown('Enter');
    expect(tagging.cursor).toBe(1);
    keydown('w'); // Barn on sample 2
    expect(session.currentQuadrat?.samples[1]?.codes).toEqual(['Barn']);
    keydown('ArrowLeft');
    expect(tagging.cursor).toBe(0);
  });

  it('hotkeys are ignored while typing in a text input (data-safety rule)', async () => {
    await mountTab();
    const session = useSessionStore();

    const input = window.document.createElement('input');
    keydown('q', input);
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual([]);
  });

  it('hotkeys are inert when the preference is off, and unmount removes the listener', async () => {
    const { wrapper } = await mountTab();
    const session = useSessionStore();
    useSpeciesStore().hotkeysEnabled = false;

    keydown('q');
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual([]);

    useSpeciesStore().hotkeysEnabled = true;
    wrapper.unmount();
    keydown('q');
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual([]);
  });
});

describe('SpeciesTab selection emphasis', () => {
  it('toggles the emphasis off again on a second click', async () => {
    const { wrapper } = await mountTab();
    const button = () => wrapper.find('[data-test="species-Ulva"]');

    await button().trigger('click');
    expect(button().classes()).toContain('species-btn--selected');

    await button().trigger('click');
    expect(button().classes()).not.toContain('species-btn--selected');
  });

  it('adds the selected ring class and announces the state to assistive tech', async () => {
    const { wrapper } = await mountTab();
    const button = () => wrapper.find('[data-test="species-Ulva"]');
    expect(button().classes()).not.toContain('species-btn--selected');
    expect(button().attributes('aria-pressed')).toBe('false');

    await button().trigger('click');
    expect(button().classes()).toContain('species-btn--selected');
    expect(button().attributes('aria-pressed')).toBe('true');
  });

  it('emphasises only the codes tagged on the CURRENT sample', async () => {
    const { wrapper } = await mountTab();
    await wrapper.find('[data-test="species-Ulva"]').trigger('click');
    expect(wrapper.find('[data-test="species-Ulva"]').classes()).toContain(
      'species-btn--selected'
    );
    expect(wrapper.find('[data-test="species-Barn"]').classes()).not.toContain(
      'species-btn--selected'
    );

    // moving to an untagged point clears every emphasis
    await wrapper.find('[data-test="next-sample"]').trigger('click');
    expect(wrapper.findAll('.species-btn--selected')).toHaveLength(0);
  });

  it('emphasis follows a hotkey tag, not just a click', async () => {
    const { wrapper } = await mountTab();
    keydown('q'); // first code in the CSV = Ulva
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="species-Ulva"]').classes()).toContain(
      'species-btn--selected'
    );
  });
});

describe('SpeciesTab hotkey editing', () => {
  it('ignores hotkeys typed inside a dialog or menu', async () => {
    await mountTab();
    const overlay = window.document.createElement('div');
    overlay.className = 'v-overlay';
    const button = window.document.createElement('button');
    overlay.appendChild(button);
    keydown('q', button);
    expect(useSessionStore().currentQuadrat?.samples[0]?.codes).toEqual([]);
  });

  it('Edit Hotkeys pauses tagging: a click arms the button instead of tagging', async () => {
    const { wrapper } = await mountTab();
    await wrapper.find('[data-test="edit-hotkeys"]').trigger('click');
    expect(wrapper.find('[data-test="bind-hint"]').text()).toContain('Tagging is paused');

    keydown('q');
    expect(useSessionStore().currentQuadrat?.samples[0]?.codes).toEqual([]);

    await wrapper.find('[data-test="species-Myt"]').trigger('click');
    expect(useSessionStore().currentQuadrat?.samples[0]?.codes).toEqual([]);
    expect(wrapper.find('[data-test="species-Myt"]').text()).toBe('Myt [?]');
    expect(wrapper.find('[data-test="species-Myt"]').classes()).toContain('species-btn--armed');
  });

  it('the next key rebinds the armed species, swapping with its holder, and persists', async () => {
    const { wrapper, platform } = await mountTab();
    await wrapper.find('[data-test="edit-hotkeys"]').trigger('click');
    await wrapper.find('[data-test="species-Myt"]').trigger('click');

    keydown('q'); // Ulva's key
    await flush();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="species-Myt"]').text()).toBe('Myt [q]');
    expect(wrapper.find('[data-test="species-Ulva"]').text()).toBe('Ulva [e]');
    const persisted = (await platform.loadSettings()) as { speciesCsvText: string };
    expect(persisted.speciesCsvText).toContain(',q\n');

    // back to tagging: q now tags Myt
    await wrapper.find('[data-test="edit-hotkeys"]').trigger('click');
    keydown('q');
    expect(useSessionStore().currentQuadrat?.samples[0]?.codes).toEqual(['Myt']);
  });

  it('Undo restores the previous keys', async () => {
    const { wrapper } = await mountTab();
    await wrapper.find('[data-test="edit-hotkeys"]').trigger('click');
    await wrapper.find('[data-test="species-Myt"]').trigger('click');
    keydown('q');
    await flush();
    await wrapper.vm.$nextTick();

    const undo = window.document.body.querySelector('[data-test="hotkey-undo"]') as HTMLElement;
    expect(undo).not.toBeNull();
    undo.click();
    await flush();
    expect(useSpeciesStore().hotkeyFor('Myt')).toBe('e');
    expect(useSpeciesStore().hotkeyFor('Ulva')).toBe('q');
  });

  it('refuses navigation and Shift keys with a reason', async () => {
    const { wrapper } = await mountTab();
    await wrapper.find('[data-test="edit-hotkeys"]').trigger('click');
    await wrapper.find('[data-test="species-Ulva"]').trigger('click');

    keydown('Enter');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="bind-message"]').text()).toMatch(/moves between points/);
    expect(useTaggingStore().cursor).toBe(0); // and it did not navigate

    keydown('!', undefined, { shiftKey: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="bind-message"]').text()).toMatch(/Shift/);

  });

  it('Escape is "done": it leaves Edit Hotkeys mode, armed or not', async () => {
    const { wrapper } = await mountTab();
    const session = useSessionStore();

    await wrapper.find('[data-test="edit-hotkeys"]').trigger('click');
    await wrapper.find('[data-test="species-Ulva"]').trigger('click');
    keydown('Escape');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="bind-hint"]').exists()).toBe(false);
    expect(wrapper.find('.species-btn--armed').exists()).toBe(false);
    expect(wrapper.find('[data-test="species-Ulva"]').text()).toBe('Ulva [q]');
    expect(wrapper.find('[data-test="edit-hotkeys"]').text()).toBe('Edit Hotkeys');

    // unarmed too
    await wrapper.find('[data-test="edit-hotkeys"]').trigger('click');
    keydown('Escape');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="bind-hint"]').exists()).toBe(false);

    // and tagging is back
    keydown('q');
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual(['Ulva']);
  });

  it('opening the species editor leaves Edit Hotkeys mode', async () => {
    const { wrapper } = await mountTab();
    await wrapper.find('[data-test="edit-hotkeys"]').trigger('click');
    await wrapper.find('[data-test="species-Ulva"]').trigger('click');
    await wrapper.find('[data-test="edit-species"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="bind-hint"]').exists()).toBe(false);
    expect(wrapper.find('.species-btn--armed').exists()).toBe(false);
    expect(wrapper.find('[data-test="edit-hotkeys"]').text()).toBe('Edit Hotkeys');
  });

  it('Escape outside Edit Hotkeys mode does nothing', async () => {
    const { wrapper } = await mountTab();
    keydown('Escape');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="edit-hotkeys"]').text()).toBe('Edit Hotkeys');
    expect(useSessionStore().currentQuadrat?.samples[0]?.codes).toEqual([]);
  });

  it('Delete clears an explicit key back to the automatic layout', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({
      speciesCsvText: 'code,species,hotkey\nUlva,Ulva sp.,9\nBarn,Barnacle,\n',
    });
    const { wrapper } = mountWithShell(SpeciesTab, platform);
    seedSession([taggedQuadrat('q1', 2)]);
    await useSpeciesStore().init(platform);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="species-Ulva"]').text()).toBe('Ulva [9]');

    await wrapper.find('[data-test="edit-hotkeys"]').trigger('click');
    await wrapper.find('[data-test="species-Ulva"]').trigger('click');
    keydown('Delete');
    await flush();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="species-Ulva"]').text()).toBe('Ulva [q]');
    expect(wrapper.find('[data-test="species-Barn"]').text()).toBe('Barn [w]');
  });

  it('offers the species editor from the empty state and below the buttons', async () => {
    const empty = mountWithShell(SpeciesTab);
    expect(empty.wrapper.find('[data-test="create-species"]').exists()).toBe(true);
    const { wrapper } = await mountTab();
    expect(wrapper.find('[data-test="edit-species"]').exists()).toBe(true);
  });
});
