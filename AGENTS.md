# AGENTS.md — Agent Onboarding

Quadrator is a desktop research tool for quadrat-based species surveys:
load an image, define the quadrat boundary (4-corner quad or free
polygon), generate randomized sample points within it, tag species at
each point, and export results as CSV. Output feeds scientific
analysis — **silent data corruption is the worst possible failure
class**. Prefer loud, typed errors over degraded results.

Companion docs (read before non-trivial work):

- [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md) — code style and technical requirements.
- [`docs/DESIGN.md`](docs/DESIGN.md) — architecture, domain model, roadmap.

## Hard rules

1. **Never run `git commit`, `git push`, `git reset`, or anything that
   writes history or remotes.** Stage changes (`git add`) and stop; the
   maintainer reviews and commits all work.
2. **Every change passes the full gate below** before it is considered
   done.
3. **No data-shape changes without a versioned migration + tests**
   against the real fixture files in `tests/fixtures/`.

## Verification gate (all must pass)

```
pnpm test                              # Vitest: core + ui suites
pnpm typecheck                         # tsc/vue-tsc strict over all workspaces
pnpm lint                              # ESLint 9+ flat config over packages/ and apps/
pnpm --filter @quadrator/ui build \
  && pnpm --filter @quadrator/desktop dist:dir   # proves the desktop app still packages
```

Other commands:

- `pnpm test -- --project ui` (or `core`) — run one Vitest project;
  `pnpm test:watch` for watch mode. Projects are defined in the root
  `vitest.config.js`; the ui workspace has its own
  `packages/ui/vitest.config.ts` (for `@vitejs/plugin-vue`).
- `pnpm dev:ui` — the UI in a browser on the in-memory adapter (Vite
  dev server, no Electron needed).
- `pnpm dev:desktop` — build the UI and launch it in the Electron
  shell. `pnpm --filter @quadrator/desktop dev` instead loads from a
  running Vite dev server (`QUADRATOR_DEV_URL`).
- `pnpm package:desktop` — build the full distributable
  (`apps/desktop/release/`, AppImage on Linux). `dist:dir` builds the
  unpacked directory only, which is faster and what the gate uses.

## UI test conventions (`packages/ui/tests/`)

- Default environment is `node`; component tests opt in with
  `// @vitest-environment happy-dom` at the top of the file.
- Every test builds a fresh store world: `setActivePinia(createPinia())`
  in `beforeEach`, then mount with `createAppVuetify()` and provide an
  `InMemoryPlatformAdapter` under `platformKey`. Never touch the real
  filesystem — script the adapter (`queueSessionOpen`, `queueSaveTarget`,
  `addImage`, `queueRelink`, …) and assert on `savedSessions` etc.
- Components are queried via `data-test` attributes, not classes or
  Vuetify internals. New interactive elements get a `data-test`.
- happy-dom cannot load images or measure layout. Canvas tests inject a
  stub sizer via `imageSizerKey` (from `src/canvas.ts`) and rely on the
  component's 800×600 fallback container: with a 4:3 stub image the
  fitted SVG is exactly 800×600, so a click at normalized `(nx, ny)` is
  `clientX = nx*800, clientY = ny*600` (`getBoundingClientRect()` is all
  zeros in happy-dom). See the header comment in
  `tests/image-canvas.spec.ts` before changing this.
- Canvas math (fit/transform/tolerance/palette) is pure and DOM-free in
  `src/canvas.ts`, tested directly in `tests/canvas-math.spec.ts` —
  extend it there rather than inside the component.
- Sampling determinism: pass an explicit seed
  (`store.defineBoundary(ring, 42)`) and assert exact regeneration;
  never assert on unseeded output.

## Desktop diagnostics (env vars on `apps/desktop`)

- `QUADRATOR_DEV_URL=<url>` — load the renderer from a Vite dev server
  instead of the built UI.
- `QUADRATOR_SMOKE=1` — exit right after the window loads (CI smoke).
- `QUADRATOR_SHOT=<path.png>` — capture the rendered window to a PNG,
  then exit. `QUADRATOR_SHOT_SCRIPT=<js>` runs a script in the page
  first (seed stores, dispatch synthetic events) — this is how canvas
  changes are verified visually against the real shell. Works against
  the packaged binary too (`apps/desktop/release/linux-unpacked/quadrator`).
- In dev builds the page exposes `window.__quadratorPinia` for
  inspecting/seeding stores from shot scripts or the console.

## Repository layout

| Path | Contents |
|---|---|
| `packages/core/` | **`@quadrator/core`** — platform-free domain logic in strict TypeScript (geometry, sampling, CSV export, species parsing, versioned session schema). No build step; consumed as source. All new domain logic goes here. |
| `packages/core/tests/` | Core test suite (Vitest, TS), including fast-check property tests. |
| `packages/ui/` | **`@quadrator/ui`** — Vue 3 + Vuetify 3 + Pinia UI layer (Vite). Platform I/O only through the `PlatformAdapter` interface from core; tests use `InMemoryPlatformAdapter`. |
| `apps/desktop/` | **`@quadrator/desktop`** — Electron shell (context isolation + sandbox). Main process owns fs/dialogs behind an image-path allowlist; preload exposes the adapter bridge on `window.quadrator`. electron-builder config lives in its `package.json` (`build` field); icons in `build/`. |
| `tests/fixtures/` | Real session files and species CSVs. These anchor migration tests forever; add sanitized real-world files here, never delete. |
| `docs/` | Project documentation. |

The legacy Vue 2/Electron 13 app (`src/`, Vue CLI toolchain) was
retired at the Phase 2 cutover (July 2026); recover it from git history
if ever needed.

## Toolchain constraints (deliberate — do not "modernize" ad hoc)

- **pnpm workspaces** (`pnpm-workspace.yaml`). Dependency build scripts
  are blocked by default; the `allowBuilds` list there is the only
  place to grant exceptions.
- Vitest 4 runs core's TypeScript natively — do not add a build step
  or emit artifacts from `packages/core`.
- `apps/desktop` bundles main + preload with esbuild (`build.mjs`)
  because core is consumed as TS source; type safety comes from
  `tsc --noEmit`. The built UI is snapshotted into
  `apps/desktop/renderer/` for packaging; unpackaged runs load
  `packages/ui/dist` directly.
- Root `package.json` version is the app version shown in the UI
  footer; keep `apps/desktop/package.json` (what packaged builds
  report) in sync when bumping.

## Working conventions

- Match the surrounding code's style (see STYLE_GUIDE).
- New behavior lands with tests that assert invariants or exact
  expected output, in the suite adjacent to the code.
- Determinism is injected: randomness enters only via an `Rng`
  function parameter (`mulberry32(seed)` in tests).
- When a spec and real fixture data conflict, preserving user data
  wins; document the deviation.
