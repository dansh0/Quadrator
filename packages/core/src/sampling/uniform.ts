/**
 * Unstratified uniform-random sampling inside an arbitrary simple polygon.
 *
 * Unlike `sampleRect` / `samplePolygon` this places every point independently
 * in the WHOLE quadrat rather than one per stratum, so points may clump or
 * leave gaps. That is the point of the mode — it trades even spatial spread
 * for an unbiased simple random sample — and it means there is no grid or
 * partition to draw.
 */
import { Vec2 } from '../geometry/vec2.ts';
import { GeometryError, Ring, area, bbox, isPointInside } from '../geometry/polygon.ts';
import { Rng } from './rng.ts';

const MAX_REJECTION_TRIES = 1000;

/**
 * `numOfSamples` uniformly-random points strictly inside `ring` (OPEN,
 * simple, non-zero area), by rejection sampling in the ring's bbox. Points
 * are produced in index order, two rng() draws each, so the same seed gives
 * the same layout.
 */
export function sampleUniform(ring: Ring, numOfSamples: number, rng: Rng): Vec2[] {
  if (!Number.isInteger(numOfSamples) || numOfSamples < 1) {
    throw new GeometryError(`numOfSamples must be a positive integer, got ${numOfSamples}`);
  }
  if (ring.length < 3) {
    throw new GeometryError(`sampleUniform requires at least 3 vertices, got ${ring.length}`);
  }
  if (area(ring) === 0) {
    throw new GeometryError('sampleUniform requires a ring with non-zero area');
  }

  const { min, max } = bbox(ring);
  const points: Vec2[] = new Array(numOfSamples);

  for (let i = 0; i < numOfSamples; i++) {
    points[i] = samplePointInside(ring, min, max, rng);
  }
  return points;
}

function samplePointInside(ring: Ring, min: Vec2, max: Vec2, rng: Rng): Vec2 {
  for (let attempt = 0; attempt < MAX_REJECTION_TRIES; attempt++) {
    const p: Vec2 = {
      x: min.x + rng() * (max.x - min.x),
      y: min.y + rng() * (max.y - min.y),
    };
    if (isPointInside(ring, p)) return p;
  }
  throw new GeometryError(
    `could not place a point inside the quadrat after ${MAX_REJECTION_TRIES} tries`
  );
}
