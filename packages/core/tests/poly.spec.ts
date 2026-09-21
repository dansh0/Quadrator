import { describe, expect, it } from 'vitest';
import { GeometryError, area, isPointInside } from '../src/geometry/polygon.ts';
import { samplePolygon, samplePolygonCentres, splitEqualArea } from '../src/sampling/poly.ts';
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

  it('rejection-sampling cap: a stuck Rng throws GeometryError instead of looping forever', () => {
    // Constant rng pins every candidate at bbox corner (0.99, 0.99), outside
    // this triangle (x + y > 1), so all MAX_REJECTION_TRIES attempts miss.
    const triangle = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const stuckRng = () => 0.99;
    expect(() => samplePolygon(triangle, 1, stuckRng)).toThrow(GeometryError);
    expect(() => samplePolygon(triangle, 1, stuckRng)).toThrow(/tries/);
  });
});

describe('samplePolygonCentres', () => {
  const cases = [
    ['unit square', unitSquare],
    ['click-defined quadrat', clickedSquare],
    ['pentagon', pentagon],
    ['concave L-shape', lShape],
  ] as const;

  it.each(cases)('%s: one point per piece, each inside its own piece', (_name, ring) => {
    const { points, pieces } = samplePolygonCentres(ring, 9);
    expect(points).toHaveLength(9);
    expect(pieces).toHaveLength(9);
    points.forEach((p, i) => {
      expect(isPointInside(pieces[i]!, p)).toBe(true);
    });
  });

  it('needs no seed and never varies', () => {
    const a = samplePolygonCentres(pentagon, 12);
    const b = samplePolygonCentres(pentagon, 12);
    expect(a.points).toEqual(b.points);
  });

  it('places points more evenly than the random mode does', () => {
    // Centres sit at the middle of each equal-area piece, so consecutive
    // points are spaced regularly; random placement within the same pieces
    // scatters. Compare the spread of nearest-neighbour distances.
    const spread = (pts: { x: number; y: number }[]) => {
      const d = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
      const mean = d.reduce((n, v) => n + v, 0) / d.length;
      return Math.sqrt(d.reduce((n, v) => n + (v - mean) ** 2, 0) / d.length);
    };
    const centres = samplePolygonCentres(unitSquare, 16).points;
    const random = samplePolygon(unitSquare, 16, mulberry32(4)).points;
    expect(spread(centres)).toBeLessThan(spread(random));
  });

  it('shares the partition with samplePolygon, so the drawn cuts match', () => {
    const centres = samplePolygonCentres(pentagon, 7);
    const random = samplePolygon(pentagon, 7, mulberry32(1));
    expect(centres.cutLines).toEqual(random.cutLines);
    expect(centres.pieces).toEqual(random.pieces);
  });

  it('n = 1 puts a single point inside the whole quadrat, with no cuts', () => {
    const { points, cutLines } = samplePolygonCentres(pentagon, 1);
    expect(cutLines).toEqual([]);
    expect(isPointInside(pentagon, points[0]!)).toBe(true);
  });

  it('rejects degenerate rings and bad counts', () => {
    expect(() => samplePolygonCentres(pentagon, 0)).toThrow(GeometryError);
    expect(() => samplePolygonCentres(pentagon, 2.5)).toThrow(GeometryError);
    expect(() =>
      samplePolygonCentres(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
        1
      )
    ).toThrow(GeometryError);
  });
});

describe('splitEqualArea', () => {
  it('produces n pieces and n-1 cuts whose areas sum to the whole', () => {
    const { pieces, cutLines } = splitEqualArea(pentagon, 5);
    expect(pieces).toHaveLength(5);
    expect(cutLines).toHaveLength(4);
    const total = pieces.reduce((n, piece) => n + area(piece), 0);
    expectClose(total, area(pentagon), 1e-6);
  });

  it('pieces are equal-area within tolerance', () => {
    const { pieces } = splitEqualArea(clickedSquare, 4);
    const target = area(clickedSquare) / 4;
    for (const piece of pieces) {
      expectClose(area(piece), target, 1e-6);
    }
  });
});
