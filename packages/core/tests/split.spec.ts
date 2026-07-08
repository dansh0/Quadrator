import { describe, expect, it } from 'vitest';
import {
  GeometryError,
  Ring,
  area,
  isPointInside,
  splitByArea,
} from '../src/geometry/polygon.ts';
import { midpoint } from '../src/geometry/vec2.ts';
import { bowtie, clickedSquare, expectClose, lShape, pentagon, unitSquare } from './helpers.ts';

/**
 * Invariant checks per Phase1CoreExtraction.md §4: the port is validated by
 * area/containment invariants, NOT by matching the legacy library's output
 * (the legacy math was broken; see polygon.ts header).
 */
function checkSplit(ring: Ring, target: number, relTol = 1e-6): void {
  const total = area(ring);
  const { piece, rest, cutLine } = splitByArea(ring, target);

  expect(piece.length).toBeGreaterThanOrEqual(3);
  expect(rest.length).toBeGreaterThanOrEqual(3);

  // piece has the target area; pieces sum to the whole
  expectClose(area(piece), target, relTol);
  expectClose(area(piece) + area(rest), total, relTol);

  // the cut's midpoint lies inside the original ring
  expect(isPointInside(ring, midpoint(cutLine[0], cutLine[1]))).toBe(true);
}

const shapes: Array<[string, Ring]> = [
  ['axis-aligned unit square', unitSquare],
  ['click-defined quadrat', clickedSquare],
  ['pentagon', pentagon],
  ['concave L-shape', lShape],
];

describe('splitByArea', () => {
  for (const [name, ring] of shapes) {
    describe(name, () => {
      it.each([0.5, 0.25, 0.1, 0.7])('cuts fraction %f of the area', (frac) => {
        checkSplit(ring, area(ring) * frac);
      });
    });
  }

  it('accepts either ring orientation', () => {
    checkSplit([...pentagon].reverse(), area(pentagon) / 3);
  });

  it('handles rings with perfectly vertical edges (legacy isPointInside bug)', () => {
    checkSplit(unitSquare, 0.35);
    checkSplit(lShape, 5);
  });

  it('sequential splitting yields n equal-area pieces (samplePolygon pattern)', () => {
    for (const [, ring] of shapes) {
      const total = area(ring);
      const n = 7;
      const per = total / n;
      const pieces: Ring[] = [];
      let remaining: Ring = ring;
      for (let k = 0; k < n - 1; k++) {
        const { piece, rest } = splitByArea(remaining, per);
        pieces.push(piece);
        remaining = rest;
      }
      pieces.push(remaining);

      expect(pieces).toHaveLength(n);
      let sum = 0;
      for (const p of pieces) {
        expectClose(area(p), per, 1e-4);
        sum += area(p);
      }
      expectClose(sum, total, 1e-6);
    }
  });

  describe('degenerate input → GeometryError (legacy half-completed silently, audit B9)', () => {
    it('fewer than 3 distinct vertices', () => {
      expect(() => splitByArea([], 1)).toThrow(GeometryError);
      expect(() => splitByArea([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1)).toThrow(GeometryError);
      expect(() =>
        splitByArea(
          [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          1
        )
      ).toThrow(GeometryError);
    });

    it('zero-area ring', () => {
      expect(() =>
        splitByArea(
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
          0.5
        )
      ).toThrow(GeometryError);
    });

    it('self-intersecting ring', () => {
      expect(() => splitByArea(bowtie, 1)).toThrow(GeometryError);
    });

    it('targetArea out of range', () => {
      expect(() => splitByArea(unitSquare, 0)).toThrow(GeometryError);
      expect(() => splitByArea(unitSquare, -0.5)).toThrow(GeometryError);
      expect(() => splitByArea(unitSquare, 1)).toThrow(GeometryError);
      expect(() => splitByArea(unitSquare, 2)).toThrow(GeometryError);
      expect(() => splitByArea(unitSquare, NaN)).toThrow(GeometryError);
    });
  });

  it('stays accurate when the best cut lands beside a tiny edge (quadratic cancellation regression)', () => {
    // fast-check counterexample: concave ring with two near-duplicate
    // vertices (~0.09 apart). The direct root form (a − √d)/(2·tgA) in
    // findCutLine lost ~1.6% of the piece area to cancellation here.
    const ring: Ring = [
      { x: 5, y: 0 },
      { x: 34.95604110685928, y: 37.48576470933246 },
      { x: 0.6958655048003284, y: 4.951340343707852 },
      { x: 0.6093467170257374, y: 4.96273075820661 },
      { x: -40.245669186776944, y: -18.766863749366735 },
    ];
    checkSplit(ring, area(ring) / 2);
  });

  it('rejects model-misplaced cuts by measuring candidate areas (regression)', () => {
    // fast-check counterexample: sequential 5-way split of this ring chose a
    // shortest cut whose decomposition model was off by 1.7% before candidate
    // areas were validated by measurement.
    const ring: Ring = [
      { x: 5, y: 0 },
      { x: 4.999238475781956, y: 0.08726203218641757 },
      { x: 49.82057592187315, y: 1.7397728477138492 },
      { x: 4.095760221444959, y: 2.8678821817552302 },
      { x: -52.74989048360577, y: -24.59767789934284 },
    ];
    const total = area(ring);
    let remaining: Ring = ring;
    for (let k = 0; k < 4; k++) {
      const { piece, rest } = splitByArea(remaining, total / 5);
      expectClose(area(piece), total / 5, 1e-6);
      remaining = rest;
    }
    expectClose(area(remaining), total / 5, 1e-6);
  });

  it('throws (never mis-cuts) when no single straight cut can hit the target (regression)', () => {
    // fast-check counterexample: for some concave rings and targets NO
    // straight cut with both endpoints on the boundary carves off the target
    // area as one simple piece — a mathematical limitation of single-cut
    // partitioning, not a numerical bug. The legacy library silently returned
    // a wrong partition here (audit B9); core must fail loudly instead. The
    // UI catches this and rejects the drawn boundary, leaving the quadrat
    // untouched.
    const ring: Ring = [
      { x: 10.639957869023881, y: 0 },
      { x: 4.8907380036690284, y: 1.0395584540887965 },
      { x: 24.584705878340472, y: 6.1296556171336345 },
      { x: 9.189193506198801, y: 10.205633309171539 },
      { x: 4.418356939959577, y: 5.082738235555193 },
      { x: -42.32003412817867, y: 26.444492298455625 },
      { x: -6.723320139212043, y: 1.3068810470918863 },
      { x: -14.581031684134084, y: 1.5325281845455154 },
      { x: -29.717981701597495, y: -17.85636488147158 },
      { x: -9.715762387726759, y: -11.57879473036506 },
      { x: 9.690933599828817, y: -36.167056567337454 },
      { x: 2.113091308703498, y: -4.531538935183249 },
    ];
    const target = area(ring) * 0.747823572393465;
    expect(() => splitByArea(ring, target)).toThrow(GeometryError);
    expect(() => splitByArea(ring, target)).toThrow('no valid cut');
  });

  it('closed rings (duplicate last vertex) are tolerated', () => {
    const closed = [...unitSquare, { x: 0, y: 0 }];
    checkSplit(closed, 0.5);
  });
});
