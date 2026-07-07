/**
 * @quadrator/core — platform-free domain logic for Quadrator.
 *
 * Everything here runs identically in Electron, the browser, and Node
 * (tests / future server): no DOM, no fs, no electron imports. Platform
 * shells (Phase 2+) handle files, dialogs, and rendering.
 */

// geometry
export * from './geometry/vec2.ts';
export {
  GEOM_EPS,
  type LineABC,
  type Segment,
  lineOf,
  segLen,
  segLen2,
  projectOntoLine,
  intersectLineLine,
  crossLineSegment,
  crossSegmentSegment,
} from './geometry/line.ts';
export {
  GeometryError,
  type Ring,
  type SplitResult,
  signedArea,
  area,
  isClockwise,
  isPointInside,
  isSimple,
  bbox,
  splitByArea,
} from './geometry/polygon.ts';

// sampling
export { type Rng, mulberry32, randomSeed } from './sampling/rng.ts';
export { sampleRect } from './sampling/rect.ts';
export { type PolySampleResult, samplePolygon } from './sampling/poly.ts';

// model
export type { Sample, SpeciesEntry, QuadratSettings } from './model/types.ts';

// export + species
export { CSV_HEADER, type QuadratCsvInput, csvEscape, quadratCsvRows } from './export/csv.ts';
export { CsvParseError, parseSpeciesCsv } from './species/parse.ts';

// platform
export {
  type FileRef,
  type OpenedTextFile,
  type PlatformAdapter,
  type PlatformCapabilities,
  PlatformIOError,
} from './platform/adapter.ts';
export { InMemoryPlatformAdapter } from './platform/memory.ts';

// serialization
export { type SessionV0, sessionV0Schema } from './serialization/v0.ts';
export {
  type SampleV1,
  type QuadratV1,
  type SettingsV1,
  type SessionV1,
  sampleV1Schema,
  quadratV1Schema,
  settingsV1Schema,
  sessionV1Schema,
} from './serialization/v1.ts';
export { migrateV0, parseSession, serializeSession } from './serialization/migrate.ts';
