// @vitest-environment happy-dom
import { InMemoryPlatformAdapter } from '@quadrator/core';
import { describe, expect, it } from 'vitest';
import SpeciesTab from '../src/components/tabs/SpeciesTab.vue';
import { useSessionStore } from '../src/stores/session.ts';
import { useSpeciesStore } from '../src/stores/species.ts';
import { useTaggingStore } from '../src/stores/tagging.ts';
import { SPECIES_CSV, mountWithShell, seedSession, taggedQuadrat } from './helpers.ts';

async function mountTab(nSamples = 4) {
  const platform = new InMemoryPlatformAdapter();
  await platform.saveSettings({ hotkeysEnabled: true, speciesCsvText: SPECIES_CSV });
  const shell = mountWithShell(SpeciesTab, platform);
  seedSession([taggedQuadrat('q1', nSamples)]);
  await useSpeciesStore().init(platform);
  await shell.wrapper.vm.$nextTick();
  return shell;
}

function keydown(key: string, target?: EventTarget): void {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true });
  if (target) Object.defineProperty(event, 'target', { value: target });
  window.dispatchEvent(event);
}

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
