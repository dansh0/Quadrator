/**
 * Equal-area stratified sampling inside an arbitrary simple polygon —
 * corrected port of Quadrat.randomSamplePointsPoly.
 *
 * Differences from legacy (deliberate):
 * - Failures throw GeometryError instead of alert()-ing and half-completing
 *   (audit B9).
 * - Rejection sampling uses a CORRECT bounding box (legacy bbox had min/max
 *   inverted — audit B5 — and its isPointInside accepted every point when
 *   the polygon had a vertical edge, so bad points could be "accepted").
 * - No ×1000 coordinate scaling: the corrected splitByArea is numerically
 *   stable on unit- and pixel-scale coordinates (validated by tests).
 * - Takes an explicit Rng for reproducibility.
 */
import { Vec2 } from '../geometry/vec2.ts';
import {
  GeometryError,
  Ring,
  area,
  bbox,
  isPointInside,
  splitByArea,
} from '../geometry/polygon.ts';
import { Rng } from './rng.ts';

const MAX_REJECTION_TRIES = 1000;

export interface PolySampleResult {
  /** One point per piece; points[i] lies strictly inside pieces[i]. */
  points: Vec2[];
  /** The straight cuts made, in cut order (numOfSamples − 1 of them). */
  cutLines: [Vec2, Vec2][];
  /** The equal-area pieces, one per sample. */
  pieces: Ring[];
}

/**
 * Split `ring` (OPEN, simple, non-zero area) into `numOfSamples` equal-area
 * pieces via successive splitByArea cuts, then place one uniformly-random
 * point in each piece by rejection sampling in the piece's bbox.
 * Deterministic: same ring + same seed ⇒ identical result.
 */
export function samplePolygon(ring: Ring, numOfSamples: number, rng: Rng): PolySampleResult {
  if (!Number.isInteger(numOfSamples) || numOfSamples < 1) {
    throw new GeometryError(`numOfSamples must be a positive integer, got ${numOfSamples}`);
  }

  const total = area(ring);
  const target = total / numOfSamples;

  const pieces: Ring[] = [];
  const cutLines: [Vec2, Vec2][] = [];
  let remaining: Ring = ring;
  for (let i = 0; i < numOfSamples - 1; i++) {
    const { piece, rest, cutLine } = splitByArea(remaining, target);
    pieces.push(piece);
    cutLines.push(cutLine);
    remaining = rest;
  }
  pieces.push(remaining);

  if (numOfSamples === 1 && area(remaining) === 0) {
    // splitByArea validates degenerate input on every cut; with n=1 no cut
    // happens, so validate here.
    throw new GeometryError('samplePolygon requires a ring with non-zero area');
  }

  const points = pieces.map((piece) => samplePointInside(piece, rng));
  return { points, cutLines, pieces };
}

function samplePointInside(piece: Ring, rng: Rng): Vec2 {
  const { min, max } = bbox(piece);
  for (let attempt = 0; attempt < MAX_REJECTION_TRIES; attempt++) {
    const p: Vec2 = {
      x: min.x + rng() * (max.x - min.x),
      y: min.y + rng() * (max.y - min.y),
    };
    if (isPointInside(piece, p)) return p;
  }
  throw new GeometryError(
    `could not place a point inside a piece after ${MAX_REJECTION_TRIES} tries`
  );
}
