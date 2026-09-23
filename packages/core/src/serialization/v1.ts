/**
 * Schema for the versioned v1 session format (the format core owns going
 * forward). Strict — unknown keys are rejected, so format drift is caught at
 * the boundary instead of propagating.
 *
 * Design notes (July2026Plan §5 / audit fixes):
 * - quadrats carry stable ids and array order is display order (fixes B3:
 *   duplicate image paths used to collide);
 * - boundary is an OPEN ring (core convention; v0 stored closed rings);
 * - rngSeed makes sample layouts reproducible (null when unknown, e.g.
 *   migrated v0 sessions);
 * - settings are stored explicitly (v0 never stored them — audit B8).
 */
import { z } from 'zod';

const vec2Schema = z.object({ x: z.number(), y: z.number() }).strict();

export const sampleV1Schema = z
  .object({
    index: z.number().int().nonnegative(),
    x: z.number().nullable(),
    y: z.number().nullable(),
    codes: z.array(z.string()),
  })
  .strict();

export const quadratV1Schema = z
  .object({
    id: z.string().min(1),
    imagePath: z.string(),
    name: z.string(),
    /** OPEN ring; [] when no boundary has been defined. */
    boundary: z.array(vec2Schema),
    geoDefined: z.boolean(),
    rngSeed: z.number().nullable(),
    samples: z.array(sampleV1Schema),
  })
  .strict();

export const settingsV1Schema = z
  .object({
    numOfSampleRows: z.number().int().positive(),
    numOfSampleCols: z.number().int().positive(),
    restrictToQuad: z.boolean(),
  })
  .strict();

export const sessionV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    /** ISO 8601 timestamp of the save. */
    savedAt: z.string().datetime(),
    settings: settingsV1Schema,
    /** Array order = display order. */
    quadrats: z.array(quadratV1Schema),
    currentQuadratId: z.string().nullable(),
  })
  .strict();

export type SampleV1 = z.infer<typeof sampleV1Schema>;
export type QuadratV1 = z.infer<typeof quadratV1Schema>;
export type SettingsV1 = z.infer<typeof settingsV1Schema>;
export type SessionV1 = z.infer<typeof sessionV1Schema>;
