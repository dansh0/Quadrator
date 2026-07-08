/**
 * Property-based tests (DESIGN.md §5 item 2). Random inputs, invariant
 * assertions — these hunt for edge cases the example-based suites miss.
 *
 * Polygon generation: vertices are placed at sorted distinct angles around a
 * center with per-vertex radii. Such star-shaped polygons are always simple,
 * so every generated ring is valid splitByArea input by construction.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GeometryError,
  Ring,
  area,
  isPointInside,
  isSimple,
  splitByArea,
} from '../src/geometry/polygon.ts';
import { midpoint } from '../src/geometry/vec2.ts';
import { samplePolygon } from '../src/sampling/poly.ts';
import { mulberry32 } from '../src/sampling/rng.ts';
import { parseSession, serializeSession } from '../src/serialization/migrate.ts';
import { SessionV1 } from '../src/serialization/v1.ts';
import { expectClose } from './helpers.ts';

// ---------------------------------------------------------------- geometry

/**
 * For some (concave ring, target) pairs NO single straight cut can carve off
 * the target area — splitByArea then throws, loudly and by design (pinned
 * counterexample in split.spec.ts). Those cases pass vacuously here: the
 * properties below assert accuracy whenever a cut IS found.
 */
function passIfNoValidCut(e: unknown): true {
  if (e instanceof GeometryError && e.message.includes('no valid cut')) return true;
  throw e;
}

const arbRing: fc.Arbitrary<Ring> = fc
  .record({
    vertices: fc.uniqueArray(
      fc.tuple(
        fc.integer({ min: 0, max: 359 }), // angle (degrees)
        fc.double({ min: 5, max: 100, noNaN: true }) // radius
      ),
      { selector: (t) => t[0], minLength: 3, maxLength: 12 }
    ),
    center: fc.tuple(
      fc.double({ min: -500, max: 500, noNaN: true }),
      fc.double({ min: -500, max: 500, noNaN: true })
    ),
  })
  .map(({ vertices, center }) =>
    [...vertices]
      .sort((a, b) => a[0] - b[0])
      .map(([deg, r]) => ({
        x: center[0] + r * Math.cos((deg * Math.PI) / 180),
        y: center[1] + r * Math.sin((deg * Math.PI) / 180),
      }))
  )
  // Discard near-degenerate slivers. isSimple rejects (loudly, by design)
  // mathematically-simple rings whose edges pass within GEOM_EPS of each
  // other, so the properties below assert over rings core accepts as valid.
  .filter((ring) => area(ring) > 1 && isSimple(ring));

describe('splitByArea properties', () => {
  it('piece ≈ target, piece + rest ≈ total, cut midpoint inside — any star polygon', () => {
    fc.assert(
      fc.property(
        arbRing,
        fc.double({ min: 0.05, max: 0.95, noNaN: true }),
        (ring, frac) => {
          const total = area(ring);
          const target = total * frac;
          try {
            const { piece, rest, cutLine } = splitByArea(ring, target);

            expectClose(area(piece), target, 1e-4);
            expectClose(area(piece) + area(rest), total, 1e-6);
            expect(isPointInside(ring, midpoint(cutLine[0], cutLine[1]))).toBe(true);
          } catch (e) {
            return passIfNoValidCut(e);
          }
          return true;
        }
      )
    );
  });
});

describe('samplePolygon properties', () => {
  it('n equal-area pieces, every point inside its piece and the ring — any star polygon and seed', () => {
    fc.assert(
      fc.property(
        arbRing,
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (ring, n, seed) => {
          const total = area(ring);
          try {
            const { points, cutLines, pieces } = samplePolygon(ring, n, mulberry32(seed));

            expect(points).toHaveLength(n);
            expect(cutLines).toHaveLength(n - 1);
            let sum = 0;
            for (let i = 0; i < n; i++) {
              expectClose(area(pieces[i]!), total / n, 1e-4);
              sum += area(pieces[i]!);
              expect(isPointInside(pieces[i]!, points[i]!)).toBe(true);
              expect(isPointInside(ring, points[i]!)).toBe(true);
            }
            expectClose(sum, total, 1e-6);
          } catch (e) {
            return passIfNoValidCut(e);
          }
          return true;
        }
      ),
      { numRuns: 50 } // each run does up to 11 sequential splits
    );
  });
});

// ----------------------------------------------------------- serialization

/**
 * Finite doubles with -0 normalized to 0 (JSON.stringify(-0) emits "0", so
 * -0 cannot survive any JSON format; it is not meaningful session data).
 */
const arbCoord = fc
  .double({ noNaN: true, noDefaultInfinity: true })
  .map((v) => (v === 0 ? 0 : v));

const arbSample = fc.record({
  index: fc.nat(),
  x: fc.option(arbCoord, { nil: null }),
  y: fc.option(arbCoord, { nil: null }),
  codes: fc.array(fc.string(), { maxLength: 5 }),
});

const arbQuadrat = fc.record({
  id: fc.string({ minLength: 1 }),
  imagePath: fc.string(),
  name: fc.string(),
  boundary: fc.array(fc.record({ x: arbCoord, y: arbCoord }), { maxLength: 8 }),
  geoDefined: fc.boolean(),
  rngSeed: fc.option(fc.integer({ min: 0, max: 0xffffffff }), { nil: null }),
  samples: fc.array(arbSample, { maxLength: 6 }),
});

const arbSession: fc.Arbitrary<SessionV1> = fc.record({
  schemaVersion: fc.constant(1 as const),
  savedAt: fc
    .date({ min: new Date('1990-01-01'), max: new Date('2100-01-01'), noInvalidDate: true })
    .map((d) => d.toISOString()),
  settings: fc.record({
    numOfSampleRows: fc.integer({ min: 1, max: 1000 }),
    numOfSampleCols: fc.integer({ min: 1, max: 1000 }),
    restrictToQuad: fc.boolean(),
  }),
  quadrats: fc.array(arbQuadrat, { maxLength: 5 }),
  currentQuadratId: fc.option(fc.string({ minLength: 1 }), { nil: null }),
});

describe('session serialization properties', () => {
  it('parse ∘ serialize = identity for any valid v1 session', () => {
    fc.assert(
      fc.property(arbSession, (session) => {
        expect(parseSession(serializeSession(session))).toEqual(session);
      }),
      { numRuns: 200 }
    );
  });

  it('serialization is deterministic: same session ⇒ identical bytes', () => {
    fc.assert(
      fc.property(arbSession, (session) => {
        const a = serializeSession(session);
        const b = serializeSession(parseSession(a));
        expect(b).toBe(a);
      })
    );
  });
});
