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
packages/ui        @quadrator/ui — Vue 3 + Vuetify 3 + Pinia layer (Vite, done)
apps/desktop       @quadrator/desktop — Electron shell, context-isolated preload (done, packaged with electron-builder)
apps/web           @quadrator/web — static web build of the same UI (done, BrowserPlatformAdapter + Playwright E2E)
```

The legacy Vue 2 + Electron 13 app (`src/` and its Vue CLI toolchain)
was retired at the Phase 2 cutover (July 2026) and lives only in git
history.

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
- **v2** (current) — adds the sampling controls. `settings` drops the
  dead `restrictToQuad` flag for an explicit `shape`
  (`quad`/`square`/`n-poly`), plus `sampling`
  (`stratified-random`/`regular-grid`/`random`) and `gridOrigin`
  (cell centre, one of the four corners, or `fill`). Each **quadrat** also
  carries the `sampling`, `shape` and `gridOrigin` it was generated
  with: session settings are only the default for the next boundary, so
  without per-quadrat provenance a layout could not be reproduced once
  the user changed modes, and the canvas could draw a partition the
  points do not belong to. `shape` cannot be derived from the ring —
  `quad` and `square` both produce four vertices.
- Rules: unknown versions are rejected with a typed error, never
  guessed at. Every format ever shipped remains loadable via migration
  (v0 → v1 → v2, each hop separately tested), proven by real fixture
  files. Migration prefers preserving data over spec strictness (e.g. a
  boundary present without a `geoDefined` flag implies the flag).

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

### Sampling modes

Sample placement is a `(shape, sampling)` pair, resolved in one place —
`core/sampling/plan.ts` — which both the store (generating points) and
the canvas (re-deriving them to verify the grid it draws) call. Deriving
it twice would let the drawn partition drift from the points it claims
to describe, which would misrepresent real survey data.

| Ring | `stratified-random` | `regular-grid` | `random` |
|---|---|---|---|
| 4 vertices (quad/square) | one random point per rows×cols cell | a fixed position per cell, or `fill` on the cell intersections | uniform over the whole quadrat |
| n-poly | one random point per equal-area piece | the centre of each equal-area piece | uniform over the whole quadrat |

`gridOrigin` picks where in each cell a grid point sits: the centre, one
of the four corners, or `fill`. **`fill` is different in kind** — points
go on the grid's *intersections* rather than inside its cells, so the
quadrat's own edges and corners are sampled. Keeping the sample count at
rows×cols then means the drawn grid has one fewer row and column of
cells: an R×C lattice of intersections is an (R−1)×(C−1) grid. A single
sample on an axis has no span to spread over, so it sits in the middle
rather than collapsing onto one edge.

A polygon has no rows×cols lattice — its equal-area pieces are the only
grid it has — so `gridOrigin` is meaningless there. The UI locks the
control to "centre" for n-poly and `defineBoundary` records `center`
regardless, rather than storing an origin that had no effect. `random`
is unstratified by design (points may clump), so it has no partition
and draws no grid lines.

Every mode yields exactly rows×cols points in the same index order
(`row * cols + col` for quads), so changing mode never renumbers a
quadrat's samples.

Grid/cut lines are only drawn when the layout re-derived from the
boundary, the stored seed and the quadrat's recorded mode matches the
stored sample coordinates exactly; otherwise nothing is drawn.

### Overlay legibility

Survey images are busy and low-contrast, and the overlay is often the
same hue as the substrate — amber sample points on a terracotta
settlement plate being the worst case. No choice of hue survives every
substrate, so legibility comes from **value contrast** instead: the whole
overlay group carries a zero-offset dark drop-shadow (a casing), and each
mark pairs a light fill with a dark rim. That reads on pale shell, dark
algae and rust alike without the overlay shouting.

Hierarchy, loudest first: the current sample > sample points > boundary >
grid, which is reference
only and therefore semi-transparent white rather than saturated. Palette
and sizes live in one place, `OVERLAY` in `packages/ui/src/canvas.ts`;
sizes are in display px at zoom 1 and are scaled by `overlayScale`.

The current sample is drawn as a crosshair and **no circle at all**: it is
the point being scored, so it has to be findable from across the image
while leaving the substrate under it visible. Each of its four arms runs
at full thickness from the tip inward, steps down to a hairline at its
midpoint, and carries that hairline the rest of the way to the centre.
That gives the open, four-tick look near the middle without an actual gap
— a gap would leave the exact position to the eye's guess. The step is
spread over a short ramp rather than a hard corner so it reads as
deliberate at any zoom. SVG stroke width cannot vary along a line, so
each arm is a polygon (`crosshairArms` in `canvas.ts`). The step only
reads if the outer width is well above the hairline width; a couple of
tenths of a pixel disappears into antialiasing.

Boundary vertex handles are drawn **only while the boundary is being
drawn**. Once it is committed they sit on top of the corner samples and
hide the substrate being scored, and the polygon already shows the shape.

### Selecting things on the canvas

Overlay marks are small — a sample point is a 7px dot — so hitting one
exactly is fiddly, especially on a trackpad in the field. Clicks are
therefore resolved against a pick radius far larger than the mark
(`OVERLAY.SAMPLE_PICK_RADIUS`). That immediately raises the problem the
naive approach gets wrong: when two enlarged hit areas overlap, SVG picks
whichever element was painted last, not the one the user aimed at.

`Picker` (`packages/ui/src/selection.ts`) resolves overlaps **by
distance**, so the nearest target always wins regardless of render order,
with exact ties broken deterministically. It is generic over the target
type so every selectable overlay goes through the same rule — sample
points today, boundary vertices or annotations later — rather than each
growing its own hit-testing. Sample circles are `pointer-events: none`;
the canvas owns the click. Distances are measured in display px for the
same reason angles and lengths are (see Drawing modes).

### Selection must not rest on colour alone

Species buttons take their selected and unselected colours from the
user's own CSV, where the two can be near-identical shades. Selection is
therefore also carried by a contrasting ring, a lift and full opacity
(`SpeciesTab.vue`), plus `aria-pressed` for assistive tech — so the state
reads at a glance whatever palette a survey uses. The emphasis stays
outside the button: anything drawn inside it competes with the label at
85×40.

### Drawing modes

`quad` completes on the fourth click, `square` on the **second** (the
first side fixes the square, built at a right angle to it, clockwise on
screen), `n-poly` on a click back on the first node (≥3 nodes, legacy
0.025-per-axis tolerance). A dashed rubber band previews where the next
vertex lands — in square mode, the whole square.

Holding Ctrl snaps the segment to 15° steps and, from the third vertex
of a quad or polygon, matches the previous segment's length. **Both are
computed in display pixels, never in normalized coordinates**:
normalized 0–1 coordinates are anisotropic whenever the image is not
square, so an angle or length measured there does not match what the
user sees, and a "square" would come out a rectangle. The fitted
display box preserves the image aspect and zoom scales uniformly, so
display px is a uniform scaling of image px. In n-poly mode the close
test runs on the *constrained* point, so a length lock can put the
first node out of reach — releasing Ctrl closes the ring.

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

### Desktop shell security posture

The legacy shell ran with `nodeIntegration: true` and no context
isolation — components `require()`d `fs`/`electron` directly, so any
XSS or compromised renderer dependency was arbitrary code execution.
The new shell (`apps/desktop`) closes this with three layers:
`nodeIntegration: false` (renderer is pure web code),
`contextIsolation: true` (only the `contextBridge`-published
`window.quadrator` API is reachable), and `sandbox: true` (OS-level
Chromium sandbox). All dialogs and file I/O live in the main process
behind the enumerated IPC channels in `channels.ts`; local images are
streamed via the custom `qimg://local/?path=…` protocol instead of
weakening `webSecurity`.

The `qimg` handler and the `image:load` channel only serve paths on a
main-process **allowlist**, populated exclusively by user action:
images picked in a dialog, the relink dialog, image paths named in a
session file the user opened, and (so "Continue Last Session" works
after a restart) paths in the autosaved snapshot loaded from the
settings document. Everything else gets a 403 — verified against the
packaged build. Residual (accepted): a compromised renderer could
write a crafted snapshot via `settings:save` and have its paths
authorized on the *next* launch; scoping that further would mean the
main process validating session provenance, which the threat model
doesn't currently justify.

### Desktop window chrome

The shell installs **no application menu** (`Menu.setApplicationMenu(null)`
in `createWindow`). Electron's default menu was never customized, and its
View roles — Reload, Force Reload, Zoom — are actively harmful here: a
reload discards the in-memory session, and page zoom desyncs the canvas
from its fitted-pixel coordinate math. Nothing else in the default menu is
part of the workflow; the app's own actions live in `MenuButtons` on the
Image Prep tab.

Removing the menu also removes the accelerators it owned, so DevTools is
re-registered directly on the window via `before-input-event` (F12 and
Ctrl+Shift+I). That is deliberately the only shortcut restored — Reload
stays gone. Note the trade-off if macOS is ever shipped: on darwin the
clipboard accelerators (Cmd+C/V/A) come from the Edit menu role, so a mac
build would need a minimal `[{role:'appMenu'},{role:'editMenu'}]` instead
of `null`.

Cloud features (later phases) are **provider-agnostic**: a small sync
interface (auth, blob storage for images, document storage for
sessions) with pluggable backends, so no vendor is load-bearing.
The concrete Phase 4 architecture — stack, data model, cost curve,
security posture — is decided in [`CLOUD.md`](CLOUD.md); none of it is
built yet.

## 4. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Data-safety hotfixes on the legacy app; capture real fixture files; initial unit suite | **Done** |
| 1 | Extract `@quadrator/core` (geometry, sampling, CSV, species, versioned sessions) with full test suite; npm workspaces; CI typecheck gate | **Done** |
| 2 | `packages/ui` (Vue 3/Vuetify 3/Pinia) + `apps/desktop` (current Electron, context isolation, PlatformAdapter); legacy `src/` retired at cutover; pnpm migration; ESLint flat config with TS support | **Done** (July 2026) — see "Phase 2 close-out" below for what shipped at cutover |
| 3 | `apps/web`: browser adapter, static hosting, Playwright E2E suite | **Done** (July 2026) — see "Phase 3 close-out" below |
| 4 | Cloud sync (provider-agnostic), shared species libraries, multi-device sessions | Planned — architecture decided in [`CLOUD.md`](CLOUD.md), nothing built |

### Phase 2 close-out (shipped July 2026)

1. **Packaging** — `apps/desktop` is packaged by electron-builder
   (config in its `package.json` `build` field; icons in
   `apps/desktop/build/`; AppImage/nsis/dmg targets). `build.mjs`
   snapshots the built UI into `apps/desktop/renderer/`, which ships
   inside the asar; unpackaged runs load `packages/ui/dist` directly so
   they are never stale. Verified end-to-end against the packaged
   Linux binary (boot, session restore, `qimg://` serving and 403s).
2. **Acceptance** — passed (full tagging-session review by the primary
   user against the working build).
3. **Cutover cleanup** — legacy `src/`, `tests/unit/`, `public/` and
   the Vue CLI/webpack/Vue 2 toolchain deleted (`tests/fixtures/` kept
   forever — core migration tests anchor on it); `qimg` allowlist
   hardening applied (see §2); pnpm workspaces (`pnpm-workspace.yaml`;
   dependency build scripts gated by `allowBuilds`); ESLint flat
   config (`eslint.config.mjs`, typescript-eslint + `vue/essential`
   parity with the legacy lint level) over `packages/` and `apps/`;
   AGENTS.md gate and CI rewritten for the new toolchain.

### Phase 3 close-out (shipped July 2026)

The UI was already platform-clean, so web came down to one adapter plus
a thin entry and an E2E suite:

1. **`BrowserPlatformAdapter`** (`packages/ui/src/platform/browser.ts`)
   — two runtime modes chosen by capability. On Chromium it uses the
   File System Access API (real open/save pickers, `canOverwrite: true`
   so Save rewrites the picked file). Elsewhere it falls back to
   `<input type=file>` for opening and a download for saving
   (`canOverwrite: false`, so the UI always saves via `saveSessionAs`,
   and a download exposes no cancel signal so save/export always
   "succeed"). `persistentFileIds: false` in both modes — `web:<n>` ids
   die with the page, and reopened sessions recover images through the
   existing relink flow. Settings (including the autosave snapshot)
   persist to `localStorage`. File-dialog, downloader, and storage are
   injectable for unit tests. One subtlety: the download fallback
   revokes its object URL on a **deferred** timer — a synchronous revoke
   can cancel the download before Chromium starts it.
2. **Shared bootstrap** — `createQuadratorApp(adapter)`
   (`packages/ui/src/app.ts`) builds the Pinia + Vuetify app once;
   `apps/desktop` and `apps/web` differ only in which adapter they
   construct. `apps/web` is a static Vite build (`base: './'`) with no
   server component.
3. **Playwright E2E** (`apps/web/e2e/`, `testIdAttribute: 'data-test'`)
   — drives the adapter's **fallback** mode (the FS Access pickers can't
   be automated; an init script deletes them before the app loads so the
   adapter detects fallback capabilities at construction). Covers the
   golden path (draw → tag → export with an exact CSV assertion),
   QA-table/hotkey behavior, session save→reload→relink round-trip, and
   the autosave "Continue Last Session" recovery. Menu actions live on
   the Image Prep tab, so download flows switch to `tab-prep` first.

Legacy components deliberately **not** ported (dead code, never
mounted): `ZoomPanel.vue`, `TopBar.vue`, `HelloWorld.vue`. Deviations
from legacy, all documented in place: CSV export writes a complete
file instead of appending (`packages/ui/src/export.ts`); polygon close
needs ≥3 nodes; duplicate image paths get separate quadrats; autosave
also writes the trailing edit.

Known geometry limitation (found by property testing at cutover): for
some concave rings and target fractions **no single straight cut**
between two boundary edges can carve off the target area — a
mathematical property of single-cut partitioning, not a numerical bug.
`splitByArea` throws a typed `GeometryError` (the legacy library
silently returned a wrong partition here — audit B9), the UI rejects
the drawn boundary and leaves the quadrat untouched, and the user
redraws. Pinned counterexample in `packages/core/tests/split.spec.ts`;
the property tests treat this outcome as a documented pass. A fallback
partitioning strategy (e.g. multi-segment cuts) is a possible future
enhancement if field use ever hits it.

Future feature aims (design hooks exist; build later): reproducible
resampling from stored seeds, annotation overlays, per-project species
libraries, collaborative review of tagged quadrats, and statistical
summaries beyond per-quadrat coverage.

## 5. Testing strategy

Current state: unit suites for core (≥95% statement coverage enforced
as a floor), including fast-check property tests; component suites for
every Vue 3 component (stores, tabs, panels, and the image canvas —
happy-dom, `InMemoryPlatformAdapter`, injected image sizer; conventions
in AGENTS.md). E2E tests (Playwright, against the web build) cover the
golden path, session round-trip, crash-recovery, and the sampling/shape
controls (`apps/web/e2e/`).
Visual verification of the desktop shell uses the `QUADRATOR_SHOT`
screenshot hook rather than a snapshot suite (it works against the
packaged binary too).

Planned, in rough order of value:

1. **Coverage institutionalized**: `@vitest/coverage-v8` as a
   devDependency, `test:coverage` script, CI threshold on
   `packages/core/src`. **Done** — CI runs `pnpm test:coverage`, so the
   floor is enforced rather than merely configured.
2. **Property-based tests** (fast-check) on `splitByArea` and
   serialization round-trips: random simple polygons/sessions, assert
   invariants (piece areas sum to total; cut endpoints on the ring;
   parse∘serialize = identity). **Done** — see
   `packages/core/tests/property.spec.ts`; counterexamples get pinned
   as example-based regressions when found.
3. **Component tests** (Vitest + @vue/test-utils + happy-dom) alongside
   each new Vue 3 component: species-button/store sync, hotkey gating
   while inputs are focused, QA-table behavior, tab gating, canvas
   drawing/tagging flows. **Done** — maintained as a standing practice,
   not a phase.
4. **E2E** (Playwright against the web build). **Done** for the core
   flows (`apps/web/e2e/`): golden path draw→tag→export with an exact
   CSV assertion (polygon mode), session save→reload→relink round-trip,
   QA-table/hotkey behavior, square/regular-grid and random sampling
   driven through the real selects, and autosave "Continue Last Session"
   recovery. Runs in the adapter's download/`<input>` fallback mode
   (FS Access pickers can't be automated). Not yet covered:
   multi-image navigation with duplicate filenames, full species-CSV
   lifecycle, zoom/pan coordinate transforms, and an Electron smoke
   test for shell/preload wiring.
5. **Nice-to-have**: SVG snapshot tests of sampled layouts (geometry
   regressions become visible diffs); one-off mutation testing (Stryker)
   on core to find non-constraining assertions.

Standing practice: when a real-world session file in an older format
surfaces, add a sanitized copy to `tests/fixtures/` so every format
ever produced stays load-tested.
