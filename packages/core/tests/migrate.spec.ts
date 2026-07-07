import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { migrateV0, parseSession, serializeSession } from '../src/serialization/migrate.ts';
import { sessionV0Schema } from '../src/serialization/v0.ts';
import { SessionV1, sessionV1Schema } from '../src/serialization/v1.ts';

// cwd-relative: vitest runs from the repo root
const fixtures = [
  'session-v0.json',
  'session-v0-polygon.json',
  'session-v0-multi-image.json',
].map((name) => [name, readFileSync(`tests/fixtures/${name}`, 'utf8')] as const);

function v0Of(json: string) {
  return sessionV0Schema.parse(JSON.parse(json));
}

describe('v0 fixtures (real sessions)', () => {
  it.each(fixtures)('%s validates against the v0 schema', (_name, json) => {
    expect(() => v0Of(json)).not.toThrow();
  });

  it.each(fixtures)('%s migrates to a valid v1 session', (_name, json) => {
    const v1 = parseSession(json);
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

  it('migrates the multi-image session to two quadrats with distinct ids', () => {
    const v1 = parseSession(fixtures[2]![1]);
    expect(v1.quadrats.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(v1.quadrats[0]!.imagePath).not.toBe(v1.quadrats[1]!.imagePath);
  });

  it('preserves boundaries from oldest saves that lack the geoDefined flag', () => {
    // session-v0.json has a real 5-node closed ring but no geoDefined key
    const v1 = parseSession(fixtures[0]![1]);
    const q = v1.quadrats[0]!;
    expect(q.geoDefined).toBe(true);
    expect(q.boundary).toHaveLength(4);
    expect(q.name).toBe('B3_1Y_T1');
    expect(v1.settings).toEqual({ numOfSampleRows: 5, numOfSampleCols: 5, restrictToQuad: false });
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

describe('v1 round-trip', () => {
  it.each(fixtures)('%s: parse(serialize(x)) deep-equals x', (_name, json) => {
    const v1 = parseSession(json);
    const roundTripped = parseSession(serializeSession(v1));
    expect(roundTripped).toEqual(v1);
  });

  it('serialization is stable (same input ⇒ identical bytes, stable key order)', () => {
    const v1 = parseSession(fixtures[1]![1]);
    const a = serializeSession(v1);
    const b = serializeSession(parseSession(a));
    expect(a).toBe(b);
    expect(a.startsWith('{\n  "schemaVersion": 1,\n  "savedAt":')).toBe(true);
  });
});

describe('hostile input', () => {
  const validV1: SessionV1 = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    settings: { numOfSampleRows: 5, numOfSampleCols: 5, restrictToQuad: false },
    quadrats: [],
    currentQuadratId: null,
  };

  it('invalid JSON → SyntaxError', () => {
    expect(() => parseSession('not json')).toThrow(SyntaxError);
    expect(() => parseSession(serializeSession(validV1).slice(0, 40))).toThrow(SyntaxError);
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
    expect(() => parseSession('{"schemaVersion": 2}')).toThrow(ZodError);
    expect(() => parseSession('{"schemaVersion": "1"}')).toThrow(ZodError);
  });

  it('v1 with unknown keys is rejected (strict schema)', () => {
    const withExtra = { ...validV1, sneaky: true };
    expect(() => parseSession(JSON.stringify(withExtra))).toThrow(ZodError);
  });

  it('valid minimal v1 parses unchanged', () => {
    expect(parseSession(JSON.stringify(validV1))).toEqual(validV1);
  });
});
