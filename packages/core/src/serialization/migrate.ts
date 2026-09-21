/**
 * Session parsing with automatic v0 → v1 → v2 migration. Every older format
 * is upgraded through the chain, so each hop stays small and independently
 * tested; `parseSession` always returns the current version.
 *
 * v1 → v2 rules:
 * - `restrictToQuad` becomes an explicit `shape`: true → 'quad', false →
 *   'n-poly' (what the v1 app actually did with the flag clear);
 * - sampling was always stratified-random in v1, so that is what every
 *   migrated session and quadrat records; `gridOrigin` gets the 'center'
 *   default and is inert until a regular-grid boundary is drawn;
 * - a quadrat's own `shape` is recovered from its boundary — a 4-vertex ring
 *   was drawn as a quad, anything else as an n-poly. `square` never existed
 *   in v1, so no migrated quadrat claims it. Quadrats with no boundary yet
 *   inherit the session default.
 *
 * v0 → v1 rules (Phase1CoreExtraction.md §7):
 * - settings: v0 never stored rows/cols (audit B8); best-effort from the
 *   first quadrat's numOfSamples — 25 → 5×5 (the app default), otherwise
 *   n×1. restrictToQuad defaults to false (the app default).
 * - each runningData entry becomes a quadrat with a fresh stable id
 *   ('q1', 'q2', …) — duplicate image paths each keep their own quadrat
 *   (fixes audit B3 going forward);
 * - boundary: v0 CLOSED ring → OPEN ring (duplicate last vertex stripped);
 *   when v0 lacks the geoDefined flag (oldest saves) it is inferred from the
 *   presence of a usable ring, so real boundaries survive migration;
 * - samples: index from array position (v0 sampleNumber ignored — it was
 *   inconsistent for rows ≠ cols), missing x/y → null;
 * - rngSeed: null (the legacy app used bare Math.random, seed unknowable);
 * - currentQuadratId: first quadrat whose imagePath === v0 currentImgSrc;
 * - v0 `edgesNodes` and `polygons` (derived data / class debris) are dropped.
 */
import { z } from 'zod';
import { SessionV0, sessionV0Schema } from './v0.ts';
import { QuadratV1, SessionV1, sessionV1Schema } from './v1.ts';
import { QuadratV2, SessionV2, sessionV2Schema } from './v2.ts';

const CLOSED_RING_EPS = 1e-12;

/** Strip the repeated last vertex of a closed ring; drop degenerate "rings". */
function toOpenRing(nodes: ReadonlyArray<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const ring = nodes.map((n) => ({ x: n.x, y: n.y }));
  while (ring.length > 1) {
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (Math.abs(first.x - last.x) <= CLOSED_RING_EPS && Math.abs(first.y - last.y) <= CLOSED_RING_EPS) {
      ring.pop();
    } else {
      break;
    }
  }
  return ring.length >= 3 ? ring : [];
}

/** Last path component without extension, tolerating / and \ separators. */
function imageBaseName(imagePath: string): string {
  const base = imagePath.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

export function migrateV0(v0: SessionV0, now: Date = new Date()): SessionV1 {
  const firstSamples = v0.runningData[0]?.quadratData.numOfSamples;
  const settings =
    firstSamples === undefined || firstSamples === 25
      ? { numOfSampleRows: 5, numOfSampleCols: 5, restrictToQuad: false }
      : { numOfSampleRows: Math.max(1, Math.round(firstSamples)), numOfSampleCols: 1, restrictToQuad: false };

  const quadrats: QuadratV1[] = v0.runningData.map((rd, i) => {
    const boundary = toOpenRing(rd.inputStatus.nodes);
    return {
      id: `q${i + 1}`,
      imagePath: rd.quadratData.imgSrc,
      name: rd.quadratData.name ?? imageBaseName(rd.quadratData.imgSrc),
      boundary,
      geoDefined: rd.quadratData.geoDefined ?? boundary.length >= 3,
      rngSeed: null,
      samples: rd.quadratData.samples.map((s, index) => ({
        index,
        x: s.x ?? null,
        y: s.y ?? null,
        codes: [...s.codes],
      })),
    };
  });

  const current = quadrats.find((q) => q.imagePath === v0.currentImgSrc);

  // Validate the migration's own output so a bug here can never emit an
  // invalid v1 session.
  return sessionV1Schema.parse({
    schemaVersion: 1,
    savedAt: now.toISOString(),
    settings,
    quadrats,
    currentQuadratId: current?.id ?? null,
  });
}

/**
 * Upgrade a validated v1 session to v2. Pure and total: v1 cannot express
 * anything v2 lacks, so nothing is dropped and nothing can fail.
 */
export function migrateV1(v1: SessionV1): SessionV2 {
  const shape = v1.settings.restrictToQuad ? 'quad' : 'n-poly';

  const quadrats: QuadratV2[] = v1.quadrats.map((q) => ({
    id: q.id,
    imagePath: q.imagePath,
    name: q.name,
    boundary: q.boundary.map((v) => ({ x: v.x, y: v.y })),
    geoDefined: q.geoDefined,
    rngSeed: q.rngSeed,
    // v1 had exactly one sampling mode; the shape is readable off the ring.
    sampling: 'stratified-random',
    shape: q.boundary.length === 4 ? 'quad' : q.boundary.length === 0 ? shape : 'n-poly',
    gridOrigin: 'center',
    samples: q.samples.map((smp) => ({
      index: smp.index,
      x: smp.x,
      y: smp.y,
      codes: [...smp.codes],
    })),
  }));

  // Validate the migration's own output so a bug here can never emit an
  // invalid v2 session.
  return sessionV2Schema.parse({
    schemaVersion: 2,
    savedAt: v1.savedAt,
    settings: {
      numOfSampleRows: v1.settings.numOfSampleRows,
      numOfSampleCols: v1.settings.numOfSampleCols,
      sampling: 'stratified-random',
      shape,
      gridOrigin: 'center',
    },
    quadrats,
    currentQuadratId: v1.currentQuadratId,
  });
}

/**
 * Parse session JSON of any supported version into a validated SessionV2.
 * Older files are migrated automatically (v0 files have no schemaVersion
 * key at all). Throws SyntaxError for invalid JSON, ZodError for shape
 * violations, and never returns a partially-applied session.
 */
export function parseSession(json: string): SessionV2 {
  const data: unknown = JSON.parse(json);

  if (typeof data === 'object' && data !== null && 'schemaVersion' in data) {
    const version = (data as { schemaVersion: unknown }).schemaVersion;
    if (version === 2) {
      return sessionV2Schema.parse(data);
    }
    if (version === 1) {
      return migrateV1(sessionV1Schema.parse(data));
    }
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['schemaVersion'],
        message: `unsupported schemaVersion: ${String(version)}`,
      },
    ]);
  }

  return migrateV1(migrateV0(sessionV0Schema.parse(data)));
}

/** Serialize with stable key order and 2-space indent (diff-friendly saves). */
export function serializeSession(s: SessionV2): string {
  const ordered = {
    schemaVersion: s.schemaVersion,
    savedAt: s.savedAt,
    settings: {
      numOfSampleRows: s.settings.numOfSampleRows,
      numOfSampleCols: s.settings.numOfSampleCols,
      sampling: s.settings.sampling,
      shape: s.settings.shape,
      gridOrigin: s.settings.gridOrigin,
    },
    quadrats: s.quadrats.map((q) => ({
      id: q.id,
      imagePath: q.imagePath,
      name: q.name,
      boundary: q.boundary.map((v) => ({ x: v.x, y: v.y })),
      geoDefined: q.geoDefined,
      rngSeed: q.rngSeed,
      sampling: q.sampling,
      shape: q.shape,
      gridOrigin: q.gridOrigin,
      samples: q.samples.map((smp) => ({
        index: smp.index,
        x: smp.x,
        y: smp.y,
        codes: [...smp.codes],
      })),
    })),
    currentQuadratId: s.currentQuadratId,
  };
  return JSON.stringify(ordered, null, 2);
}
