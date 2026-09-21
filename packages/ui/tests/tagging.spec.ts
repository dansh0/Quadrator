import { InMemoryPlatformAdapter } from '@quadrator/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../src/stores/session.ts';
import { useTaggingStore } from '../src/stores/tagging.ts';
import { seedSession, taggedQuadrat } from './helpers.ts';

describe('tagging store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('cursor navigation is bounded by the current quadrat samples', () => {
    seedSession([taggedQuadrat('q1', 3)]);
    const tagging = useTaggingStore();

    expect(tagging.sampleCount).toBe(3);
    expect(tagging.atFirst).toBe(true);
    tagging.prevSample();
    expect(tagging.cursor).toBe(0);
    tagging.nextSample();
    tagging.nextSample();
    expect(tagging.cursor).toBe(2);
    expect(tagging.atLast).toBe(true);
    tagging.nextSample();
    expect(tagging.cursor).toBe(2);
  });

  it('toggleCode adds then removes a code on the current sample and dirties the session', () => {
    seedSession([taggedQuadrat('q1', 2)]);
    const session = useSessionStore();
    const tagging = useTaggingStore();
    session.dirty = false;

    tagging.toggleCode('Ulva');
    tagging.toggleCode('Barn');
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual(['Ulva', 'Barn']);
    expect(session.dirty).toBe(true);

    tagging.toggleCode('Ulva');
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual(['Barn']);

    tagging.nextSample();
    tagging.toggleCode('Myt');
    expect(session.currentQuadrat?.samples[1]?.codes).toEqual(['Myt']);
    expect(session.currentQuadrat?.samples[0]?.codes).toEqual(['Barn']); // untouched
  });

  it('without samples: toggling is a no-op, counts are zero', () => {
    const tagging = useTaggingStore();
    expect(tagging.sampleCount).toBe(0);
    expect(tagging.currentSample).toBeNull();
    tagging.toggleCode('Ulva'); // must not throw
    expect(tagging.selectedCodes).toEqual([]);
  });

  it('setCursor clamps into range (quadrat switches, QA row clicks)', () => {
    seedSession([taggedQuadrat('q1', 5)]);
    const tagging = useTaggingStore();

    tagging.setCursor(3);
    expect(tagging.cursor).toBe(3);
    tagging.setCursor(99);
    expect(tagging.cursor).toBe(4);
    tagging.setCursor(-1);
    expect(tagging.cursor).toBe(0);
  });
});

describe('cursor source', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seedSession([taggedQuadrat('q1', 5)]);
  });

  it('starts as navigation', () => {
    expect(useTaggingStore().cursorSource).toBe('navigation');
  });

  it('marks a canvas click as such, so the view is not yanked around', () => {
    const tagging = useTaggingStore();
    tagging.selectSampleOnCanvas(3);
    expect(tagging.cursorSource).toBe('canvas');
    expect(tagging.cursor).toBe(3);
  });

  it.each([
    ['nextSample', (t: ReturnType<typeof useTaggingStore>) => t.nextSample()],
    ['prevSample', (t: ReturnType<typeof useTaggingStore>) => t.prevSample()],
    ['setCursor', (t: ReturnType<typeof useTaggingStore>) => t.setCursor(4)],
  ])('%s counts as navigation', (_name, move) => {
    const tagging = useTaggingStore();
    tagging.setCursor(2);
    tagging.selectSampleOnCanvas(2);
    expect(tagging.cursorSource).toBe('canvas');

    move(tagging);
    expect(tagging.cursorSource).toBe('navigation');
  });

  it('leaves the source alone when navigation is already at the edge', () => {
    const tagging = useTaggingStore();
    tagging.selectSampleOnCanvas(0);
    tagging.prevSample(); // no-op at the first sample
    expect(tagging.cursor).toBe(0);
    expect(tagging.cursorSource).toBe('canvas');
  });
});

describe('view-motion preference', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('defaults to instant — a cut is the safest thing for someone who has not chosen', () => {
    expect(useTaggingStore().recentreMotion).toBe('instant');
  });

  it('restores the persisted preference at startup', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ recentreMotion: 'off' });
    await useTaggingStore().init(platform);
    expect(useTaggingStore().recentreMotion).toBe('off');
  });

  it('falls back to the default when the document has no preference yet', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ hotkeysEnabled: false });
    await useTaggingStore().init(platform);
    expect(useTaggingStore().recentreMotion).toBe('instant');
  });

  it('still honours a persisted value, though no control writes one today', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ recentreMotion: 'smooth' });
    await useTaggingStore().init(platform);
    expect(useTaggingStore().recentreMotion).toBe('smooth');
  });

  it('persists a change without clobbering what other stores own', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ hotkeysEnabled: false, speciesCsvText: 'code,species\n' });

    await useTaggingStore().setRecentreMotion(platform, 'instant');

    const saved = (await platform.loadSettings()) as Record<string, unknown>;
    expect(saved['recentreMotion']).toBe('instant');
    expect(saved['hotkeysEnabled']).toBe(false);
    expect(saved['speciesCsvText']).toBe('code,species\n');
  });

  it('applies the change immediately, not just on the next launch', async () => {
    const platform = new InMemoryPlatformAdapter();
    await useTaggingStore().setRecentreMotion(platform, 'off');
    expect(useTaggingStore().recentreMotion).toBe('off');
  });
});
