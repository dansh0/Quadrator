// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import RightPanel from '../src/components/RightPanel.vue';
import { useSessionStore } from '../src/stores/session.ts';
import { useTaggingStore } from '../src/stores/tagging.ts';
import { mountWithShell, seedSession, stubVisualViewport, taggedQuadrat } from './helpers.ts';

describe('RightPanel tab gating', () => {
  it('Species ID and Data Review are disabled until the boundary is defined', async () => {
    const shell = mountWithShell(RightPanel);
    const q = taggedQuadrat('q1', 0);
    q.geoDefined = false;
    q.boundary = [];
    seedSession([q]);
    await shell.wrapper.vm.$nextTick();

    expect(shell.wrapper.find('[data-test="tab-species"]').attributes('disabled')).toBeDefined();
    expect(shell.wrapper.find('[data-test="tab-qa"]').attributes('disabled')).toBeDefined();
  });

  it('tabs unlock once geoDefined, and snap back to prep when it goes away', async () => {
    const shell = mountWithShell(RightPanel);
    seedSession([taggedQuadrat('q1', 2)]);
    await shell.wrapper.vm.$nextTick();

    const speciesTab = shell.wrapper.find('[data-test="tab-species"]');
    expect(speciesTab.attributes('disabled')).toBeUndefined();

    await speciesTab.trigger('click');
    expect(shell.wrapper.find('[data-test="sample-position"]').exists()).toBe(true);

    // boundary disappears (e.g. reset nodes) → back to Image Prep, tabs re-lock
    useSessionStore().currentQuadrat!.geoDefined = false;
    await shell.wrapper.vm.$nextTick();
    await shell.wrapper.vm.$nextTick();
    expect(shell.wrapper.find('[data-test="sample-position"]').exists()).toBe(false);
    expect(shell.wrapper.find('[data-test="quadrat-name"]').exists()).toBe(true);
  });
});

const press = (key: string, mods: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));

describe('RightPanel keyboard', () => {
  beforeAll(stubVisualViewport);
  enableAutoUnmount(afterEach);

  it('Alt+Left/Right switch tabs, skipping none and stopping at the ends', async () => {
    const shell = mountWithShell(RightPanel);
    seedSession([taggedQuadrat('q1', 2)]);
    const tagging = useTaggingStore();
    await shell.wrapper.vm.$nextTick();

    press('ArrowRight', { altKey: true });
    expect(tagging.activeTab).toBe('species');
    press('ArrowRight', { altKey: true });
    expect(tagging.activeTab).toBe('qa');
    press('ArrowRight', { altKey: true });
    expect(tagging.activeTab).toBe('qa');
    press('ArrowLeft', { altKey: true });
    press('ArrowLeft', { altKey: true });
    press('ArrowLeft', { altKey: true });
    expect(tagging.activeTab).toBe('prep');
  });

  it('Alt+Right cannot reach locked tabs', async () => {
    const shell = mountWithShell(RightPanel);
    const q = taggedQuadrat('q1', 0);
    q.geoDefined = false;
    seedSession([q]);
    await shell.wrapper.vm.$nextTick();

    press('ArrowRight', { altKey: true });
    expect(useTaggingStore().activeTab).toBe('prep');
  });

  it('on Species ID, plain arrows step the sample and Alt+arrows only change tab', async () => {
    const shell = mountWithShell(RightPanel);
    seedSession([taggedQuadrat('q1', 3)]);
    const tagging = useTaggingStore();
    tagging.activeTab = 'species';
    await shell.wrapper.vm.$nextTick();

    press('ArrowRight');
    expect(tagging.cursor).toBe(1);
    expect(tagging.activeTab).toBe('species');

    press('ArrowLeft', { altKey: true });
    expect(tagging.activeTab).toBe('prep');
    expect(tagging.cursor).toBe(1);
  });

  it('a clicked tab gives focus back, so arrow keys cannot move the tab highlight', async () => {
    const shell = mountWithShell(RightPanel, undefined, {}, { attachTo: document.body });
    seedSession([taggedQuadrat('q1', 2)]);
    await shell.wrapper.vm.$nextTick();

    const tab = shell.wrapper.find('[data-test="tab-species"]');
    (tab.element as HTMLElement).focus();
    expect(document.activeElement).toBe(tab.element);
    await tab.trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).not.toBe(tab.element);
  });
});
