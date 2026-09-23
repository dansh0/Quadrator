# Test fixtures

Frozen copies of real data files. These are load-bearing: the
`core/serialization` code must keep loading every one of them forever, and
the CSV exporter tests use `buttons.csv` as a realistic species list.
**Never edit or delete a fixture** — add new ones as formats evolve
(`docs/STYLE_GUIDE.md` §3).

## v0 — the legacy, unversioned format

Written by the retired Vue 2 app. These anchor the v0 → v1 migration
(`packages/core/tests/migrate.spec.ts`).

- `session-v0.json` — one image, a 4-node quadrat, 25 samples. Predates the
  `geoDefined` flag, so it also pins the "infer the boundary from the ring"
  rule. Windows-style absolute image paths are intentional — that is what
  real v0 sessions contain.
- `session-v0-polygon.json` — a polygon-mode (non-rectangular) quadrat.
- `session-v0-multi-image.json` — a multi-image session with tagged samples.

## v1 — the previous versioned format

- `session-v1-multi-image.json` — `session-v0-multi-image.json` migrated and
  saved (with a fixed `savedAt` so the file is stable). Holds both boundary
  kinds (a 4-vertex quad and a 7-vertex polygon), 50 samples and 8 tagged
  points. Pins the v1 → v2 upgrade against a real file.

## v2 — the format the app writes today

- `session-v2-multi-image.json` — the v1 fixture above, upgraded and saved.
  Adds the sampling controls: `sampling`, `shape` and `gridOrigin` on the
  settings and on every quadrat. Pins the v2 *reader* and the exact
  serializer output (the round-trip test compares bytes), so a future schema
  version cannot quietly stop loading current saves.

  Neither file is regenerated when the format changes: a format change means
  a new `schemaVersion`, a migration and a NEW fixture beside these.

## Species list

- `buttons.csv` — a real species list
  (`code,species,group1,group2,color,colorSelected`).
