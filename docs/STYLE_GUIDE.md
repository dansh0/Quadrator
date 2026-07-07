# Style Guide & Technical Requirements

Two regimes coexist. New domain logic goes in `packages/core` under the
strict regime; the legacy app in `src/` is maintenance-only.

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
- **No platform APIs in `src/`**: no `fs`, `path`, Electron, DOM, or
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

## 2. Legacy app (`src/`) — maintenance regime

- Vue 2.6 SFCs, Vuetify 2, Vuex 3, Options API, ESLint 7
  (`plugin:vue/essential` + `eslint:recommended`). Match existing style.
- Bug fixes and safety fixes only; no refactors, no new features, no
  dependency upgrades. The codebase is scheduled for replacement
  (see `DESIGN.md`).
- Do not modify `src/assets/poly-split-js-master/` (vendored, replaced
  by core, still imported by the running app).

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
