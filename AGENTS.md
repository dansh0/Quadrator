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
npm test                        # Vitest: legacy + core suites
npm run typecheck               # tsc strict over @quadrator/core
npm run lint                    # ESLint over src/ (legacy only)
npm run electron:build -- --dir # proves the desktop app still packages
```

Other commands: `npm run electron:serve` (run the desktop app),
`npm run test:watch`.

## Repository layout

| Path | Contents |
|---|---|
| `src/` | **Legacy app** — Vue 2.6 + Vuetify 2 + Vuex 3 + Electron 13, built by Vue CLI 5/webpack. Being replaced; keep changes minimal and behavior-preserving. |
| `src/assets/poly-split-js-master/` | Vendored polygon-split library. Known-buggy; superseded by `packages/core` but still imported by the legacy app — do not delete or "fix". |
| `packages/core/` | **`@quadrator/core`** — platform-free domain logic in strict TypeScript (geometry, sampling, CSV export, species parsing, versioned session schema). No build step; consumed as source. All new domain logic goes here. |
| `packages/core/tests/` | Core test suite (Vitest, TS). |
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
