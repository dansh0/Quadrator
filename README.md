# Quadrator - Quadrat Analysis Tool

Tool for quadrat-based species surveys: define a quadrat boundary on a
survey image, generate randomized sample points, tag species at each
point, export per-quadrat counts and coverage as CSV.

It ships as two shells over one shared UI and domain core: an Electron
**desktop** app (`apps/desktop`) and a static **web** app (`apps/web`,
no backend). Sessions and CSVs are files either way.

See [`AGENTS.md`](AGENTS.md) for the full command reference and
[`docs/DESIGN.md`](docs/DESIGN.md) for architecture and roadmap.

## Project setup

```
pnpm install
```

## Development

```
pnpm dev:ui        # UI in a browser (in-memory platform, file pickers inert)
pnpm dev:web       # the web app (real browser file pickers)
pnpm dev:desktop   # build the UI and launch the Electron shell
```

## Tests & checks

```
pnpm test           # Vitest: core + ui
pnpm test:coverage  # same, with the core coverage floor enforced
pnpm typecheck      # tsc/vue-tsc, all four workspaces
pnpm lint
pnpm --filter @quadrator/web e2e   # Playwright (needs a Chromium install once)
```

## Package the desktop app

```
pnpm package:desktop   # distributable in apps/desktop/release/
```
