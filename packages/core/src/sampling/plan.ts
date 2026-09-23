/**
 * The one place that decides, given a boundary and a settings snapshot,
 * where sample points go and what partition they sit on.
 *
 * Both callers need the same answer: the store generates points when a
 * boundary is committed, and the canvas re-derives them to check that the
 * partition it is about to draw still matches the stored samples. Deriving
 * that twice invites the two from drifting apart and drawing a grid the
 * points do not belong to, which would misrepresent real survey data.
 */
import { Vec2 } from '../geometry/vec2.ts';
import { Ring } from '../geometry/polygon.ts';
import { SamplingMode } from '../model/types.ts';
import { GridOrigin, gridCellCounts, rectGridLines, sampleRectGrid } from './grid.ts';
import { samplePolygon, samplePolygonCentres } from './poly.ts';
import { sampleRect } from './rect.ts';
import { Rng } from './rng.ts';
import { sampleUniform } from './uniform.ts';

/** The settings a sampling run actually depends on. */
export interface SamplePlanSettings {
  numOfSampleRows: number;
  numOfSampleCols: number;
  sampling: SamplingMode;
  /** Only consulted for `regular-grid` on a 4-vertex ring. */
  gridOrigin: GridOrigin;
}

export interface SamplePlan {
  /** One point per sample, in index order (`row * cols + col` for quads). */
  points: Vec2[];
  /**
   * The cell boundaries the points sit on — grid lines for a quadrilateral,
   * equal-area cuts for a polygon. Empty for `random`, which has no
   * partition at all.
   */
  lines: [Vec2, Vec2][];
}

/**
 * Plan the sample layout for `ring` (OPEN ring, image-normalized).
 *
 * A 4-vertex ring is treated as a quadrilateral with a rows×cols grid;
 * anything else is split into `rows × cols` equal-area pieces. `regular-grid`
 * on a polygon places each point at the centre of its piece — the equal-area
 * partition is the only grid a polygon has, which is also why the grid-origin
 * choices (including `fill`) do not apply there.
 *
 * Every mode yields exactly `rows × cols` points, in the same index order, so
 * changing mode never renumbers a quadrat's samples.
 *
 * Throws `GeometryError` for rings that cannot be sampled; nothing partial is
 * ever returned.
 */
export function planSamples(ring: Ring, settings: SamplePlanSettings, rng: Rng): SamplePlan {
  const { numOfSampleRows: rows, numOfSampleCols: cols, sampling, gridOrigin } = settings;
  const n = rows * cols;
  const isQuad = ring.length === 4;

  if (sampling === 'random') {
    return { points: sampleUniform(ring, n, rng), lines: [] };
  }

  if (isQuad) {
    if (sampling === 'regular-grid') {
      // `fill` samples the grid's intersections rather than its cells, so
      // the same point count needs one fewer division on each axis.
      const { cellRows, cellCols } = gridCellCounts(rows, cols, gridOrigin);
      return {
        points: sampleRectGrid(ring, rows, cols, gridOrigin),
        lines: rectGridLines(ring, cellRows, cellCols),
      };
    }
    return { points: sampleRect(ring, rows, cols, rng), lines: rectGridLines(ring, rows, cols) };
  }

  const result =
    sampling === 'regular-grid' ? samplePolygonCentres(ring, n) : samplePolygon(ring, n, rng);
  return { points: result.points, lines: result.cutLines };
}
