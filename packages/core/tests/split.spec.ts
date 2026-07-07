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

  it('closed rings (duplicate last vertex) are tolerated', () => {
    const closed = [...unitSquare, { x: 0, y: 0 }];
    checkSplit(closed, 0.5);
  });
});
