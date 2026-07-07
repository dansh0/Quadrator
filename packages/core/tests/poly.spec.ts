import { describe, expect, it } from 'vitest';
import { GeometryError, area, isPointInside } from '../src/geometry/polygon.ts';
import { samplePolygon } from '../src/sampling/poly.ts';
import { mulberry32 } from '../src/sampling/rng.ts';
import { bowtie, clickedSquare, expectClose, lShape, pentagon, unitSquare } from './helpers.ts';

describe('samplePolygon', () => {
  const cases = [
    ['axis-aligned unit square (vertical edges — legacy bug case)', unitSquare],
    ['click-defined quadrat', clickedSquare],
    ['pentagon', pentagon],
    ['concave L-shape', lShape],
  ] as const;

  it.each(cases)('%s: equal-area pieces, one point strictly inside each', (_name, ring) => {
    const n = 9;
    const total = area(ring);
    const { points, cutLines, pieces } = samplePolygon(ring, n, mulberry32(42));

    expect(points).toHaveLength(n);
    expect(pieces).toHaveLength(n);
    expect(cutLines).toHaveLength(n - 1);

    let sum = 0;
    for (let i = 0; i < n; i++) {
      expectClose(area(pieces[i]!), total / n, 1e-4);
      sum += area(pieces[i]!);
      // point inside its own piece AND inside the original ring
      expect(isPointInside(pieces[i]!, points[i]!)).toBe(true);
      expect(isPointInside(ring, points[i]!)).toBe(true);
    }
    expectClose(sum, total, 1e-6);
  });

  it('same seed ⇒ identical result; different seed ⇒ different points', () => {
    const a = samplePolygon(pentagon, 6, mulberry32(7));
    const b = samplePolygon(pentagon, 6, mulberry32(7));
    const c = samplePolygon(pentagon, 6, mulberry32(8));
    expect(a).toEqual(b);
    expect(a.points).not.toEqual(c.points);
    // cuts are seed-independent (splitting is deterministic geometry)
    expect(a.cutLines).toEqual(c.cutLines);
  });

  it('numOfSamples = 1: no cuts, single piece is the ring itself', () => {
    const { points, cutLines, pieces } = samplePolygon(pentagon, 1, mulberry32(1));
    expect(cutLines).toHaveLength(0);
    expect(pieces).toEqual([pentagon]);
    expect(points).toHaveLength(1);
    expect(isPointInside(pentagon, points[0]!)).toBe(true);
  });

  it('works at real quadrat sample counts (25)', () => {
    const { points, pieces } = samplePolygon(clickedSquare, 25, mulberry32(123));
    expect(points).toHaveLength(25);
    const total = area(clickedSquare);
    for (const piece of pieces) {
      expectClose(area(piece), total / 25, 1e-3);
    }
  });

  it('rejects invalid input with GeometryError (legacy alert()-ed and half-completed — audit B9)', () => {
    expect(() => samplePolygon(pentagon, 0, mulberry32(1))).toThrow(GeometryError);
    expect(() => samplePolygon(pentagon, 2.5, mulberry32(1))).toThrow(GeometryError);
    expect(() => samplePolygon(bowtie, 4, mulberry32(1))).toThrow(GeometryError);
    expect(() => samplePolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }], 3, mulberry32(1))).toThrow(
      GeometryError
    );
    const zeroArea = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(() => samplePolygon(zeroArea, 3, mulberry32(1))).toThrow(GeometryError);
    expect(() => samplePolygon(zeroArea, 1, mulberry32(1))).toThrow(GeometryError);
  });
});
