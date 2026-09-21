/**
 * Regular-grid sampling inside a (possibly skewed) quadrilateral: the same
 * rows×cols strata `sampleRect` uses, but with the point placed at a fixed
 * position in every cell instead of a random one. No Rng — the layout is a
 * function of the boundary alone, so it is reproducible without a seed.
 */
import { Vec2, lerp } from '../geometry/vec2.ts';
import { GeometryError, Ring, area } from '../geometry/polygon.ts';

/**
 * Where the points sit relative to the grid.
 *
 * The first five place one point per cell, named for how the image reads on
 * screen: image-normalized y grows DOWNWARD, so "top" is the v0→v1 edge of
 * the ring and "bottom" is the v3→v2 edge.
 *
 * `fill` is different in kind: points go on the grid's INTERSECTIONS rather
 * than inside its cells, covering the boundary and the interior. Keeping the
 * sample count at rows×cols then means the grid itself has one fewer row and
 * column of cells — an R×C lattice of intersections is an (R−1)×(C−1) grid.
 */
export const GRID_ORIGINS = [
  'center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'fill',
] as const;

export type GridOrigin = (typeof GRID_ORIGINS)[number];

/** Fractional position within a cell: u along v0→v1, v along v0→v3. */
const CELL_OFFSET: Record<Exclude<GridOrigin, 'fill'>, { u: number; v: number }> = {
  center: { u: 0.5, v: 0.5 },
  'top-left': { u: 0, v: 0 },
  'top-right': { u: 1, v: 0 },
  'bottom-left': { u: 0, v: 1 },
  'bottom-right': { u: 1, v: 1 },
};

/**
 * How many CELLS the drawn grid has for a given sample count and origin.
 * Per-cell origins need one cell per sample; `fill` puts samples on the
 * intersections, so it needs one fewer division on each axis. A single
 * sample along an axis leaves that axis undivided.
 */
export function gridCellCounts(
  rows: number,
  cols: number,
  origin: GridOrigin
): { cellRows: number; cellCols: number } {
  if (origin !== 'fill') return { cellRows: rows, cellCols: cols };
  return { cellRows: Math.max(1, rows - 1), cellCols: Math.max(1, cols - 1) };
}

/**
 * Fractional position of lattice point `i` of `count` along one axis, for
 * `fill`: 0 and 1 are included so the boundary is sampled. With a single
 * point on the axis there is no span to spread over, so it goes in the
 * middle rather than collapsing onto one edge.
 */
function fillFraction(i: number, count: number): number {
  return count === 1 ? 0.5 : i / (count - 1);
}

/**
 * Place rows×cols points in the quadrilateral `ring` (OPEN ring, exactly 4
 * vertices v0..v3, edges v0→v1 and v3→v2 being the "horizontal" pair), one
 * per cell at `origin`, indexed `row * cols + col` — the same indexing
 * `sampleRect` uses, so switching sampling mode never reorders samples.
 *
 * Corner origins deliberately put edge cells' points exactly ON the quadrat
 * boundary; that is what picking a corner means.
 */
export function sampleRectGrid(
  ring: Ring,
  rows: number,
  cols: number,
  origin: GridOrigin
): Vec2[] {
  if (ring.length !== 4) {
    throw new GeometryError(
      `sampleRectGrid requires an open 4-vertex ring, got ${ring.length} vertices`
    );
  }
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new GeometryError(`rows and cols must be positive integers, got ${rows}×${cols}`);
  }
  if (area(ring) === 0) {
    throw new GeometryError('sampleRectGrid requires a ring with non-zero area');
  }

  const [v0, v1, v2, v3] = ring as [Vec2, Vec2, Vec2, Vec2];
  const offset = origin === 'fill' ? null : CELL_OFFSET[origin];
  const points: Vec2[] = new Array(rows * cols);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = offset === null ? fillFraction(col, cols) : (col + offset.u) / cols;
      const top = lerp(v0, v1, u);
      const bottom = lerp(v3, v2, u);
      const v = offset === null ? fillFraction(row, rows) : (row + offset.v) / rows;
      points[row * cols + col] = lerp(top, bottom, v);
    }
  }
  return points;
}

/**
 * The cell boundaries as line segments, for drawing the grid the samples sit
 * on. Takes CELL counts (see gridCellCounts), not sample counts — for `fill`
 * these differ. Excludes the quadrat outline itself, which the canvas
 * already draws: `cols − 1` lines across and `rows − 1` down.
 */
export function rectGridLines(ring: Ring, rows: number, cols: number): [Vec2, Vec2][] {
  if (ring.length !== 4) {
    throw new GeometryError(
      `rectGridLines requires an open 4-vertex ring, got ${ring.length} vertices`
    );
  }
  const [v0, v1, v2, v3] = ring as [Vec2, Vec2, Vec2, Vec2];
  const lines: [Vec2, Vec2][] = [];

  for (let col = 1; col < cols; col++) {
    const u = col / cols;
    lines.push([lerp(v0, v1, u), lerp(v3, v2, u)]);
  }
  for (let row = 1; row < rows; row++) {
    const v = row / rows;
    lines.push([lerp(v0, v3, v), lerp(v1, v2, v)]);
  }
  return lines;
}
