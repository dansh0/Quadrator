// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import RightPanel from '../src/components/RightPanel.vue';
import { useSessionStore } from '../src/stores/session.ts';
import { mountWithShell, seedSession, taggedQuadrat } from './helpers.ts';

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
