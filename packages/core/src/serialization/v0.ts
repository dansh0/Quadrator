/**
 * Schema for the legacy (unversioned) session format, exactly as the Vue 2
 * app writes it. Deliberately lenient: real files carry extra keys
 * (`polygons` contains serialized class-instance debris, `edgesNodes` is
 * derived data) — both validate but are dropped on migration. Validated
 * against the three real session fixtures in tests/fixtures/.
 */
import { z } from 'zod';

const vecV0Schema = z.object({ x: z.number(), y: z.number() }).passthrough();

export const sampleV0Schema = z
  .object({
    sampleNumber: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    codes: z.array(z.string()),
  })
  .passthrough();

export const quadratDataV0Schema = z
  .object({
    numOfSamples: z.number(),
    imgSrc: z.string(),
    name: z.string().optional(),
    samples: z.array(sampleV0Schema),
    cutLines: z.unknown().optional(),
    geoDefined: z.boolean().optional(),
    polygons: z.unknown().optional(),
  })
  .passthrough();

export const inputStatusV0Schema = z
  .object({
    sampleNumber: z.number().optional(),
    /** CLOSED ring (last vertex repeats the first) when a boundary was drawn. */
    nodes: z.array(vecV0Schema),
    edgesNodes: z.unknown().optional(),
    loadedIteration: z.number().optional(),
  })
  .passthrough();

export const sessionV0Schema = z
  .object({
    imgPathList: z.array(z.string()),
    runningData: z.array(
      z
        .object({
          inputStatus: inputStatusV0Schema,
          quadratData: quadratDataV0Schema,
        })
        .passthrough()
    ),
    currentImgSrc: z.string(),
  })
  .passthrough();

export type SessionV0 = z.infer<typeof sessionV0Schema>;
