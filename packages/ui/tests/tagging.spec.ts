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
