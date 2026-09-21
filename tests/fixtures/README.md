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

## v1 — the format the app writes today

- `session-v1-multi-image.json` — `session-v0-multi-image.json` migrated and
  saved (with a fixed `savedAt` so the file is stable). Holds both boundary
  kinds (a 4-vertex quad and a 7-vertex polygon), 50 samples and 8 tagged
  points. It pins the v1 *reader* against a file on disk, so a future schema
  version cannot quietly stop loading current saves.

  Regenerate only if the v1 serializer changes shape — and if it does, that
  is a schema version bump plus a migration, not an edit to this file.

## Species list

- `buttons.csv` — a real species list
  (`code,species,group1,group2,color,colorSelected`).
