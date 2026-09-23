import { InMemoryPlatformAdapter } from '@quadrator/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../src/stores/session.ts';
import { taggedQuadrat, seedSession } from './helpers.ts';

describe('session store quadrat operations', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('addImages creates one quadrat per pick and selects the first', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueImagePick([
      { id: '/img/reef north.jpg', name: 'reef north.jpg' },
      { id: '/img/reef-south.png', name: 'reef-south.png' },
    ]);

    const store = useSessionStore();
    const added = await store.addImages(platform); // no session yet: creates one
    expect(added.map((q) => q.name)).toEqual(['reef north', 'reef-south']);
    expect(store.quadratCount).toBe(2);
    expect(store.currentQuadrat?.id).toBe(added[0]!.id);
    expect(store.currentQuadrat?.geoDefined).toBe(false);
    expect(store.dirty).toBe(true);
  });

  it('duplicate image paths get separate quadrats with distinct ids (audit B3)', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueImagePick([{ id: '/img/a.jpg', name: 'a.jpg' }]);
    platform.queueImagePick([{ id: '/img/a.jpg', name: 'a.jpg' }]);

    const store = useSessionStore();
    await store.addImages(platform);
    await store.addImages(platform);

    expect(store.quadratCount).toBe(2);
    const ids = store.session!.quadrats.map((q) => q.id);
    expect(new Set(ids).size).toBe(2);
    expect(store.session!.quadrats.every((q) => q.imagePath === '/img/a.jpg')).toBe(true);
  });

  it('cancelled pick adds nothing and creates no session', async () => {
    const store = useSessionStore();
    expect(await store.addImages(new InMemoryPlatformAdapter())).toEqual([]);
    expect(store.hasSession).toBe(false);
  });

  it('stepQuadrat walks display order and stops at the edges', () => {
    seedSession([taggedQuadrat('q1', 1), taggedQuadrat('q2', 1), taggedQuadrat('q3', 1)]);
    const store = useSessionStore();

    expect(store.hasPrevQuadrat).toBe(false);
    expect(store.stepQuadrat(-1)).toBe(false);
    expect(store.stepQuadrat(1)).toBe(true);
    expect(store.currentQuadrat?.id).toBe('q2');
    expect(store.stepQuadrat(1)).toBe(true);
    expect(store.stepQuadrat(1)).toBe(false); // at last
    expect(store.currentQuadrat?.id).toBe('q3');
  });

  it('renameCurrentQuadrat updates the model and marks the session dirty', () => {
    seedSession([taggedQuadrat('q1', 1)]);
    const store = useSessionStore();
    store.dirty = false;

    store.renameCurrentQuadrat('Transect 4, plot B');
    expect(store.currentQuadrat?.name).toBe('Transect 4, plot B');
    expect(store.dirty).toBe(true);
  });
});
