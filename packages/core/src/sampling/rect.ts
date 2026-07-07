/**
 * Stratified random sampling inside a (possibly skewed) quadrilateral —
 * corrected port of Quadrat.randomSamplePointsRect ("H-bridge" sampling).
 *
 * Differences from legacy (deliberate):
 * - No d3.range for strata: legacy derived strata from edge-node coordinate
 *   ranges, and a perfectly axis-aligned quadrat made the step 0 →
 *   d3.range returned [] → ZERO sample points (audit B11). Strata are plain
 *   integer loops here, so axis-aligned quadrats work.
 * - Point index is defined unambiguously as row * cols + col. Legacy used
 *   yIndex * numOfSampleRows + xIndex, which is only self-consistent when
 *   rows === cols (the app's default 5×5 masked this).
 * - Takes an explicit Rng for reproducibility.
 */
import { Vec2, lerp } from '../geometry/vec2.ts';
import { GeometryError, Ring, area } from '../geometry/polygon.ts';
import { Rng } from './rng.ts';

/**
 * Sample rows×cols points inside the quadrilateral `ring` (OPEN ring,
 * exactly 4 vertices v0..v3, edges v0→v1 and v3→v2 being the "horizontal"
 * pair). One point per stratum:
 *
 * - `col` strata subdivide the v0→v1 (and v3→v2) direction,
 * - `row` strata subdivide the v0→v3 (and v1→v2) direction,
 * - result[row * cols + col] is the point for that stratum.
 *
 * Each point picks a random position along the v0→v1 edge within its column
 * stratum, bridges to the matching position on the v3→v2 edge, then picks a
 * random position along that bridge within its row stratum (the legacy
 * "H bridge"). Two rng() draws per point, points in index order — same seed
 * ⇒ identical output.
 */
export function sampleRect(ring: Ring, rows: number, cols: number, rng: Rng): Vec2[] {
  if (ring.length !== 4) {
    throw new GeometryError(
      `sampleRect requires an open 4-vertex ring, got ${ring.length} vertices`
    );
  }
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new GeometryError(`rows and cols must be positive integers, got ${rows}×${cols}`);
  }
  if (area(ring) === 0) {
    throw new GeometryError('sampleRect requires a ring with non-zero area');
  }

  const [v0, v1, v2, v3] = ring as [Vec2, Vec2, Vec2, Vec2];
  const points: Vec2[] = new Array(rows * cols);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = (col + rng()) / cols;
      const top = lerp(v0, v1, u);
      const bottom = lerp(v3, v2, u);
      const v = (row + rng()) / rows;
      points[row * cols + col] = lerp(top, bottom, v);
    }
  }
  return points;
}
