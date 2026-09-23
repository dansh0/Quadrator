import { Ring } from '../src/geometry/polygon.ts';
import { Vec2 } from '../src/geometry/vec2.ts';

/** Perfectly axis-aligned unit square, OPEN ring. Legacy sampling produced ZERO points for this shape (audit B11). */
export const unitSquare: Ring = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Slightly irregular quadrilateral like a real click-defined quadrat (pixel coords). */
export const clickedSquare: Ring = [
  { x: 100.4, y: 98.7 },
  { x: 512.9, y: 103.2 },
  { x: 508.1, y: 489.6 },
  { x: 96.2, y: 495.3 },
];

/** Convex pentagon. */
export const pentagon: Ring = [
  { x: 200, y: 0 },
  { x: 390, y: 138 },
  { x: 317, y: 362 },
  { x: 83, y: 362 },
  { x: 10, y: 138 },
];

/** Concave L-shape with vertical AND horizontal edges (legacy isPointInside broke on vertical edges). */
export const lShape: Ring = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 2 },
  { x: 2, y: 2 },
  { x: 2, y: 4 },
  { x: 0, y: 4 },
];

/** Self-intersecting bowtie — invalid input, must be rejected. */
export const bowtie: Ring = [
  { x: 0, y: 0 },
  { x: 2, y: 2 },
  { x: 2, y: 0 },
  { x: 0, y: 2 },
];

export function expectClose(actual: number, expected: number, relTol = 1e-6): void {
  const scale = Math.max(1, Math.abs(expected));
  if (Math.abs(actual - expected) > relTol * scale) {
    throw new Error(`expected ${actual} ≈ ${expected} (relTol ${relTol})`);
  }
}

/** Reference even-odd point-in-polygon, independent implementation for cross-checking. */
export function refPointInPolygon(p: Vec2, ring: Ring): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = ring[i]!;
    const vj = ring[j]!;
    const intersects =
      vi.y > p.y !== vj.y > p.y &&
      p.x < ((vj.x - vi.x) * (p.y - vi.y)) / (vj.y - vi.y) + vi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
