// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import QaTab from '../src/components/tabs/QaTab.vue';
import { useTaggingStore } from '../src/stores/tagging.ts';
import { mountWithShell, seedSession, taggedQuadrat } from './helpers.ts';

describe('QaTab', () => {
  it('lists one row per sample with its tagged codes', async () => {
    const shell = mountWithShell(QaTab);
    const q = taggedQuadrat('q1', 3);
    q.samples[0]!.codes.push('Ulva', 'Barn');
    q.samples[2]!.codes.push('Myt');
    seedSession([q]);
    await shell.wrapper.vm.$nextTick();

    expect(shell.wrapper.find('[data-test="qa-row-1"]').text()).toContain('Ulva, Barn');
    expect(shell.wrapper.find('[data-test="qa-row-2"]').text()).toContain('2');
    expect(shell.wrapper.find('[data-test="qa-row-3"]').text()).toContain('Myt');
  });

  it('clicking a row moves the tagging cursor to that point', async () => {
    const shell = mountWithShell(QaTab);
    seedSession([taggedQuadrat('q1', 5)]);
    await shell.wrapper.vm.$nextTick();

    await shell.wrapper.find('[data-test="qa-row-4"]').trigger('click');
    expect(useTaggingStore().cursor).toBe(3);
  });

  it('shows the empty state when the quadrat has no samples yet', () => {
    const shell = mountWithShell(QaTab);
    expect(shell.wrapper.find('[data-test="qa-empty"]').exists()).toBe(true);
  });
});
