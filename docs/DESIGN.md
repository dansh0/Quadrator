# Design & Roadmap

## 1. Product

Quadrator supports quadrat-based ecological surveys. Workflow: load a
survey image → define the quadrat boundary on it (4-corner quad, or an
arbitrary simple polygon) → generate N randomized sample points,
stratified so coverage is spatially even → tag the species present at
each point from a configurable species-button set → review in a QA
table → export per-quadrat species counts and coverage percentages as
CSV. Sessions (multiple images/quadrats with all tagging state) can be
saved and restored.

Because the output is scientific data, the design priorities are:
never lose or silently corrupt user data; make sampling reproducible
(seeded RNG); fail loudly on invalid input.

## 2. Architecture: core/shell split

```
packages/core      @quadrator/core — platform-free domain logic (TS, done)
packages/ui        @quadrator/ui — Vue 3 + Vuetify 3 + Pinia layer (Vite; in progress)
apps/desktop       @quadrator/desktop — Electron shell, context-isolated preload (scaffolded)
src/               legacy Vue 2 + Electron shell (to be replaced)
apps/web           planned: static web build of the same UI
```

All domain logic lives in core and is UI- and platform-agnostic. Shells
provide I/O through the **PlatformAdapter** interface (defined in
`packages/core/src/platform/`, types only): open/save session files,
load images, export CSV, persist settings — implemented once for
Electron (IPC to the main process) and once for the browser (File
System Access API / download fallback). The UI layer depends only on
core + the adapter interface, which is what makes a single codebase
serve desktop and web.

Adapter conventions: every method is async; user cancellation is a
value (`null`/empty array), never an exception; failures throw
`PlatformIOError`. `FileRef.id` is the stable identity persisted in
session files (`imagePath`). Adapters whose ids do not survive
restarts (`capabilities.persistentFileIds: false`) recover images
through the `relinkImage` flow. `InMemoryPlatformAdapter` (in core) is
the scriptable test double for UI tests and browser demo mode.

Crash recovery: the UI keeps a throttled snapshot of the session
(`lastSessionText` in the adapter-persisted settings document — the
legacy app used localStorage) and offers it as "Continue Last Session"
on the home screen. The snapshot writes on the leading **and** trailing
edge of a 5s window (`packages/ui/src/autosave.ts`); legacy dropped
trailing changes, which could lose up to 5s of tagging on a crash. A
corrupt snapshot is surfaced and dropped, never retried; Start Over
clears it.

### `@quadrator/core` module map

| Module | Responsibility |
|---|---|
| `geometry/` | `Vec2` ops, line/segment intersection, polygon area/orientation/point-in-polygon/bbox/simplicity, `splitByArea` (equal-area polygon partition). Corrected port of the vendored poly-split library; validated by invariant tests rather than legacy-output parity. |
| `sampling/` | `sampleRect` (stratified rows×cols within a quad), `samplePolygon` (n equal-area pieces via sequential `splitByArea`, one rejection-sampled point per piece), `mulberry32` seeded RNG. |
| `model/` | Shared domain types (`Sample`, `SpeciesEntry`, `QuadratSettings`). |
| `export/` | CSV row generation with escaping; stable column header. |
| `species/` | RFC 4180-style CSV parsing for species-button definitions (browser-safe, no Node deps). |
| `serialization/` | zod schemas for session formats, migration, `parseSession`/`serializeSession`. |

### Session schema

- **v0** — the legacy app's ad-hoc save format. Modeled leniently;
  accepted read-only and migrated on load.
- **v1** — strict, versioned: `schemaVersion: 1`, `savedAt` (ISO),
  `settings` (sample grid, restrict-to-quad), `quadrats[]` (stable id,
  image path, name, open-ring boundary, `geoDefined`, `rngSeed`,
  positional `samples[]` with nullable coordinates and species codes),
  `currentQuadratId`.
- Rules: unknown versions are rejected with a typed error, never
  guessed at. Every format ever shipped remains loadable via migration,
  proven by real fixture files. Migration prefers preserving data over
  spec strictness (e.g. a boundary present without a `geoDefined` flag
  implies the flag).

### CSV export contract

Header: `Quadrat Title,Image Path,ID Date,Species Code,Species,Group
Name,Species Count,Species Coverage %`. One row per distinct species
code in first-tagged order; coverage = count / total samples × 100;
unknown codes export as `UNKNOWN CODE` rather than failing the export.
Treated as public API (see STYLE_GUIDE §4).

## 3. Target stack (decided)

Vue 3 + TypeScript + Vite + Vuetify 3 + Pinia. Rationale: preserves
the team's Vue/Vuetify knowledge and the existing component structure
conceptually, while replacing the EOL toolchain (Vue CLI/webpack,
Vue 2, Vuetify 2, Electron 13). Electron is upgraded to a current LTS
with **context isolation on** and a minimal typed preload API. d3 usage
shrinks to scales/zoom behavior; geometry math comes from core.

### Image canvas (ported)

The legacy imperative d3 canvas is replaced by declarative SVG in
`packages/ui/src/components/ImageCanvas.vue`: the template renders
image, boundary, sample points and crosshair straight from the stores;
d3 is reduced to `d3-zoom`/`d3-selection` for pan/zoom on the inner
`<g>`. Pure fit/transform/tolerance math lives DOM-free in
`packages/ui/src/canvas.ts`. Legacy behaviors preserved: boundary
nodes and samples stored image-normalized (0–1); zoom gated on a
defined boundary; overlay sizes scaled by `1/(0.5 + 0.5k)`; polygon
close within 0.025 per-axis of the first node (now requiring ≥3 nodes);
quad mode auto-completes at 4 nodes; sample click moves the cursor and
jumps to Species ID. Equal-area cut lines are **not persisted** in v1 —
they are recomputed from the boundary + stored `rngSeed`, and rendered
only if the recomputed points exactly match the stored samples, so
settings drift can never display a misleading partition.

Cloud features (later phases) are **provider-agnostic**: a small sync
interface (auth, blob storage for images, document storage for
sessions) with pluggable backends, so no vendor is load-bearing.

## 4. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Data-safety hotfixes on the legacy app; capture real fixture files; initial unit suite | **Done** |
| 1 | Extract `@quadrator/core` (geometry, sampling, CSV, species, versioned sessions) with full test suite; npm workspaces; CI typecheck gate | **Done** |
| 2 | `packages/ui` (Vue 3/Vuetify 3/Pinia) + `apps/desktop` (current Electron, context isolation, PlatformAdapter); legacy `src/` retired at cutover; pnpm migration; ESLint flat config with TS support | **In progress** — adapter contract, ui scaffold, Electron shell, all screens, image canvas, and the feature-parity audit done (gaps closed: crash-recovery autosave + Continue Last Session, load-session overwrite confirm, home-screen version footer); remaining: cutover (retire `src/`, pnpm, ESLint flat config) |
| 3 | `apps/web`: browser adapter, static hosting, Playwright E2E suite | Planned |
| 4 | Cloud sync (provider-agnostic), shared species libraries, multi-device sessions | Planned |

Future feature aims (design hooks exist; build later): reproducible
resampling from stored seeds, annotation overlays, per-project species
libraries, collaborative review of tagged quadrats, and statistical
summaries beyond per-quadrat coverage.

## 5. Testing strategy

Current state: unit suites for core (≥95% statement coverage enforced
as a floor) and the legacy modules that carry data-safety fixes;
component suites for every Vue 3 component (stores, tabs, panels, and
the image canvas — happy-dom, `InMemoryPlatformAdapter`, injected image
sizer; conventions in AGENTS.md). E2E tests remain deferred to the
Phase 3 web build. Visual verification of the desktop shell uses the
`QUADRATOR_SHOT` screenshot hook rather than a snapshot suite.

Planned, in rough order of value:

1. **Coverage institutionalized**: `@vitest/coverage-v8` as a
   devDependency, `test:coverage` script, CI threshold on
   `packages/core/src`.
2. **Property-based tests** (fast-check) on `splitByArea` and
   serialization round-trips: random simple polygons/sessions, assert
   invariants (piece areas sum to total; cut endpoints on the ring;
   parse∘serialize = identity).
3. **Component tests** (Vitest + @vue/test-utils + happy-dom) alongside
   each new Vue 3 component: species-button/store sync, hotkey gating
   while inputs are focused, QA-table behavior, tab gating, canvas
   drawing/tagging flows. **Done** — maintained as a standing practice,
   not a phase.
4. **E2E** (Playwright against the web build, seeded RNG test hook):
   golden path draw→tag→export with exact CSV assertion; polygon mode;
   session round-trip; multi-image navigation with duplicate filenames;
   species-CSV lifecycle; hotkeys; zoom/pan coordinate transforms. Plus
   one Electron smoke test for shell/preload wiring.
5. **Nice-to-have**: SVG snapshot tests of sampled layouts (geometry
   regressions become visible diffs); one-off mutation testing (Stryker)
   on core to find non-constraining assertions.

Standing practice: when a real-world session file in an older format
surfaces, add a sanitized copy to `tests/fixtures/` so every format
ever produced stays load-tested.
