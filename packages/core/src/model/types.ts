/**
 * Domain types shared across core modules. Session-file shapes live in
 * serialization/ (derived from zod schemas); these are the in-memory types.
 */

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

/** Sampling configuration (v0 sessions never stored this — audit B8). */
export interface QuadratSettings {
  numOfSampleRows: number;
  numOfSampleCols: number;
  restrictToQuad: boolean;
}
