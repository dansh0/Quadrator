import { GeometryError, InMemoryPlatformAdapter, QuadratV1, serializeSession } from '@quadrator/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptySession, useSessionStore } from '../src/stores/session.ts';

const NOW = new Date('2026-07-07T12:00:00.000Z');

function blankQuadrat(id: string): QuadratV1 {
  return {
    id,
    imagePath: `/img/${id}.jpg`,
    name: id,
    boundary: [],
    geoDefined: false,
    rngSeed: null,
    samples: [],
  };
}

function sessionJson(): string {
  const s = emptySession(NOW);
  s.quadrats.push({
    id: 'q1',
    imagePath: '/img/reef.jpg',
    name: 'reef',
    boundary: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    geoDefined: true,
    rngSeed: 42,
    samples: [{ index: 0, x: 10, y: 12, codes: ['Ulva'] }],
  });
  s.currentQuadratId = 'q1';
  return serializeSession(s);
}

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts empty; newSession creates an unsaved default session', () => {
    const store = useSessionStore();
    expect(store.hasSession).toBe(false);

    store.newSession(NOW);
    expect(store.hasSession).toBe(true);
    expect(store.session?.settings).toEqual({
      numOfSampleRows: 5,
      numOfSampleCols: 5,
      restrictToQuad: false,
    });
    expect(store.fileRef).toBeNull();
  });

  it('open loads and validates a session through the adapter', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueSessionOpen(sessionJson(), { id: '/data/reef.json', name: 'reef.json' });

    const store = useSessionStore();
    expect(await store.open(platform)).toBe(true);
    expect(store.quadratCount).toBe(1);
    expect(store.currentQuadrat?.name).toBe('reef');
    expect(store.fileRef?.name).toBe('reef.json');
  });

  it('open: cancel returns false; invalid file throws and never clobbers state', async () => {
    const platform = new InMemoryPlatformAdapter();
    const store = useSessionStore();
    store.newSession(NOW);

    expect(await store.open(platform)).toBe(false); // nothing queued = cancel

    platform.queueSessionOpen('{"schemaVersion": 99}');
    await expect(store.open(platform)).rejects.toThrow();
    // the previously loaded session survives a failed open
    expect(store.hasSession).toBe(true);
    expect(store.quadratCount).toBe(0);
  });

  it('save falls back to saveAs when never saved, then overwrites in place', async () => {
    const platform = new InMemoryPlatformAdapter();
    const store = useSessionStore();
    store.newSession(NOW);

    platform.queueSaveTarget({ id: '/data/out.json', name: 'out.json' });
    expect(await store.save(platform, NOW)).toBe(true);
    expect(store.fileRef?.id).toBe('/data/out.json');

    // second save overwrites without a dialog (no queued target needed)
    expect(await store.save(platform, NOW)).toBe(true);
    expect(platform.savedSessions).toHaveLength(2);
    expect(platform.savedSessions[1]?.ref.id).toBe('/data/out.json');
  });

  it('save always re-prompts when the platform cannot overwrite', async () => {
    const platform = new InMemoryPlatformAdapter({ canOverwrite: false });
    const store = useSessionStore();
    store.newSession(NOW);

    platform.queueSaveTarget({ id: 'download-1', name: 'session.json' });
    expect(await store.save(platform, NOW)).toBe(true);

    // no target queued for the second save → treated as cancel, not overwrite
    expect(await store.save(platform, NOW)).toBe(false);
    expect(platform.savedSessions).toHaveLength(1);
  });

  it('defineBoundary: 4-vertex ring uses rect sampling, deterministic per seed', () => {
    const store = useSessionStore();
    store.newSession(NOW);
    store.session!.quadrats.push(blankQuadrat('q1'));
    store.session!.currentQuadratId = 'q1';

    const ring = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    store.defineBoundary(ring, 42);

    const q = store.currentQuadrat!;
    expect(q.geoDefined).toBe(true);
    expect(q.rngSeed).toBe(42);
    expect(q.boundary).toEqual(ring);
    expect(q.boundary).not.toBe(ring); // defensive copy, not the caller's array
    expect(q.samples).toHaveLength(25); // 5×5 default settings
    expect(q.samples.map((s) => s.index)).toEqual([...Array(25).keys()]);
    expect(q.samples.every((s) => s.codes.length === 0)).toBe(true);
    expect(store.dirty).toBe(true);

    // reproducible: same ring + seed regenerates identical points
    const first = q.samples.map((s) => ({ x: s.x, y: s.y }));
    store.defineBoundary(ring, 42);
    expect(store.currentQuadrat!.samples.map((s) => ({ x: s.x, y: s.y }))).toEqual(first);
  });

  it('defineBoundary: non-quad ring uses equal-area polygon sampling', () => {
    const store = useSessionStore();
    store.newSession(NOW);
    store.session!.settings.numOfSampleRows = 2;
    store.session!.settings.numOfSampleCols = 3;
    store.session!.quadrats.push(blankQuadrat('q1'));
    store.session!.currentQuadratId = 'q1';

    store.defineBoundary(
      [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.5, y: 0.6 },
        { x: 0.1, y: 0.9 },
      ],
      7
    );

    const q = store.currentQuadrat!;
    expect(q.geoDefined).toBe(true);
    expect(q.samples).toHaveLength(6); // rows×cols, one per equal-area piece
    expect(q.samples.every((s) => s.x !== null && s.y !== null)).toBe(true);
  });

  it('defineBoundary: geometry errors propagate and leave the quadrat untouched', () => {
    const store = useSessionStore();
    store.newSession(NOW);
    store.session!.quadrats.push(blankQuadrat('q1'));
    store.session!.currentQuadratId = 'q1';
    store.dirty = false;

    // bow-tie: zero-area 4-vertex ring
    expect(() =>
      store.defineBoundary(
        [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.9 },
          { x: 0.9, y: 0.1 },
          { x: 0.1, y: 0.9 },
        ],
        42
      )
    ).toThrow(GeometryError);

    const q = store.currentQuadrat!;
    expect(q.geoDefined).toBe(false);
    expect(q.boundary).toEqual([]);
    expect(q.samples).toEqual([]);
    expect(store.dirty).toBe(false);
  });

  it('resetBoundary clears boundary, seed and samples (legacy Reset Nodes)', () => {
    const store = useSessionStore();
    store.newSession(NOW);
    store.session!.quadrats.push(blankQuadrat('q1'));
    store.session!.currentQuadratId = 'q1';
    store.defineBoundary(
      [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      42
    );

    store.resetBoundary();
    const q = store.currentQuadrat!;
    expect(q.geoDefined).toBe(false);
    expect(q.boundary).toEqual([]);
    expect(q.rngSeed).toBeNull();
    expect(q.samples).toEqual([]);
    expect(store.dirty).toBe(true);
  });

  it('saved bytes round-trip through parseSession', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueSessionOpen(sessionJson());
    platform.queueSaveTarget({ id: '/data/rt.json', name: 'rt.json' });

    const store = useSessionStore();
    await store.open(platform);
    await store.save(platform, NOW);

    expect(platform.savedSessions[0]?.text).toBe(sessionJson());
  });
});
