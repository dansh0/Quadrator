import { describe, expect, it } from 'vitest';
import { GeometryError, isPointInside } from '../src/geometry/polygon.ts';
import { sampleRect } from '../src/sampling/rect.ts';
import { mulberry32 } from '../src/sampling/rng.ts';
import { clickedSquare, unitSquare } from './helpers.ts';

describe('sampleRect', () => {
  it('axis-aligned unit square yields 25 valid points (legacy yielded ZERO — audit B11)', () => {
    const points = sampleRect(unitSquare, 5, 5, mulberry32(42));
    expect(points).toHaveLength(25);
    for (const p of points) {
      expect(isPointInside(unitSquare, p)).toBe(true);
    }
  });

  it('each point lands in its own stratum (index = row * cols + col)', () => {
    const rows = 4;
    const cols = 6;
    const points = sampleRect(unitSquare, rows, cols, mulberry32(7));
    expect(points).toHaveLength(rows * cols);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const p = points[row * cols + col]!;
        // unit square is axis-aligned, so strata are simple grid cells
        expect(p.x).toBeGreaterThanOrEqual(col / cols);
        expect(p.x).toBeLessThanOrEqual((col + 1) / cols);
        expect(p.y).toBeGreaterThanOrEqual(row / rows);
        expect(p.y).toBeLessThanOrEqual((row + 1) / rows);
      }
    }
  });

  it('all points fall inside a skewed click-defined quadrat', () => {
    const points = sampleRect(clickedSquare, 5, 5, mulberry32(3));
    expect(points).toHaveLength(25);
    for (const p of points) {
      expect(isPointInside(clickedSquare, p)).toBe(true);
    }
  });

  it('same seed ⇒ identical output; different seed ⇒ different output', () => {
    const a = sampleRect(clickedSquare, 5, 5, mulberry32(99));
    const b = sampleRect(clickedSquare, 5, 5, mulberry32(99));
    const c = sampleRect(clickedSquare, 5, 5, mulberry32(100));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('supports rows ≠ cols (legacy indexing was broken for this)', () => {
    const points = sampleRect(clickedSquare, 2, 7, mulberry32(1));
    expect(points).toHaveLength(14);
    for (const p of points) {
      expect(isPointInside(clickedSquare, p)).toBe(true);
    }
  });

  it('rejects invalid input with GeometryError', () => {
    const rng = mulberry32(1);
    expect(() => sampleRect(unitSquare.slice(0, 3), 5, 5, rng)).toThrow(GeometryError);
    expect(() => sampleRect([...unitSquare, { x: 0, y: 0 }], 5, 5, rng)).toThrow(GeometryError);
    expect(() => sampleRect(unitSquare, 0, 5, rng)).toThrow(GeometryError);
    expect(() => sampleRect(unitSquare, 5, -1, rng)).toThrow(GeometryError);
    expect(() => sampleRect(unitSquare, 2.5, 5, rng)).toThrow(GeometryError);
    const degenerate = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(() => sampleRect(degenerate, 5, 5, rng)).toThrow(GeometryError);
  });
});
