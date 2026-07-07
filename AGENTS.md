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
2. **The legacy app must keep working.** Any change is verified by the
   full gate below before it is considered done.
3. **No data-shape changes without a versioned migration + tests**
   against the real fixture files in `tests/fixtures/`.

## Verification gate (all must pass)

```
npm test                        # Vitest: legacy + core + ui suites
npm run typecheck               # tsc/vue-tsc strict over all workspaces
npm run lint                    # ESLint over src/ (legacy only)
npm run electron:build -- --dir # proves the legacy desktop app still packages
```

Other commands:

- `npm test -- --project ui` (or `legacy+core`) — run one Vitest
  project; `npm run test:watch` for watch mode. Projects are defined in
  the root `vitest.config.js`; the ui workspace has its own
  `packages/ui/vitest.config.ts` (needs `@vitejs/plugin-vue` — root vue
  is v2).
- `npm run dev:ui` — new UI in a browser on the in-memory adapter
  (Vite dev server, no Electron needed).
- `npm run dev:desktop` — build the new UI and launch it in the new
  Electron shell. `npm -w @quadrator/desktop run dev` instead loads
  from a running Vite dev server (`QUADRATOR_DEV_URL`).
- `npm run electron:serve` — run the legacy desktop app.

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
  instead of `packages/ui/dist`.
- `QUADRATOR_SMOKE=1` — exit right after the window loads (CI smoke).
- `QUADRATOR_SHOT=<path.png>` — capture the rendered window to a PNG,
  then exit. `QUADRATOR_SHOT_SCRIPT=<js>` runs a script in the page
  first (seed stores, dispatch synthetic events) — this is how canvas
  changes are verified visually against the real shell.
- In dev builds the page exposes `window.__quadratorPinia` for
  inspecting/seeding stores from shot scripts or the console (the
  legacy app exposed `window.fstore` the same way).

## Repository layout

| Path | Contents |
|---|---|
| `src/` | **Legacy app** — Vue 2.6 + Vuetify 2 + Vuex 3 + Electron 13, built by Vue CLI 5/webpack. Being replaced; keep changes minimal and behavior-preserving. |
| `src/assets/poly-split-js-master/` | Vendored polygon-split library. Known-buggy; superseded by `packages/core` but still imported by the legacy app — do not delete or "fix". |
| `packages/core/` | **`@quadrator/core`** — platform-free domain logic in strict TypeScript (geometry, sampling, CSV export, species parsing, versioned session schema). No build step; consumed as source. All new domain logic goes here. |
| `packages/core/tests/` | Core test suite (Vitest, TS), including fast-check property tests. |
| `packages/ui/` | **`@quadrator/ui`** — Vue 3 + Vuetify 3 + Pinia UI layer (Vite). Platform I/O only through the `PlatformAdapter` interface from core; tests use `InMemoryPlatformAdapter`. Replaces `src/` at Phase 2 cutover. |
| `apps/desktop/` | **`@quadrator/desktop`** — Electron shell (current major, context isolation + sandbox). Main process owns fs/dialogs; preload exposes the adapter bridge on `window.quadrator`. `npm run dev:desktop` builds the UI and launches it. |
| `tests/unit/` | Legacy test suite (Vitest, JS). |
| `tests/fixtures/` | Real session files and species CSVs. These anchor migration tests forever; add sanitized real-world files here, never delete. |
| `docs/` | Project documentation. |

## Toolchain constraints (deliberate — do not "modernize" ad hoc)

- **npm workspaces, not pnpm.** The legacy webpack toolchain needs
  npm's hoisted layout. pnpm arrives with the UI rewrite (see DESIGN).
- **ESLint 7 cannot parse TypeScript**, so `packages/` is in
  `.eslintignore`; core is covered by `tsc --noEmit` strict + tests.
- **Node/OpenSSL 3 shim**: `vue.config.js` maps md4→sha256 for webpack.
  Leave it until the webpack toolchain is retired.
- Vitest 4 runs core's TypeScript natively — do not add a build step
  or emit artifacts from `packages/core`.

## Working conventions

- Match the surrounding code's style; legacy `src/` and `packages/core`
  follow different rules (see STYLE_GUIDE).
- New behavior lands with tests that assert invariants or exact
  expected output, in the suite adjacent to the code.
- Determinism is injected: randomness enters only via an `Rng`
  function parameter (`mulberry32(seed)` in tests).
- When a spec and real fixture data conflict, preserving user data
  wins; document the deviation.
