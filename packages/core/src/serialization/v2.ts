/**
 * Schema for the versioned v2 session format. Strict — unknown keys are
 * rejected, so format drift is caught at the boundary instead of
 * propagating.
 *
 * What changed from v1:
 * - `settings.restrictToQuad` (a boolean nothing in the UI ever set) is
 *   replaced by an explicit `shape`, which also distinguishes `quad` from
 *   `square` — both produce 4-vertex rings, so the boundary alone cannot
 *   tell them apart;
 * - `settings.sampling` and `settings.gridOrigin` record how points are
 *   placed, which v1 could not express at all;
 * - each quadrat now carries the sampling/shape/gridOrigin it was actually
 *   generated with. Session settings are only the default for the NEXT
 *   boundary, so without this a quadrat's layout could not be reproduced
 *   after the user changed modes — and the canvas would draw a partition
 *   that did not match the stored points.
 *
 * Unchanged from v1: samples, boundary (still an OPEN ring), rngSeed,
 * quadrat ids and display order.
 */
import { z } from 'zod';
import { GRID_ORIGINS } from '../sampling/grid.ts';
import { QUADRAT_SHAPES, SAMPLING_MODES } from '../model/types.ts';

const vec2Schema = z.object({ x: z.number(), y: z.number() }).strict();

const samplingSchema = z.enum(SAMPLING_MODES);
const shapeSchema = z.enum(QUADRAT_SHAPES);
const gridOriginSchema = z.enum(GRID_ORIGINS);

export const sampleV2Schema = z
  .object({
    index: z.number().int().nonnegative(),
    x: z.number().nullable(),
    y: z.number().nullable(),
    codes: z.array(z.string()),
  })
  .strict();

export const quadratV2Schema = z
  .object({
    id: z.string().min(1),
    imagePath: z.string(),
    name: z.string(),
    /** OPEN ring; [] when no boundary has been defined. */
    boundary: z.array(vec2Schema),
    geoDefined: z.boolean(),
    rngSeed: z.number().nullable(),
    /** How this quadrat's points were generated (provenance, not a default). */
    sampling: samplingSchema,
    shape: shapeSchema,
    gridOrigin: gridOriginSchema,
    samples: z.array(sampleV2Schema),
  })
  .strict();

export const settingsV2Schema = z
  .object({
    numOfSampleRows: z.number().int().positive(),
    numOfSampleCols: z.number().int().positive(),
    sampling: samplingSchema,
    shape: shapeSchema,
    gridOrigin: gridOriginSchema,
  })
  .strict();

export const sessionV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    /** ISO 8601 timestamp of the save. */
    savedAt: z.string().datetime(),
    /** Defaults applied to the next boundary drawn; per-quadrat values win. */
    settings: settingsV2Schema,
    /** Array order = display order. */
    quadrats: z.array(quadratV2Schema),
    currentQuadratId: z.string().nullable(),
  })
  .strict();

export type SampleV2 = z.infer<typeof sampleV2Schema>;
export type QuadratV2 = z.infer<typeof quadratV2Schema>;
export type SettingsV2 = z.infer<typeof settingsV2Schema>;
export type SessionV2 = z.infer<typeof sessionV2Schema>;
