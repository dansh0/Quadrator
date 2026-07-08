# Quadrator - Quadrat Analysis Tool

Desktop tool for quadrat-based species surveys: define a quadrat
boundary on a survey image, generate randomized sample points, tag
species at each point, export per-quadrat counts and coverage as CSV.

See [`AGENTS.md`](AGENTS.md) for the full command reference and
[`docs/DESIGN.md`](docs/DESIGN.md) for architecture and roadmap.

## Project setup

```
pnpm install
```

## Development

```
pnpm dev:ui        # UI in a browser (in-memory platform, no Electron)
pnpm dev:desktop   # build the UI and launch the Electron shell
```

## Tests & checks

```
pnpm test
pnpm typecheck
pnpm lint
```

## Package the desktop app

```
pnpm package:desktop   # distributable in apps/desktop/release/
```
