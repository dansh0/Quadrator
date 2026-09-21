# Style Guide & Technical Requirements

Two regimes coexist. Domain logic goes in `packages/core` under the
strict, platform-free regime; the UI layer and the two app shells follow
the shell regime in §2. All new domain logic belongs in core.

## 1. `packages/core` (`@quadrator/core`) — strict regime

### Language & module rules
- TypeScript, `strict: true` **plus** `noUncheckedIndexedAccess` and
  `noImplicitOverride`. `tsc --noEmit` must stay clean.
- Pure ESM (`"type": "module"`). Relative imports include the `.ts`
  extension (`moduleResolution: "bundler"` + `allowImportingTsExtensions`).
- No build step, no emitted artifacts; the package is consumed as source
  (`main`/`exports` point at `src/index.ts`).
- Public API is re-exported exclusively through `src/index.ts` with
  explicit named exports. Consumers import from the package root only.

### Platform independence (the defining constraint)
- **No platform APIs in `packages/core/src/`**: no `fs`, `path`, Electron, DOM, or
  globals beyond the ECMAScript standard library. Core must run
  unchanged in Node, browsers, and workers. (Tests may use `node:fs`
  for fixtures.)
- No I/O, no clocks, no randomness hidden inside logic. Inject them:
  randomness as an `Rng = () => number` parameter, time as an optional
  `now: Date` parameter with a default.

### Data & errors
- Validate every external boundary (file contents, user-supplied JSON,
  CSV text) with zod. Internal schemas are `.strict()`; schemas for
  legacy/foreign formats are lenient (`.passthrough()`, optionals).
- Failures throw typed errors (`GeometryError`, `CsvParseError`,
  `ZodError`) with actionable messages. Never return partially valid
  results or silently degrade.
- Geometry conventions: rings are **open** (no repeated last vertex),
  `Vec2 {x, y}`, tolerance comparisons use `GEOM_EPS = 1e-6`. Convert
  closed rings at the boundary (migration), not inside algorithms.

### Dependencies
- Adding a runtime dependency to core requires strong justification;
  it must itself be platform-free. Current allowance: `zod`.

## 2. `packages/ui` and `apps/*` — shell regime

- Vue 3.5 SFCs with `<script setup lang="ts">`, Vuetify 3, Pinia 3,
  Vite. Composition API throughout; no Options API in new components.
- TypeScript with the same strictness as core (`vue-tsc --noEmit` must
  stay clean in every workspace). ESLint 10 flat config
  (`eslint.config.mjs`, typescript-eslint + `vue/flat/essential`).
- **Platform I/O only through `PlatformAdapter`.** No `fs`, no Electron
  imports, no `window.quadrator` reach-through in `packages/ui` — the
  same UI has to run in Electron, in a browser, and against
  `InMemoryPlatformAdapter` in tests. Shell-specific code lives in
  `packages/ui/src/platform/` (one adapter per target) and in
  `apps/desktop/src/` (main + preload).
- Keep math and drawing rules pure and DOM-free in
  `packages/ui/src/canvas.ts` rather than inside components, so they
  are testable without happy-dom.
- Every interactive element gets a `data-test` attribute; component
  tests and the Playwright suite select on those, never on classes or
  Vuetify internals.
- The Electron main process owns all filesystem and dialog access and
  serves images only through the `qimg://` allowlist; the renderer
  stays sandboxed with context isolation (`DESIGN.md` §2).

## 3. Tests (both regimes; Vitest 4)

- Every behavior change ships with tests. Tests assert **behavior**:
  exact expected values, or invariants (e.g. "split pieces sum to the
  total area ± tolerance", "all sample points lie strictly inside").
  No "renders without crashing" rituals.
- Deterministic by construction: seed randomness via `mulberry32(seed)`
  from the test helpers; identical seeds must produce identical output.
- Serialization work must include round-trip assertions
  (`parse(serialize(x))` deep-equals `x`) and hostile-input cases
  (malformed JSON, wrong shapes, unknown versions → typed errors).
- Real-world files in `tests/fixtures/` are load-bearing: never edit or
  delete them; add new sanitized real files as formats evolve.
- Coverage target for `packages/core/src`: ≥ 95% statements. Coverage
  is a floor, not a goal — delete tests that assert nothing.

## 4. Documentation & comments

- Comments state constraints and non-obvious reasoning (e.g. why a
  legacy convention is preserved), not narration of the code.
- Ported third-party code keeps a license/attribution header noting
  origin and any intentional corrections.
- User-visible data formats (session schema, CSV columns) are treated
  as public API: changes require a schema version bump, migration, and
  documentation in `DESIGN.md`.
