import { GeometryError, InMemoryPlatformAdapter, QuadratV2, serializeSession } from '@quadrator/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptySession, useSessionStore } from '../src/stores/session.ts';

const NOW = new Date('2026-07-07T12:00:00.000Z');

function blankQuadrat(id: string): QuadratV2 {
  return {
    id,
    imagePath: `/img/${id}.jpg`,
    name: id,
    boundary: [],
    geoDefined: false,
    rngSeed: null,
    sampling: 'stratified-random',
    shape: 'n-poly',
    gridOrigin: 'center',
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
    sampling: 'stratified-random',
    shape: 'quad',
    gridOrigin: 'center',
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
      sampling: 'stratified-random',
      shape: 'n-poly',
      gridOrigin: 'center',
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

  it('autosave snapshots the session into settings without touching other keys', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ hotkeysEnabled: false, speciesCsvText: 'code\nUlva' });

    const store = useSessionStore();
    store.newSession(NOW);
    await store.autosave(platform); // empty session: must NOT write a snapshot
    expect(await store.hasAutosaved(platform)).toBe(false);

    store.session!.quadrats.push(blankQuadrat('q1'));
    await store.autosave(platform);
    expect(await store.hasAutosaved(platform)).toBe(true);
    const settings = (await platform.loadSettings()) as Record<string, unknown>;
    expect(settings['hotkeysEnabled']).toBe(false); // other keys survive
    expect(settings['speciesCsvText']).toBe('code\nUlva');
  });

  it('restoreAutosaved round-trips the snapshot as an unsaved dirty session', async () => {
    const platform = new InMemoryPlatformAdapter();
    const store = useSessionStore();
    store.newSession(NOW);
    store.session!.quadrats.push(blankQuadrat('q1'));
    store.session!.currentQuadratId = 'q1';
    await store.autosave(platform);

    // simulate a fresh launch
    setActivePinia(createPinia());
    const fresh = useSessionStore();
    expect(await fresh.restoreAutosaved(platform)).toBe(true);
    expect(fresh.currentQuadrat?.id).toBe('q1');
    expect(fresh.fileRef).toBeNull();
    expect(fresh.dirty).toBe(true);
  });

  it('restoreAutosaved: none = false; corrupt snapshot throws, state untouched', async () => {
    const platform = new InMemoryPlatformAdapter();
    const store = useSessionStore();
    expect(await store.restoreAutosaved(platform)).toBe(false);

    await platform.saveSettings({ lastSessionText: '{"schemaVersion": 99}' });
    store.newSession(NOW);
    await expect(store.restoreAutosaved(platform)).rejects.toThrow();
    expect(store.hasSession).toBe(true); // previous session survives

    await store.clearAutosaved(platform);
    expect(await store.hasAutosaved(platform)).toBe(false);
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

describe('sampling settings', () => {
  const RING = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ];
  const POLY = [
    { x: 0.5, y: 0.05 },
    { x: 0.95, y: 0.4 },
    { x: 0.78, y: 0.95 },
    { x: 0.22, y: 0.95 },
    { x: 0.05, y: 0.4 },
  ];

  function storeWithQuadrat() {
    const store = useSessionStore();
    store.newSession(NOW);
    store.session!.quadrats.push(blankQuadrat('q1'));
    store.session!.currentQuadratId = 'q1';
    store.setGridSize(2, 2);
    return store;
  }

  it('setters change the session defaults and mark the session dirty', () => {
    const store = storeWithQuadrat();
    store.dirty = false;

    store.setSampling('regular-grid');
    store.setShape('square');
    store.setGridOrigin('bottom-left');
    store.setGridSize(3, 4);

    expect(store.session!.settings).toEqual({
      numOfSampleRows: 3,
      numOfSampleCols: 4,
      sampling: 'regular-grid',
      shape: 'square',
      gridOrigin: 'bottom-left',
    });
    expect(store.dirty).toBe(true);
  });

  it('setGridSize refuses values that are not positive integers', () => {
    const store = storeWithQuadrat();
    store.setGridSize(0, 5);
    store.setGridSize(5, -1);
    store.setGridSize(2.5, 5);
    expect(store.session!.settings.numOfSampleRows).toBe(2);
    expect(store.session!.settings.numOfSampleCols).toBe(2);
  });

  it('regular-grid on a quad places points at the chosen cell corner', () => {
    const store = storeWithQuadrat();
    store.setSampling('regular-grid');
    store.setGridOrigin('top-left');
    store.defineBoundary(RING, 1);

    // 2×2 over x,y 0.1–0.9: top-left corners are the cell origins
    expect(store.currentQuadrat!.samples.map((s) => ({ x: s.x, y: s.y }))).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.1, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it("the 'fill' origin samples the quadrat corners and keeps the point count", () => {
    const store = storeWithQuadrat();
    store.setGridSize(3, 3);
    store.setSampling('regular-grid');
    store.setGridOrigin('fill');
    store.defineBoundary(RING, 1);

    const points = store.currentQuadrat!.samples.map((s) => ({ x: s.x, y: s.y }));
    expect(points).toHaveLength(9);
    // RING spans 0.1–0.9 on both axes, so fill hits its corners and mid-edges
    expect(points).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.1, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.5 },
      { x: 0.1, y: 0.9 },
      { x: 0.5, y: 0.9 },
      { x: 0.9, y: 0.9 },
    ]);
    expect(store.currentQuadrat!.gridOrigin).toBe('fill');
  });

  it('regular-grid needs no seed: different seeds give the same layout', () => {
    const store = storeWithQuadrat();
    store.setSampling('regular-grid');

    store.defineBoundary(RING, 1);
    const first = store.currentQuadrat!.samples.map((s) => ({ x: s.x, y: s.y }));
    store.defineBoundary(RING, 99999);
    expect(store.currentQuadrat!.samples.map((s) => ({ x: s.x, y: s.y }))).toEqual(first);
  });

  it('regular-grid on a polygon uses piece centres and ignores the corner origin', () => {
    const store = storeWithQuadrat();
    store.setSampling('regular-grid');
    store.setGridOrigin('bottom-right');
    store.defineBoundary(POLY, 1);
    const withCorner = store.currentQuadrat!.samples.map((s) => ({ x: s.x, y: s.y }));

    store.setGridOrigin('center');
    store.defineBoundary(POLY, 1);
    expect(store.currentQuadrat!.samples.map((s) => ({ x: s.x, y: s.y }))).toEqual(withCorner);
  });

  it('random sampling is seeded, and unlike stratified does not fill every cell', () => {
    const store = storeWithQuadrat();
    store.setGridSize(5, 5);
    store.setSampling('random');
    store.defineBoundary(RING, 3);
    const points = store.currentQuadrat!.samples.map((s) => ({ x: s.x!, y: s.y! }));
    expect(points).toHaveLength(25);

    store.defineBoundary(RING, 3);
    expect(store.currentQuadrat!.samples.map((s) => ({ x: s.x!, y: s.y! }))).toEqual(points);

    const cells = new Set(
      points.map((p) => `${Math.floor((p.x - 0.1) * 5 / 0.8)},${Math.floor((p.y - 0.1) * 5 / 0.8)}`)
    );
    expect(cells.size).toBeLessThan(25);
  });

  it('records the mode each quadrat was actually defined with', () => {
    const store = useSessionStore();
    store.newSession(NOW);
    store.session!.quadrats.push(blankQuadrat('q1'), blankQuadrat('q2'));
    store.setGridSize(2, 2);

    store.session!.currentQuadratId = 'q1';
    store.setSampling('regular-grid');
    store.setShape('square');
    store.setGridOrigin('top-right');
    store.defineBoundary(RING, 1);

    store.session!.currentQuadratId = 'q2';
    store.setSampling('random');
    store.setShape('n-poly');
    store.defineBoundary(POLY, 2);

    const [q1, q2] = store.session!.quadrats;
    expect(q1).toMatchObject({
      sampling: 'regular-grid',
      shape: 'square',
      gridOrigin: 'top-right',
    });
    expect(q2).toMatchObject({ sampling: 'random', shape: 'n-poly' });
  });

  it('a later settings change never rewrites a quadrat that is already defined', () => {
    const store = storeWithQuadrat();
    store.defineBoundary(RING, 1);
    const before = store.currentQuadrat!.samples.map((s) => ({ x: s.x, y: s.y }));

    store.setSampling('random');
    store.setShape('square');
    store.setGridSize(9, 9);

    expect(store.currentQuadrat!.sampling).toBe('stratified-random');
    expect(store.currentQuadrat!.samples.map((s) => ({ x: s.x, y: s.y }))).toEqual(before);
  });

  it('records a center origin for polygons, which have no cell corners', () => {
    const store = storeWithQuadrat();
    store.setSampling('regular-grid');
    store.setGridOrigin('bottom-left');
    store.defineBoundary(POLY, 1);
    expect(store.currentQuadrat!.gridOrigin).toBe('center');
  });

  it('a newly added quadrat starts on the current defaults', async () => {
    const store = storeWithQuadrat();
    store.setSampling('regular-grid');
    store.setShape('square');
    store.setGridOrigin('bottom-left');

    const platform = new InMemoryPlatformAdapter();
    platform.queueImagePick([{ id: '/img/new.jpg', name: 'new.jpg' }]);
    const [added] = await store.addImages(platform, NOW);

    expect(added).toMatchObject({
      sampling: 'regular-grid',
      shape: 'square',
      gridOrigin: 'bottom-left',
      geoDefined: false,
    });
  });
});
