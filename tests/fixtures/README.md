# Test fixtures

Frozen copies of real data files in the **current (v0, unversioned) formats**.
These anchor the migration tests planned in `July2026Plan.md` §4: the new
`core/serialization` code must load these files forever (via the v0→v1
migration), and the CSV exporter tests use `buttons.csv` as a realistic
species list.

- `session-v0.json` — a saved session (from `src/assets/test.json`): one image,
  4-node quadrat geometry, 25 samples. Windows-style absolute image paths are
  intentional — that's what real v0 sessions contain.
- `buttons.csv` — a real species list (`code,species,group1,group2,color,colorSelected`).

**TODO (Dan):** add 2–3 more session files from actual tagging use, ideally
including a polygon-mode (non-rectangular) quadrat and a multi-image session
with tagged samples. Copy them here as `session-v0-*.json` before the Phase 1
core extraction begins. Do not edit fixtures after they land.
