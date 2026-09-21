import { describe, expect, it } from 'vitest';
import { GeometryError, isPointInside } from '../src/geometry/polygon.ts';
import { mulberry32 } from '../src/sampling/rng.ts';
import { sampleUniform } from '../src/sampling/uniform.ts';
import { clickedSquare, lShape, pentagon, unitSquare } from './helpers.ts';

describe('sampleUniform', () => {
  it.each([
    ['unit square', unitSquare],
    ['clicked quadrilateral', clickedSquare],
    ['convex pentagon', pentagon],
    ['concave L-shape', lShape],
  ])('every point lands strictly inside the %s', (_name, ring) => {
    const points = sampleUniform(ring, 40, mulberry32(11));
    expect(points).toHaveLength(40);
    for (const p of points) {
      expect(isPointInside(ring, p)).toBe(true);
    }
  });

  it('is deterministic: same seed ⇒ identical points', () => {
    expect(sampleUniform(pentagon, 25, mulberry32(5))).toEqual(
      sampleUniform(pentagon, 25, mulberry32(5))
    );
  });

  it('different seeds give different layouts', () => {
    expect(sampleUniform(pentagon, 25, mulberry32(5))).not.toEqual(
      sampleUniform(pentagon, 25, mulberry32(6))
    );
  });

  it('is unstratified: points are NOT one per grid cell', () => {
    // 25 points over a 5×5 lattice: stratified sampling fills every cell,
    // uniform sampling essentially never does. That difference is the mode.
    const points = sampleUniform(unitSquare, 25, mulberry32(3));
    const cells = new Set(
      points.map((p) => `${Math.floor(p.x * 5)},${Math.floor(p.y * 5)}`)
    );
    expect(cells.size).toBeLessThan(25);
  });

  it('covers the whole quadrat, not a corner of it', () => {
    const points = sampleUniform(unitSquare, 300, mulberry32(9));
    const meanX = points.reduce((n, p) => n + p.x, 0) / points.length;
    const meanY = points.reduce((n, p) => n + p.y, 0) / points.length;
    expect(meanX).toBeGreaterThan(0.4);
    expect(meanX).toBeLessThan(0.6);
    expect(meanY).toBeGreaterThan(0.4);
    expect(meanY).toBeLessThan(0.6);
  });

  it('rejects bad counts, short rings and zero area', () => {
    expect(() => sampleUniform(unitSquare, 0, mulberry32(1))).toThrow(GeometryError);
    expect(() => sampleUniform(unitSquare, 2.5, mulberry32(1))).toThrow(GeometryError);
    expect(() => sampleUniform(unitSquare.slice(0, 2), 4, mulberry32(1))).toThrow(GeometryError);
    const degenerate = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    expect(() => sampleUniform(degenerate, 4, mulberry32(1))).toThrow(GeometryError);
  });

  it('gives up loudly rather than looping forever when rejection cannot succeed', () => {
    // Area ~5e-13 inside a 1×1 bbox: no draw will ever land inside, so the
    // try limit must surface as a typed error instead of a hang or a point
    // that is silently outside the quadrat.
    const sliver = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 1 + 1e-12 },
    ];
    expect(() => sampleUniform(sliver, 1, mulberry32(1))).toThrow(GeometryError);
    expect(() => sampleUniform(sliver, 1, mulberry32(1))).toThrow(/after 1000 tries/);
  });
});
