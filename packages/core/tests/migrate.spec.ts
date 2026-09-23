import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { migrateV0, migrateV1, parseSession, serializeSession } from '../src/serialization/migrate.ts';
import { sessionV0Schema } from '../src/serialization/v0.ts';
import { sessionV1Schema } from '../src/serialization/v1.ts';
import { SessionV2, sessionV2Schema } from '../src/serialization/v2.ts';

// cwd-relative: vitest runs from the repo root
const fixtures = [
  'session-v0.json',
  'session-v0-polygon.json',
  'session-v0-multi-image.json',
].map((name) => [name, readFileSync(`tests/fixtures/${name}`, 'utf8')] as const);

/**
 * Real sessions in the formats the app has written. v0 fixtures only prove
 * the first migration hop; these pin each later reader against a file on
 * disk, so a future schema version can never quietly stop loading saves
 * users already have.
 */
const v1Fixture = readFileSync('tests/fixtures/session-v1-multi-image.json', 'utf8');
const v2Fixture = readFileSync('tests/fixtures/session-v2-multi-image.json', 'utf8');

function v0Of(json: string) {
  return sessionV0Schema.parse(JSON.parse(json));
}

describe('v0 fixtures (real sessions)', () => {
  it.each(fixtures)('%s validates against the v0 schema', (_name, json) => {
    expect(() => v0Of(json)).not.toThrow();
  });

  it.each(fixtures)('%s migrates to a valid v1 session', (_name, json) => {
    const v1 = migrateV0(v0Of(json));
    expect(() => sessionV1Schema.parse(v1)).not.toThrow();
    expect(v1.schemaVersion).toBe(1);

    const v0 = v0Of(json);
    expect(v1.quadrats).toHaveLength(v0.runningData.length);

    // unique stable ids, display order preserved
    expect(new Set(v1.quadrats.map((q) => q.id)).size).toBe(v1.quadrats.length);

    for (let i = 0; i < v1.quadrats.length; i++) {
      const q = v1.quadrats[i]!;
      const rd = v0.runningData[i]!;
      expect(q.imagePath).toBe(rd.quadratData.imgSrc);
      expect(q.rngSeed).toBeNull();

      // boundary became an OPEN ring (v0 rings repeat the first vertex)
      if (q.boundary.length > 0) {
        expect(q.boundary.length).toBe(rd.inputStatus.nodes.length - 1);
        expect(q.boundary[0]).not.toEqual(q.boundary[q.boundary.length - 1]);
      }

      // samples: positional index, tags preserved
      expect(q.samples).toHaveLength(rd.quadratData.samples.length);
      q.samples.forEach((s, idx) => expect(s.index).toBe(idx));
      expect(q.samples.flatMap((s) => s.codes)).toEqual(
        rd.quadratData.samples.flatMap((s) => s.codes)
      );
    }

    // currentQuadratId resolves to the quadrat showing currentImgSrc
    const current = v1.quadrats.find((q) => q.id === v1.currentQuadratId);
    expect(current?.imagePath).toBe(v0.currentImgSrc);
  });

  it.each(fixtures)('%s reaches a valid v2 session through the full chain', (_name, json) => {
    const v2 = parseSession(json);
    expect(() => sessionV2Schema.parse(v2)).not.toThrow();
    expect(v2.schemaVersion).toBe(2);
    // savedAt is stamped at migration time, so compare everything else.
    expect(new Date(v2.savedAt).toISOString()).toBe(v2.savedAt);
    const expected = migrateV1(migrateV0(v0Of(json)));
    expect({ ...v2, savedAt: '' }).toEqual({ ...expected, savedAt: '' });
  });

  it('migrates the multi-image session to two quadrats with distinct ids', () => {
    const v2 = parseSession(fixtures[2]![1]);
    expect(v2.quadrats.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(v2.quadrats[0]!.imagePath).not.toBe(v2.quadrats[1]!.imagePath);
  });

  it('preserves boundaries from oldest saves that lack the geoDefined flag', () => {
    // session-v0.json has a real 5-node closed ring but no geoDefined key
    const v1 = migrateV0(v0Of(fixtures[0]![1]));
    const q = v1.quadrats[0]!;
    expect(q.geoDefined).toBe(true);
    expect(q.boundary).toHaveLength(4);
    expect(q.name).toBe('B3_1Y_T1');
    expect(v1.settings).toEqual({ numOfSampleRows: 5, numOfSampleCols: 5, restrictToQuad: false });
  });
});

describe('v1 fixture (a real save from the previous format)', () => {
  it('is a valid v1 file that parseSession upgrades to v2', () => {
    expect(() => sessionV1Schema.parse(JSON.parse(v1Fixture))).not.toThrow();
    const v2 = parseSession(v1Fixture);
    expect(v2.schemaVersion).toBe(2);
    expect(v2).toEqual(migrateV1(sessionV1Schema.parse(JSON.parse(v1Fixture))));
  });

  it('keeps every quadrat, boundary kind and tagged sample through the upgrade', () => {
    const v2 = parseSession(v1Fixture);
    expect(v2.quadrats.map((q) => q.boundary.length)).toEqual([4, 7]);
    expect(v2.quadrats.every((q) => q.geoDefined)).toBe(true);
    expect(v2.quadrats.flatMap((q) => q.samples)).toHaveLength(50);
    expect(v2.quadrats.flatMap((q) => q.samples).filter((s) => s.codes.length > 0)).toHaveLength(8);
    expect(v2.currentQuadratId).toBe('q2');
  });

  it('gives each quadrat the mode it was actually drawn with', () => {
    const v2 = parseSession(v1Fixture);
    // 4-vertex ring was a quad; the 7-vertex one an n-poly. v1 had no other
    // sampling mode, and no way to draw a square.
    expect(v2.quadrats.map((q) => q.shape)).toEqual(['quad', 'n-poly']);
    expect(v2.quadrats.every((q) => q.sampling === 'stratified-random')).toBe(true);
    expect(v2.quadrats.every((q) => q.gridOrigin === 'center')).toBe(true);
  });

  it('agrees exactly with migrating the v0 session it came from', () => {
    const fromV0 = migrateV0(v0Of(fixtures[2]![1]), new Date('2026-07-09T12:00:00.000Z'));
    expect(parseSession(v1Fixture)).toEqual(migrateV1(fromV0));
  });
});

describe('v2 fixture (the format the app writes today)', () => {
  it('loads without migration and is already v2', () => {
    const v2 = parseSession(v2Fixture);
    expect(sessionV2Schema.parse(v2)).toEqual(v2);
    expect(v2.schemaVersion).toBe(2);
  });

  it('round-trips byte-identically (stable key order, no data drift)', () => {
    expect(serializeSession(parseSession(v2Fixture))).toBe(v2Fixture.trimEnd());
  });

  it('is exactly what upgrading the v1 fixture produces', () => {
    expect(parseSession(v2Fixture)).toEqual(parseSession(v1Fixture));
  });
});

describe('migrateV1', () => {
  const v1 = (settings: object, quadrats: object[] = []) =>
    sessionV1Schema.parse({
      schemaVersion: 1,
      savedAt: '2026-07-09T12:00:00.000Z',
      settings: { numOfSampleRows: 5, numOfSampleCols: 5, restrictToQuad: false, ...settings },
      quadrats,
      currentQuadratId: null,
    });

  const q1 = (boundary: { x: number; y: number }[]) => ({
    id: 'q1',
    imagePath: '/a.jpg',
    name: 'a',
    boundary,
    geoDefined: boundary.length >= 3,
    rngSeed: null,
    samples: [],
  });

  const ring = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ x: Math.cos(i), y: Math.sin(i) }));

  it('restrictToQuad true → shape quad, false → shape n-poly', () => {
    expect(migrateV1(v1({ restrictToQuad: true })).settings.shape).toBe('quad');
    expect(migrateV1(v1({ restrictToQuad: false })).settings.shape).toBe('n-poly');
  });

  it('always records stratified-random sampling and a center grid origin', () => {
    const v2 = migrateV1(v1({}, [q1(ring(4))]));
    expect(v2.settings.sampling).toBe('stratified-random');
    expect(v2.settings.gridOrigin).toBe('center');
    expect(v2.quadrats[0]!.sampling).toBe('stratified-random');
    expect(v2.quadrats[0]!.gridOrigin).toBe('center');
  });

  it("reads each quadrat's shape off its ring, never claiming square", () => {
    const v2 = migrateV1(v1({}, [q1(ring(4)), { ...q1(ring(6)), id: 'q2' }]));
    expect(v2.quadrats.map((q) => q.shape)).toEqual(['quad', 'n-poly']);
  });

  it('an undrawn quadrat inherits the session default shape', () => {
    expect(migrateV1(v1({ restrictToQuad: true }, [q1([])])).quadrats[0]!.shape).toBe('quad');
    expect(migrateV1(v1({ restrictToQuad: false }, [q1([])])).quadrats[0]!.shape).toBe('n-poly');
  });

  it('carries savedAt, rows/cols, ids, order and currentQuadratId through unchanged', () => {
    const source = v1({ numOfSampleRows: 3, numOfSampleCols: 7 }, [q1(ring(4))]);
    source.currentQuadratId = 'q1';
    const v2 = migrateV1(source);
    expect(v2.savedAt).toBe('2026-07-09T12:00:00.000Z');
    expect(v2.settings.numOfSampleRows).toBe(3);
    expect(v2.settings.numOfSampleCols).toBe(7);
    expect(v2.currentQuadratId).toBe('q1');
    expect(v2.quadrats.map((q) => q.id)).toEqual(['q1']);
  });
});

describe('migrateV0 edge cases', () => {
  const minimalV0 = (overrides: object = {}) => ({
    imgPathList: ['/a.jpg'],
    runningData: [
      {
        inputStatus: { sampleNumber: 0, nodes: [] },
        quadratData: {
          numOfSamples: 25,
          imgSrc: '/a.jpg',
          samples: [{ codes: [] }],
        },
      },
    ],
    currentImgSrc: '/a.jpg',
    ...overrides,
  });

  it('missing name falls back to the image base name (either path separator)', () => {
    const v0 = sessionV0Schema.parse(minimalV0());
    expect(migrateV0(v0).quadrats[0]!.name).toBe('a');

    const win = minimalV0();
    win.runningData[0]!.quadratData.imgSrc = 'C:\\photos\\reef shot.png';
    expect(migrateV0(sessionV0Schema.parse(win)).quadrats[0]!.name).toBe('reef shot');
  });

  it('name fallback handles extensionless names and dotfiles', () => {
    const noExt = minimalV0();
    noExt.runningData[0]!.quadratData.imgSrc = '/photos/IMG_0042';
    expect(migrateV0(sessionV0Schema.parse(noExt)).quadrats[0]!.name).toBe('IMG_0042');

    // leading dot is not an extension separator
    const dotfile = minimalV0();
    dotfile.runningData[0]!.quadratData.imgSrc = '/photos/.hidden';
    expect(migrateV0(sessionV0Schema.parse(dotfile)).quadrats[0]!.name).toBe('.hidden');
  });

  it('missing sample coordinates become null', () => {
    const v0 = sessionV0Schema.parse(minimalV0());
    const s = migrateV0(v0).quadrats[0]!.samples[0]!;
    expect(s).toEqual({ index: 0, x: null, y: null, codes: [] });
  });

  it('no boundary → geoDefined false, empty boundary', () => {
    const v0 = sessionV0Schema.parse(minimalV0());
    const q = migrateV0(v0).quadrats[0]!;
    expect(q.geoDefined).toBe(false);
    expect(q.boundary).toEqual([]);
  });

  it('non-25 sample count maps to n×1 settings (rows/cols were never stored — audit B8)', () => {
    const v0raw = minimalV0();
    v0raw.runningData[0]!.quadratData.numOfSamples = 10;
    const v1 = migrateV0(sessionV0Schema.parse(v0raw));
    expect(v1.settings).toEqual({ numOfSampleRows: 10, numOfSampleCols: 1, restrictToQuad: false });
  });

  it('currentImgSrc not matching any quadrat → currentQuadratId null', () => {
    const v0 = sessionV0Schema.parse(minimalV0({ currentImgSrc: '/other.jpg' }));
    expect(migrateV0(v0).currentQuadratId).toBeNull();
  });
});

describe('v2 round-trip', () => {
  it.each(fixtures)('%s: parse(serialize(x)) deep-equals x', (_name, json) => {
    const v2 = parseSession(json);
    const roundTripped = parseSession(serializeSession(v2));
    expect(roundTripped).toEqual(v2);
  });

  it('serialization is stable (same input ⇒ identical bytes, stable key order)', () => {
    const v2 = parseSession(fixtures[1]![1]);
    const a = serializeSession(v2);
    const b = serializeSession(parseSession(a));
    expect(a).toBe(b);
    expect(a.startsWith('{\n  "schemaVersion": 2,\n  "savedAt":')).toBe(true);
  });
});

describe('hostile input', () => {
  const validV2: SessionV2 = {
    schemaVersion: 2,
    savedAt: new Date().toISOString(),
    settings: {
      numOfSampleRows: 5,
      numOfSampleCols: 5,
      sampling: 'stratified-random',
      shape: 'n-poly',
      gridOrigin: 'center',
    },
    quadrats: [],
    currentQuadratId: null,
  };

  it('invalid JSON → SyntaxError', () => {
    expect(() => parseSession('not json')).toThrow(SyntaxError);
    expect(() => parseSession(serializeSession(validV2).slice(0, 40))).toThrow(SyntaxError);
  });

  it('wrong shapes → ZodError, never a partial session', () => {
    expect(() => parseSession('{}')).toThrow(ZodError);
    expect(() => parseSession('{"imgPathList": "nope", "runningData": [], "currentImgSrc": ""}')).toThrow(ZodError);
    expect(() =>
      parseSession(
        '{"imgPathList": [], "runningData": [{"inputStatus": {"nodes": "bad"}, "quadratData": {"numOfSamples": 1, "imgSrc": "", "samples": []}}], "currentImgSrc": ""}'
      )
    ).toThrow(ZodError);
  });

  it('unsupported schemaVersion → ZodError', () => {
    expect(() => parseSession('{"schemaVersion": 3}')).toThrow(ZodError);
    expect(() => parseSession('{"schemaVersion": "2"}')).toThrow(ZodError);
  });

  it('a truncated v1 body is rejected rather than half-migrated', () => {
    expect(() => parseSession('{"schemaVersion": 1}')).toThrow(ZodError);
  });

  it('v2 with unknown keys is rejected (strict schema)', () => {
    const withExtra = { ...validV2, sneaky: true };
    expect(() => parseSession(JSON.stringify(withExtra))).toThrow(ZodError);
  });

  it('an unknown sampling mode or shape is rejected, not silently defaulted', () => {
    const badMode = { ...validV2, settings: { ...validV2.settings, sampling: 'systematic' } };
    expect(() => parseSession(JSON.stringify(badMode))).toThrow(ZodError);
    const badShape = { ...validV2, settings: { ...validV2.settings, shape: 'hexagon' } };
    expect(() => parseSession(JSON.stringify(badShape))).toThrow(ZodError);
  });

  it('valid minimal v2 parses unchanged', () => {
    expect(parseSession(JSON.stringify(validV2))).toEqual(validV2);
  });
});
