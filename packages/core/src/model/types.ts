/**
 * Domain types shared across core modules. Session-file shapes live in
 * serialization/ (derived from zod schemas); these are the in-memory types.
 */
import { GridOrigin } from '../sampling/grid.ts';

/** One row of the species/buttons CSV. */
export interface SpeciesEntry {
  code: string;
  species: string;
  group1: string;
  group2: string;
  color: string;
  colorSelected: string;
}

/** One sample point within a quadrat. x/y are null until points are generated. */
export interface Sample {
  /** Position in the quadrat's sample array (0-based). */
  index: number;
  x: number | null;
  y: number | null;
  /** Species codes tagged at this point. */
  codes: string[];
}

/**
 * How sample points are placed inside the quadrat.
 * - `stratified-random`: one random point per cell / equal-area piece (the
 *   historical behaviour, and the default).
 * - `regular-grid`: a fixed position in every cell — deterministic, no seed.
 * - `random`: independent uniform points across the whole quadrat, with no
 *   partition at all.
 */
export const SAMPLING_MODES = ['stratified-random', 'regular-grid', 'random'] as const;

export type SamplingMode = (typeof SAMPLING_MODES)[number];

/**
 * How the boundary is drawn.
 * - `quad`: four free corners, completing on the fourth click.
 * - `square`: two clicks — the first side, then a right angle off it.
 * - `n-poly`: any number of vertices, closed by clicking the first node.
 *
 * `quad` and `square` both produce 4-vertex rings, so the shape cannot be
 * recovered from the boundary alone; it is stored.
 */
export const QUADRAT_SHAPES = ['quad', 'square', 'n-poly'] as const;

export type QuadratShape = (typeof QUADRAT_SHAPES)[number];

/** Sampling configuration (v0 sessions never stored this — audit B8). */
export interface QuadratSettings {
  numOfSampleRows: number;
  numOfSampleCols: number;
  sampling: SamplingMode;
  shape: QuadratShape;
  /** Only meaningful when `sampling` is `regular-grid`. */
  gridOrigin: GridOrigin;
}
