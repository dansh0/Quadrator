# Cloud Architecture (Phase 4)

> Status: **draft, uncommitted, decided.** The provider stack and the
> core infrastructure decisions below are settled (see §4). What remains
> open is application-level design (concrete table DDL, adapter method
> bodies, UI flows) and a few explicitly deferred items (§15). This
> document is written so a new developer or agent can pick up the cloud
> work with the same understanding the design conversation produced —
> read it top to bottom before touching cloud code.

---

## 1. Scope

Give Quadrator durable, multi-device, shareable cloud sessions and
image-backed data — without ever risking a surprise bill. Cloud is
**Phase 4** of the roadmap (`docs/DESIGN.md §4`); Phases 0–3 (core
extraction, Vue 3 UI, desktop shell, static web app) are done.

This document covers **cloud infrastructure and the provider split**.
It is deliberately not a feature spec — application behavior lives in
`docs/DESIGN.md`.

## 2. Constraints & priorities

- **No monetization; budget $0–30/month at <100 users.**
- **Image-heavy** (field JPEGs 5–20 MB), must be **fast worldwide**.
- **No attack or accident may cause runaway spend.** Prefer *structural*
  limits (zero-egress storage, flat pricing, hard ceilings) over
  reactive alerting.
- **Data safety is the top priority** (project-wide): never lose or
  silently corrupt user data; loud, typed errors over degraded results.
- **Low lock-in / easy exit** and **few accounts** (owner preference:
  keep it to ~3).
- **Cloud is additive**: the app always works fully client-side with
  zero backend; cloud is another `PlatformAdapter`, never load-bearing.

## 3. Principles

1. **Client-first.** Zero-backend operation is always supported; the
   cloud adapter is optional and swappable.
2. **Portable primitives.** Everything is built from standard, portable
   pieces — **Postgres** + **S3-compatible object storage** — so exit is
   `pg_dump` + copy a bucket, never a rewrite.
3. **Shared schema.** A cloud project and a local session file share the
   same core `serialization/` `v1` schema — sync is a serialization
   problem, not a new data model.
4. **Design around egress.** The heaviest, most abusable cost is bytes
   leaving the network; every choice is measured against it (§5).
5. **Capture primary data early, derive secondary data late.** Location
   is captured at ingest (unrecoverable if missed); embeddings are
   derived later from retained raw data (§8).

---

## 4. The chosen stack & provider split

**Three accounts, each doing what it is best at:**

| Concern | Provider | What it runs |
|---|---|---|
| **Data + identity + compute** | **Supabase** (Pro, $25/mo) | Managed **Postgres**, **Auth** (+ RLS), **Edge Functions**, **Queues** (`pgmq`), **`pg_cron`**, **Realtime**, **daily backups** |
| **Image bytes** | **Cloudflare** | **R2** (object storage, **zero egress**) + **CDN** + **Workers static assets** (static SPA hosting, free — Pages is maintenance-mode in 2026; use Workers for new projects) |
| **Transactional email** | **Resend** or **Postmark** | Magic-link / notification email (free tier ample at this scale) |

### Why this split (the reasoning a newcomer needs)

- **Egress is the crux.** Serving 5–20 MB images worldwide, billed
  *per view*, is unbounded and abusable — the single runaway-spend
  vector. A **zero-egress store (R2)** doesn't just make it cheaper, it
  **removes the amplification vector entirely**. This is the *only*
  reason Cloudflare is in the stack: **R2's sole job is zero-egress
  image delivery.** Do **not** move images to Supabase Storage — its
  metered egress reintroduces exactly the trap we're avoiding.
- **All compute stays on Supabase.** Because we pay for Supabase, its
  native compute + eventing is the default and Cloudflare compute is
  **not used near-term**. Supabase covers the growth wishlist natively:

  | Need | Supabase-native answer |
  |---|---|
  | Serverless functions | Edge Functions (Deno) |
  | Queueing | Supabase Queues (`pgmq` extension) |
  | Scheduled jobs | `pg_cron` |
  | Pub/sub | Realtime (broadcast/presence) + Database Webhooks |
  | Event-on-data-change | DB triggers → webhooks/functions |

  Keeping compute co-located with auth + DB (shared `auth.uid()`, direct
  DB access, RLS, one deploy) is a real DX win we would lose by
  scattering functions onto Cloudflare Workers.

- **Rejected alternatives (do not revisit without new reasons):**
  - **Firebase** — proprietary data model (hard exit) + metered egress
    with *alert-only* budgets (no hard cap). Fails the low-lock-in and
    no-runaway-spend requirements at once.
  - **Raw AWS/GCP** — most powerful, but CloudFront egress fees, Cognito
    friction, and complexity make $30/mo hard to hold and simplicity
    impossible. Ranked last on our criteria.
  - **Self-run VPS (Hetzner + R2)** — cheapest and lowest lock-in, but
    you own uptime/patching/backups *and* must build auth. Only wins if
    running infra is itself the goal; it is not here.

### The one Supabase compute gap

Heavy or long single jobs — a big session **zip**, batch **thumbnailing**,
future **ML/embeddings** — exceed Edge Function limits
(~**2 s CPU / 150 s wall / ~256 MB**), and Supabase has no
container/heavy-compute product. When that load actually arrives, add
**exactly one** heavy-compute worker:

- **Cloudflare Containers** (sits next to R2; configurable vCPU/mem/disk), or
- a tiny **Fly.io / Railway** container (scale-to-zero to stay near budget).

**Deferred — do not provision now.** R2's zero egress means image bytes
are free to pull to wherever this worker runs, so it is not
locality-constrained.

---

## 5. Cost model & curve

The stack is **flat and dominated by one fixed number** ($25/mo Supabase
Pro), with **no line item that can run away**.

| Stage | Supabase | R2 storage | Image backup (B2) | Email | **Total/mo** |
|---|---|---|---|---|---|
| Build / test (mo 0–2) | Free $0 | <10 GB → free | free (<10 GB) | free | **$0** |
| Launch (~5 users, ~20 GB) | Pro $25 | ~$0.15 | ~$0.12 | free | **~$25** |
| Growth (~25 users, ~60 GB) | Pro $25 | ~$0.75 | ~$0.36 | free | **~$26** |
| Scale (~100 users, ~200 GB) | Pro $25 | ~$2.85 | ~$1.20 | free | **~$29** |
| + heavy-compute worker (mid-term, optional) | +$5–10 | — | — | — | *~$34–39* |

(R2 operation charges are effectively free at this scale and omitted.
"Image backup" is the §6 second-copy replica, e.g. Backblaze B2 at
$0.006/GB-mo.)

Key facts:
- **The only step change is $0 → $25, triggered by needing _backups_,
  not usage.** Free tier is fine for build/test but **pauses after 7
  days of DB inactivity and has no backups** — go **Pro before real user
  data lands** (backups are non-negotiable for scientific data).
- Usage-based lines (R2 storage $0.015/GB-mo after 10 GB free; R2 ops;
  backup replica; email) stay in **single dollars to 100 users**.
  **There is no egress term on the image path** — image and archive
  bytes only ever leave via R2.
- **Supabase egress exists but cannot run away.** DB/API responses
  (session JSONB loads etc.) count against Supabase's metered egress
  (250 GB/mo included on Pro, $0.09/GB after) — tiny for document-sized
  payloads. More importantly, **Supabase Pro's Spend Cap is ON by
  default: quota overage is *disallowed*, not billed.** Keep it ON.
  With the cap on, the worst case under any load is degraded service,
  never a bill — exactly the §6 posture. (Corollary: never serve image
  or zip bytes through Supabase; they'd burn this quota. R2 only.)
- **What would break $30:** the optional heavy-compute worker, or R2
  storage reaching **~1.5–2 TB** (still linear/predictable, years away).
  Neither is a surprise.

## 6. Security & spend-safety posture

Each amplification vector → its structural defense:

| Vector | Defense |
|---|---|
| **Egress flooding** (re-download big images) | Zero-egress R2 (structural) + **access-controlled delivery** (see the image-delivery decision below) + rate limits |
| **Compute flooding** (spam a function/zip) | Auth-gate + rate-limit + **cache/idempotent** results per session-version |
| **Storage-fill** (garbage uploads) | Auth-gate uploads + **per-user storage quota** + max file size + content-type validation |
| **Bill explosion under load** | Flat-priced, zero-egress image path degrades rather than overspends; **Supabase Spend Cap ON** (overage disallowed, not billed — §5); watch R2 storage growth on a dashboard |
| **Data corruption/loss (DB)** | Versioned `v1` schema + zod validation on write + optimistic-concurrency version check (§7) + never-delete + daily Postgres backups (Supabase Pro) |
| **Data loss (image bytes)** | Supabase backups do **not** cover R2, and **R2 has no native object versioning** — the bucket alone is a single copy. **Nightly replication to a second bucket/provider** (e.g. `rclone` cron to Backblaze B2, ~$0.006/GB-mo) + scoped/write-only API tokens + periodic restore drill |

Two honesty notes a newcomer must absorb:

- **Rate limits and quotas here are app-enforced, not structural.**
  Supabase Edge Functions are not behind our Cloudflare zone, so no WAF
  sits in front of them; "rate-limit" means hand-rolled checks (e.g.
  Postgres counters) evaluated *before* minting any signed URL or
  starting any job. Quotas are checked at URL-minting time; and since a
  presigned PUT cannot enforce a size limit, **verify the object's
  actual size (HEAD) after upload before committing the DB row**.
- **The image-delivery decision (required before build step 4).**
  "Short-expiry presigned URLs + CDN caching" do not compose: presigned
  URLs hit the R2 storage endpoint and are unique per issue, so
  Cloudflare's cache is largely bypassed; cached delivery requires a
  custom domain on the bucket, and auth-gating *that* requires a small
  Worker. Short-expiry URLs also violate the `loadImage` contract
  ("URL stays valid until the adapter is disposed") — hours into a
  session, a browser re-fetch after cache eviction would 403. The two
  coherent options:
  1. **Private bucket, adapter-fetched `blob:` URLs** — the Edge
     Function mints a presigned GET, the adapter fetches the bytes and
     hands the UI a `blob:` URL. Simplest, honors the contract, strongest
     access control; forfeits CDN caching (acceptable at <100 users).
  2. **Public custom-domain bucket + tiny auth Worker + immutable
     content-addressed URLs** — full CDN caching, "fast worldwide";
     costs the one Worker we otherwise avoid.
  Start with (1); (2) is the upgrade path if image latency matters.

Authorization model: **Postgres Row-Level Security keyed on
`auth.uid()`** — a user can read/write only their own rows *by database
policy*, not by app code that might be wrong. This is the primary
data-isolation guarantee.

---

## 7. Data model — hybrid (relational is truth, JSONB is fast-save)

**Normalized relational columns are the source of truth; a JSONB copy of
the whole session is a fast-save convenience mirror.**

### Write path (client PUTs a whole `v1` session)

In **one transaction**, the server:
1. **Checks optimistic concurrency**: the client sends the session
   `version` it loaded; the transaction compares-and-swaps against the
   stored version. A stale write (another device saved in between) is
   **rejected loudly with a typed conflict error** — never silent
   last-write-wins — and the UI offers reload/merge. This is what makes
   "durable multi-device sessions" safe with a whole-document PUT.
2. **Validates** the payload against the `v1` zod schema
   (`packages/core/src/serialization/v1.ts`).
3. **Shreds** it into the **normalized tables** (the authoritative copy):
   `project → quadrat → sample → sample_tag`, plus species and settings.
4. **Stores the raw JSONB alongside** — a denormalized mirror and a
   byte-exact record of what the client sent.
5. On **any version/parse/validation failure, rejects the whole save
   loudly** — no half-written state. (This is the "never silently
   corrupt" rule enforced at the DB boundary.)

**JSONB-staleness rule:** the mirror is byte-exact only as long as every
write goes through this path. The day anything writes relational rows
directly (collaboration edits, server-side migrations), that write
**must regenerate — or at minimum version-stamp — the JSONB mirror** in
the same transaction, or reads of it become silently stale.

### Read path

Serve the **fresh JSONB** for fast whole-session loads, but the canonical
`v1` document can always be **reconstructed from the tables**; **if JSONB
and tables ever disagree, the tables win** (they are the constrained,
validated copy).

### Why hybrid, and why it is low-risk

- Near-term (single-user, multi-device) the JSONB path gives exact `v1`
  parity and fast delivery. Mid-term (orgs/projects, shared species
  libraries, collaboration, analytics) the relational columns earn their
  keep with cross-cutting queries, integrity constraints, and per-row RLS.
- The engine is **Postgres either way** — it is a first-class **document
  store** (`jsonb`) *and* a full **relational** engine, so the old
  "NoSQL vs SQL" question dissolves: no second database, no extra
  account. Evolving the model is an **in-database migration**, never a
  platform change.
- Migrations are already a **first-class, fixture-tested capability** in
  this repo (`packages/core/src/serialization/migrate.ts` +
  `tests/fixtures/`). Schema evolution rides those rails.

The core `v1` schema remains the **interchange format** (file save/load +
wire); the tables are the **server-side truth**. Both statements are
consistent.

Durable image references: cloud `FileRef.id`s persist across devices and
sessions, **fixing the web `relink` fragility** where `web:<n>` ids die
with the page (`packages/ui/src/platform/browser.ts`).

**Use content-hash object keys (SHA-256 of the bytes) as the cloud
`FileRef.id` / R2 key.** One decision buys four things: (a)
**cross-platform portability** — a `v1` file exported from the cloud and
opened on desktop (or vice versa) can match images by hash instead of
forcing a full relink, keeping `v1` an honest interchange format; (b)
**upload dedup** (the same field photo re-uploaded across sessions is
stored once); (c) **integrity verification** on every fetch; (d)
**immutable, cache-friendly URLs** (the §6 delivery option 2 depends on
this). Cheap to adopt at ingest now, painful to retrofit.

## 8. Geo (PostGIS) and vectors (pgvector)

The two have **opposite timing**, per Principle §3.5.

**PostGIS / geotagging — capture EARLY (now).** Location is **primary,
unrecoverable observational data**; you cannot back-fill where a survey
happened. Therefore, from day one:
- Add an optional `geography(Point)` column on the image/quadrat, plus a
  project/session-level default location ("tag the whole set at once").
- **Auto-extract EXIF GPS** from uploaded JPEGs at ingest — capture
  location for free before any map UI exists.
- Map views and spatial queries ("surveys within 5 km") can come later;
  the *data must land now*.
- **Location-privacy caveat:** precise coordinates of rare/endangered
  species are sensitive — standard ecology practice is to redact or fuzz
  them in shared data. Capture stays full-precision, but any *sharing*
  surface (zip archives, future collaboration) should eventually offer
  EXIF-strip / coordinate-fuzzing. Deferred (§15), but don't ship public
  sharing without deciding it.

**pgvector / embeddings — derive LATE (ML phase).** Embeddings are
**derived data**, **back-fillable anytime** from retained raw
images/tags, and **model-specific** (early commitment gets redone when
the model changes). They also need the deferred heavy-compute worker
(§4). Adopting later is trivially additive (`CREATE EXTENSION vector` +
an `embedding` column). The only "now" action is *retaining raw inputs*
— already guaranteed (images never deleted, tags stored).

## 9. Compute — what runs where

- **Session CRUD / API / light logic** → Supabase **Edge Functions**
  (or PostgREST + RLS directly where a function isn't needed).
- **Async work, fan-out, retries** → Supabase **Queues** (`pgmq`).
- **Schedules** (e.g. free-tier keep-alive if ever needed, housekeeping)
  → **`pg_cron`**.
- **Live updates / pub-sub** → **Realtime**.
- **Signed R2 upload/download URLs** → a small Edge Function that mints
  presigned URLs against the R2 bucket (S3-compatible API), after
  checking quota/rate counters (§6). **The API never proxies image
  bytes** — the browser uploads/downloads directly to/from R2 (delivery
  shape per the §6 image-delivery decision; after upload, verify object
  size before committing the DB row).
- **Session zip-download (near-term feature)** → generate the archive
  **into R2**, hand back a **short-lived signed URL**, let the CDN serve
  it; **stream** rather than buffer; **auth-gate + rate-limit** the
  trigger; cache/idempotent per session-version. If a session's images
  are large enough to exceed Edge Function limits, this is the first job
  that graduates to the **deferred heavy-compute worker** (§4).

## 10. Auth

**Supabase Auth — configured, not built.** Email/password, magic link,
OTP, and social OAuth are dashboard toggles + a few SDK calls; token
refresh and sessions are handled by the client SDK.
- **Social-first (Google) early** to avoid standing up email at all
  (magic-link/reset flows need the transactional-email account; social
  login does not). Email remains available and is budgeted regardless.
- Issues standard **JWTs**; **Postgres RLS consumes `auth.uid()`**
  directly (§6) — authorization lives in the database.
- **ORCID / scientific SSO**: not a preset; add later via generic
  OIDC/SAML when the open-tool audience arrives. Deferred.

## 11. Infrastructure as Code

Both providers are first-class Terraform targets, so the whole stack is
reproducible in code:
- **Cloudflare** Terraform provider — R2, Workers, DNS, Access, etc.
  (`wrangler.toml` also declaratively configures the static-asset
  Worker, and Workers/Containers if the heavy worker is later added
  there).
- **Supabase** Terraform provider — projects, auth settings, storage
  buckets, API config. **Pulumi** is an option if you'd rather write
  infra in TypeScript.

Recommendation: manage both from a single Terraform config as soon as
there's more than a couple of resources; keep secrets out of it.

## 12. The `CloudPlatformAdapter`

Cloud arrives as an adapter implementing the existing **`PlatformAdapter`**
contract (`packages/core/src/platform/adapter.ts`) — same conventions:
every method async; **user cancellation is a value** (`null`/empty
array), never an exception; failures throw **`PlatformIOError`**;
`FileRef.id` is the durable image identity persisted as
`QuadratV1.imagePath`.

Mapping the existing surface onto cloud, plus the additions:

- `openSession` / `saveSessionAs` / `saveSession` → session documents in
  Postgres (the §7 write/read paths). `capabilities.canOverwrite: true`
  and **`persistentFileIds: true`** (cloud ids are durable — no relink
  needed on a fresh device).
- `pickImages` / `loadImage` / `relinkImage` → **signed R2 upload**
  (direct from browser, content-hash keys per §7) and download per the
  **§6 image-delivery decision** (default: adapter fetches via presigned
  GET and returns `blob:` URLs, which honors `loadImage`'s
  URL-stays-valid contract); durable refs mean `relinkImage` becomes a
  rare fallback rather than the norm.
- `openSpeciesCsv`, `exportCsv` → unchanged semantics, cloud-backed.
- `loadSettings` / `saveSettings` → per-user settings row.
- **New cloud-only surface** (beyond `PlatformAdapter`): `signIn`/`signOut`
  + current user, list-sessions/projects, request-session-archive (the
  zip job), and per-user quota/usage reads (the pro-tier substrate).

Keep the base `PlatformAdapter` methods behaving identically to desktop/
web so the UI layer stays platform-clean; put cloud-only capabilities on
an extended interface the cloud shell provides.

## 13. Near / mid-term scope

**Near term** — durable multi-device sessions for a few known users +
shareable archives:
- Supabase Auth (social-first), durable **session-document** storage
  (§7), durable **image-blob** storage with stable refs + **signed
  direct upload**, **global CDN image serving**, **session zip-download**
  (moved up from mid-term — the sharing path before collaboration tooling
  exists), **PostGIS geo capture from day one** (§8), spend-safe posture
  (§6), and the app still fully functional client-side with zero backend.

**Mid term** — the richer scientific-tool vision:
- Thumbnails/derivatives (the first heavy-compute worker), orgs/projects
  + shared species libraries, multi-user sharing / collaborative review,
  per-user quotas + usage metering (pro-tier groundwork), pgvector/ML
  workers.

## 14. Phased build order (how to start)

1. **Provision (IaC):** Supabase project (free — this one stays as
   dev/staging after prod exists, since Pro is billed per project), R2
   bucket + scoped API tokens, a Workers static-assets deployment for
   the SPA (not Pages — maintenance-mode), email account. Capture in
   Terraform.
2. **Schema:** relational tables for project→quadrat→sample→sample_tag
   (+ species, settings) mapping the `v1` schema, with the JSONB mirror
   column, a `version` column for optimistic concurrency (§7), and a
   `geography(Point)` geo column; RLS policies keyed on `auth.uid()`.
3. **Auth:** enable Google OAuth in Supabase; wire the SDK in the UI.
4. **`CloudPlatformAdapter`:** first settle the **§6 image-delivery
   decision**, then implement the §12 surface — session read/write (the
   transactional parse-or-reject + version-check path), signed R2 upload
   with content-hash keys + post-upload size verification, image
   delivery per the decision, EXIF-GPS extraction on ingest.
5. **Wire the shell:** a cloud entry that calls
   `createQuadratorApp(new CloudPlatformAdapter(...))`
   (`packages/ui/src/app.ts`), served from the static-assets Worker.
6. **Go Pro ($25):** flip Supabase to Pro before real data lands
   (backups + no pause); confirm the **Spend Cap stays ON** (§5).
7. **Image backup replication:** nightly copy of the R2 bucket to a
   second provider/bucket (§6) — in place **before real user images
   land**, same bar as the Postgres backups in step 6. Do one restore
   drill.
8. **Session zip-download:** Edge Function → archive into R2 → signed
   URL; graduate to the heavy-compute worker only if image sizes demand.
9. **Mid-term** items as prioritized.

## 15. Open decisions (deferred)

- Concrete table DDL and the exact JSONB↔relational shred/reconstruct
  code.
- **Image delivery** (§6): default is option 1 (private bucket,
  adapter-fetched `blob:` URLs); upgrading to option 2 (public
  custom-domain bucket + auth Worker + CDN) is a latency-driven call.
  Must be settled before build step 4 — not open-ended, just staged.
- Conflict-resolution UX beyond reject-and-reload (§7): whether a stale
  save offers a field-level merge or only reload-and-reapply.
- **EXIF-strip / coordinate-fuzzing on shared archives** (§8) — decide
  before any public/collaborative sharing ships; rare-species locations
  are sensitive.
- Exact image-backup mechanism (rclone cron vs Worker+Queue
  copy-on-write) — the *requirement* (second copy before real images
  land) is settled in §6/§14; only the mechanism is open.
- Archive / cold-storage tier + lifecycle for never-deleted data as R2
  grows into the TBs.
- Where the heavy-compute worker eventually lives (Cloudflare Containers
  vs Fly/Railway) — decided when the load arrives.
- Concrete additional auth providers (ORCID / other OIDC) for the open
  audience.

## 16. Key repo files

- `packages/core/src/platform/adapter.ts` — the adapter contract the
  cloud adapter implements.
- `packages/core/src/serialization/v1.ts` + `migrate.ts`,
  `tests/fixtures/` — the `v1` schema mapped to tables; migrations are
  first-class and fixture-tested.
- `packages/ui/src/platform/browser.ts` — the web adapter to model the
  cloud one on, and the `relink` fragility the cloud store fixes.
- `packages/ui/src/app.ts` — `createQuadratorApp(adapter)` bootstrap the
  cloud shell reuses.
- `packages/ui/src/stores/session.ts`, `packages/ui/src/autosave.ts` —
  persistence/autosave behavior to preserve through the cloud adapter.
