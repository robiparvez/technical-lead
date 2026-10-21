# Domain Knowledge — Technical Lead Study Guide

> **Out of date in four places.** This file describes the design as of the first backend cutover (static export on GitHub Pages, content in JSON, a rebuild pipeline). The code has since changed. Read the sections below with these corrections:
>
> | Section topic | Then | Now |
> | --- | --- | --- |
> | Hosting and build | Static export on GitHub Pages, per-page CSP hashes (`csp-hashes.mjs`) | A Next server renders every page per request; the Pages deploy and the CSP script are removed; hosting is the open P6 decision |
> | Content source | Topic JSON and `manifest.json` in `src/data/`, synced by `fetch-content.mjs` | PostgreSQL is the only source; the Next server reads `GET /v1/export` per request (`src/lib/content.ts`); no content JSON is in the app; technologies are a table; the export is cached for 60 s and cleared by every admin write |
> | Rebuild pipeline (outbox, dispatcher, `repository_dispatch`, `GET /v1/admin/rebuild`, W5, W6, §9.3) | Admin write inserts an outbox row, the dispatcher triggers a rebuild | Removed. An admin edit shows on the next page load. Each admin write still runs the shared validator in its transaction (`ContentService.assertValid`) |
> | Seeding | `npm run seed` loads the JSON | Removed. Only the e2e tests load a fixture snapshot (`server/test/fixtures/seed/`). Back the database up with `pg_dump` |
>
> Also new: forgot and change password, with mail sent over SMTP (MailHog in dev). See `docs/TECHNICAL.md` for the current design.

A business and domain reference for the `technical-lead` repository (branch `feat/nestjs-backend`, October 2026). It explains what the product is for, the business rules it enforces, how its parts work together, and where the open questions are. Every claim is grounded in the codebase; file references are included so findings can be re-verified. Assumptions and open questions are explicitly separated from verified facts in §12.

---

## 1. Project Overview and Business Context

### 1.1 What the product is

A **free study site for people preparing for a Technical Lead interview**: 20 topics, 532 questions with model answers, a self-quiz for every topic, and a progress tracker ("mark as known"). Live at `https://robiparvez.github.io/technical-lead/` (README.md:5).

The content mirrors a real job posting (root `technical-lead.md`): a Technical Lead role with 5–7 years of experience, full-stack work, and team leadership. 14 topics are technical (microservices, databases, system design, security, …) and 6 cover the people side of the job (code review, mentoring, stakeholders, the HR round).

### 1.2 Business context and goals

The project began as a personal study tool ("Audience: me. Single job: recall the right answer fast." — PROMPT.md:2,26) and was then published publicly. Its business goals, from PROMPT.md:9–11 and README:

- **Fast recall on a phone**: open any topic in one tap; find a question through search in under 3 seconds; read without clutter or horizontal scroll.
- **Coverage**: every topic covers the most common interview questions for that area, ordered basic → intermediate → advanced.
- **Zero-cost, zero-ops hosting**: the public site is a pure static export on GitHub Pages; no server is needed to read or quiz.
- **Privacy by default**: "You never need an account… nothing you do leaves your device" (README.md:13). Accounts exist only to make progress follow a user across browsers.
- **Accessibility**: WCAG 2.2 AA target, keyboard-first, touch targets ≥ 44px, diagrams never autoplay.

### 1.3 The two systems

The repo contains two cooperating systems:

| | Frontend (`/`, root npm project) | Backend (`server/`, own npm project) |
| --- | --- | --- |
| Stack | Next.js 16, React 19, static export (`output: 'export'`, next.config.ts:3-12) | NestJS 12, better-auth 1.7, Drizzle ORM, PostgreSQL 18, zod v4 |
| Role | The whole public product: reading, quiz, progress, search, admin UI | Accounts, cross-device sync, content editing API, content export, rebuild trigger |
| Hosting | GitHub Pages (`.github/workflows/pages.yml`) | Local only today (:3001); production hosting is deferred to phase P6 (D1, D4) |
| Rule | Must build and fully work with the API unreachable (CLAUDE.md:32) | Single-instance by design (in-memory cache, throttler, dispatcher worker) |

**Current deployment reality**: the Pages site is live, but no API is deployed anywhere public. Sign-in, sync, and `/admin` are complete and tested features that are *latent* on the public site until phase P6 ships the API and wires the rebuild loop. Locally, the full loop works: API on :3001, edit in `/admin`, `node scripts/fetch-content.mjs`, `npm run build`.

---

## 2. Domain and Industry Concepts

| Concept | Meaning in this product |
| --- | --- |
| **Topic** | A study page (`/topics/<slug>`) grouping questions along one difficulty line. Has a `requirement` — the line from the job profile the topic answers, shown as an eyebrow under the title. |
| **Question** | The atomic unit of content: prompt, model answer, optional code snippet, optional diagram, tags, difficulty, and a required **key takeaway**. |
| **Difficulty** | Enum `basic | intermediate | advanced` (DB enum, `server/src/db/schema.ts:26`; TS type`src/data/types.ts:1`). Questions are stored in one array and re-grouped by the UI at render time (`QuestionRail.tsx`). |
| **Key takeaway** | One-sentence summary shown at the end of every answer. **It has a deliberate dual role**: skim summary for reading, and the *correct quiz option* in the quiz engine (`src/lib/quiz.ts:41-44`). This dual role is why takeaways must be unique per topic (§5, R1). |
| **Tag** | A lowercase keyword on a question (`kafka`, `idempotency`, `n+1`). Tags power technology pages and tag filter pages. |
| **Technology** | A hand-curated registry entry (`src/data/technologies.ts`) mapping a technology (Kafka, Stripe, …) to the set of tags that name it. Not derivable from tags alone — it is editorial curation. |
| **"Known"** | Binary per-question progress mark. Presence of the question id in a set = known; absence = not known. No partial states. |
| **Quiz attempt** | One round of up to 10 quiz questions on a topic, scored in points. Server-side: one `quiz_attempts` row with a client-generated idempotency key. |
| **Draft topic** | A live topic with zero live questions. Exists for admin staging; invisible on every public surface until its first question is saved (§5, R6). |
| **Soft delete** | The only delete. Sets `deleted_at`; rows, ids, and all per-user data survive forever. Ids and slugs are never reused. |
| **Content version** | 64-hex sha256 of the exact `/v1/export` response body — a fingerprint of the whole exported content state, used to fold duplicate rebuild requests (§7, W5). |
| **Rebuild outbox** | Transactional-outbox pattern for "content changed, the static site must rebuild": one row per admin write, dispatched as a GitHub `repository_dispatch`. |
| **Sync** | One-way-per-datum replication of browser-local progress (known set, quiz scores) to the server, queue-based and idempotent. |
| **Reset epoch** | Optimistic-concurrency counter for quiz state; bumped on "reset scores", checked on every quiz event. |

---

## 3. Core Business Capabilities and Functionalities

1. **Read answers** (`/topics/<slug>`) — questions hang off a vertical difficulty rail; clicking opens the model answer, optional code snippet (sugar-high highlighting for TS/JS), optional animated diagram, and the key takeaway; "Mark as known" toggle; tags link to tag pages; hash deep-links (`/topics/<slug>#<id>`) open and scroll to a card (`QuestionRail.tsx:101-113`).
2. **Cross-cut by technology** (`/technologies/<slug>`) — every question mentioning a technology across all topics in one list, each card labeled with its source topic. A technology with fewer than 3 matching questions is hidden (currently Python) (`technologies.ts:19,49-51`).
3. **Search and tag pages** (`/?q=`, `/?tag=`) — substring search over question + answer + key takeaway + tags + topic title, lowercased, in the browser (`SearchResults.tsx:113-118`); `/` focuses search; a query wins over a tag filter.
4. **Quiz engine** (`/quiz`, `/quiz/<slug>`) — 4-option "pick the right takeaway" quiz, scored 10/20/30 by difficulty, wrong answers cost half; consecutive attempts never repeat questions; history and per-topic totals (`src/lib/quiz.ts`, `src/lib/scores.ts`). Full algorithm in §7, W2.
5. **Progress tracking** — "Mark as known" per question; `12/28`-style counters in the sidebar and on home cards for every topic and technology (`TopicNav.tsx:56-110`).
6. **Optional accounts and sync** (`/login`) — email/password sign-in (better-auth); signed in, the known set and quiz scores replicate to the server and follow the user across devices; signed out or offline, everything stays local and the site behaves identically (degraded-mode notice only).
7. **Admin content editing** (`/admin`, unlinked, `noindex`) — browser editor for topics and questions with live "save checks", field-level 422 errors, and soft-delete/restore. Role-gated to the `admin` role.
8. **Content export pipeline** — the database is the source of truth after cutover: admin edits → `rebuild_outbox` → GitHub dispatch → fetch `/v1/export` → regenerate `src/data/manifest.json` + `src/data/topics/*.json` → static rebuild (§7, W5).
9. **References page** (`/references`) — the 21 sources consulted when choosing questions; editorial accountability for content provenance (PROMPT.md: "List all sources on a References page").
10. **Environment niceties** — light/dark/system theme with pre-paint script, fullscreen mode, `/` search shortcut, `Ctrl+B` sidebar toggle, reduced-motion support.

---

## 4. Domain Entities and Relationships

### 4.1 Entity-relationship overview

```mermaid
erDiagram
    USER ||--o{ SESSION : "has (24h, bearer)"
    USER ||--o{ ACCOUNT : "credentials"
    USER ||--o{ USER_KNOWN_QUESTIONS : "marks"
    USER ||--o{ QUIZ_ATTEMPTS : "plays"
    USER ||--o{ QUIZ_EVENTS : "emits"
    USER ||--o{ QUIZ_TOPIC_TOTALS : "accumulates"
    USER ||--|| QUIZ_STATE : "epoch/import flag"
    TOPIC ||--o{ QUESTION : "contains (FK RESTRICT)"
    QUESTION ||--o{ USER_KNOWN_QUESTIONS : "referenced by"
    TOPIC ||--o{ QUIZ_ATTEMPTS : "referenced by"
    REBUILD_OUTBOX }o--|| "content state" : "content_version sha256"
    USER {
      text id PK
      text email UK
      text role "user|admin, input:false"
    }
    TOPIC {
      text slug PK "immutable, reserved forever"
      text question_id_prefix UK "immutable"
      int group_sort_order "D11: no groups table"
      int sort_order
      timestamptz deleted_at "soft delete"
    }
    QUESTION {
      text id PK "prefix-qN, never reused"
      text topic_slug FK
      enum difficulty
      text_array tags
      text key_takeaway "unique per live topic"
      jsonb code "nullable"
      jsonb diagram "string id or spec"
      timestamptz deleted_at
    }
    QUIZ_ATTEMPTS {
      uuid id PK
      uuid client_attempt_id UK-per-user "idempotency"
      int number "server-assigned 1..n"
      int answered "cumulative"
      int correct
      int points
    }
    QUIZ_EVENTS {
      text event_id PK "with user_id; replay guard"
      int reset_epoch
      jsonb payload
    }
    QUIZ_TOPIC_TOTALS {
      int score "durable aggregate"
      int attempt_count
    }
    REBUILD_OUTBOX {
      uuid id PK
      enum status "pending|claimed|dispatched|failed"
      text content_version
      int attempts
      timestamptz next_attempt_at
    }
```

### 4.2 Database tables (13; `server/src/db/schema.ts`, ground truth in `server/drizzle/0000_*.sql`, `0001_*.sql`)

**Auth (better-auth 1.7 shapes)**

- `user` — `id`, `name`, `email` (unique), `email_verified` (always false in v1, D3), and one local addition: **`role` text default `'user'`** — the admin-role carrier, configured `input:false` so no client can ever set it (`server/src/auth/auth.factory.ts:89-91`).
- `session` — `token` (unique; the bearer token), `expires_at` (24h), `user_id` FK cascade. One row per login; revocation = row deletion.
- `account` — per-provider credentials (only "credential" used); bcrypt password hash.
- `verification` — present for the adapter, unused in v1 (no email verification, D3).
- `rate_limit` — better-auth's database-backed rate limiter storage (`key` unique, `last_request` is **epoch ms bigint**, not a timestamp).

**Content**

- `topics` — `slug` PK (immutable), `title`, `requirement`, `group_label` + `group_sort_order` (D11: two fixed groups, no `groups` table), `sort_order`, **`question_id_prefix` unique** (D16), `deleted_at` (soft delete).
- `questions` — `id` PK (`<prefix>-q<N>`, immutable), `topic_slug` FK **ON DELETE RESTRICT** (content is only ever soft-deleted, so references always resolve), `difficulty` enum, `tags text[]`, `question`, `answer`, `code jsonb` nullable (`{language, snippet}`), `key_takeaway` not null, `diagram jsonb` nullable (string id or typed spec), `sort_order`, `deleted_at`. **Partial unique index `questions_topic_slug_key_takeaway_live_idx` ON (topic_slug, key_takeaway) WHERE deleted_at IS NULL** (schema.ts:136-138) — soft-deleted rows never block takeaway reuse.

**Per-user data (all user FKs cascade; content FKs do not)**

- `user_known_questions` — PK `(user_id, question_id)`, `marked_at`. Presence = known; unmark = row delete.
- `quiz_attempts` — `client_attempt_id` uuid (client idempotency key), `number` int (server-assigned, 1-based per user+topic), `question_ids text[]`, cumulative `answered`/`correct`/`points`. Two unique anchors: `(user, topic, number)` and `(user, client_attempt_id)` (schema.ts:181-190).
- `quiz_events` — PK `(user_id, event_id)`; the replay guard / event log. `payload jsonb` is the raw event. 90-day retention.
- `quiz_topic_totals` — PK `(user_id, topic_slug)`; `score`, `correct`, `wrong`, `attempt_count`. The **durable aggregate** — survives attempt/event pruning.
- `quiz_state` — per-user row: `reset_epoch` (optimistic-concurrency counter) and `imported_at` (one-time local-import flag; also the row-existence anchor used for `SELECT … FOR UPDATE` serialization).

**Rebuild pipeline**

- `rebuild_outbox` — `status` enum `pending|claimed|dispatched|failed`, `payload jsonb` `{reason, content_version}`, `attempts`, `next_attempt_at` (doubles as the claim-TTL clock), index on `(status, next_attempt_at)`. Dispatched rows cleaned after 24h.

### 4.3 Frontend content model (`src/data/types.ts`)

- `Question { id, difficulty, tags[], question, answer, code?, keyTakeaway, diagram? }` — `diagram` is either a **string id** resolving into the hand-built Remotion registry (`src/data/diagram-ids.json`, 6 ids: request-flow, saga-flow, ci-cd-pipeline, rest-vs-graphql, b-tree-index, container-deploy) or a **typed spec object** rendered generically by `SpecDiagram.tsx` (`flow | branch | sequence | layers | compare`).
- `Topic { slug, title, requirement, questions[] }`.
- `Technology { slug, label, tags[] }` — hand-maintained; the content pipeline never writes it ("adding a technology is a code change").
- `manifest.json` — `{ groups: [{label, topicSlugs}], … }`; `src/data/index.ts` is a loader over it. **A topic file that isn't in the manifest does nothing.**

**Actual content inventory** (verified programmatically over the 20 JSON files):

- Group **"Technical"** (14 topics, sort_order 0): microservices (26 q), api-design (27), databases (28), stripe-payments (28), event-driven (28), front-end (26), react-nextjs (28), backend-runtime (28), cloud-serverless (26), cicd-release (27), automated-testing (28), system-design (28), system-design-exercises (28), security (26).
- Group **"Leadership & behavioral"** (6 topics, sort_order 1): tech-leadership (25), code-review (25), mentoring (24), agile-teams (24), stakeholders (24), hr-round (28).
- **532 questions**; ≈62 with code snippets, 474 with inline diagram specs, 6 with built-in animation ids (each used exactly once), 52 without a diagram.
- 14 registered technologies; **13 visible** (Python hidden at 2 matching questions).
- Four topics have prefixes that differ from their slugs: `stripe-payments→stripe`, `backend-runtime→backend`, `automated-testing→testing`, `hr-round→hr` — proof that `question_id_prefix` is an independent column, not always the slug.

---

## 5. Business Rules and Constraints

All rules below are **verified in code and/or pinned by tests** (test files under `server/test/`). Where a rule exists to protect a business capability, the *why* is stated.

**Content integrity**

- **R1 — Key takeaways are unique among live questions per topic.** Why: takeaways *are* the quiz answer options; with a duplicate, `options.indexOf(keyTakeaway)` would mark two options correct and grade wrong. Enforced four ways: the DB partial unique index (schema.ts:136-138), the shared content validator (scripts/validate-content.mjs rule 2), 23505→422 translation naming the clashing question (`admin.service.ts:71-82, 368-375`), and a live client-side pre-save check (`adminApi.ts:116-121`). Restore is blocked with 422 `fields.restore` if a live question now holds the deleted question's takeaway (`admin.service.ts:467-486`).
- **R2 — Question ids are server-assigned `<prefix>-q<N>`, counting soft-deleted rows, never reused.** Why: ids are saved in readers' localStorage and are DOM/hash anchors — reuse would silently attach old progress to a different question. `N = max(existing N, deleted included) + 1`, serialized by `pg_advisory_xact_lock(hashtext(topic_slug))`, `questions_pkey` violation as 409 backstop; client-sent ids are ignored (D16; `admin.service.ts:293-376`; verified: after deleting `tmx-q1`, the next create is `tmx-q3`; 5 concurrent creates yield q4..q8).
- **R3 — Slugs and `question_id_prefix` are immutable and reserved forever**, even after soft delete ("Slugs stay reserved after a delete", `admin.service.ts:177-182`; PATCH attempts get 422 naming the field).
- **R4 — Delete is always soft.** No hard-delete path exists for topics/questions. User data (known marks, attempts, totals) survives a content delete; question FKs are RESTRICT. Soft-deleted questions are listed via `GET /v1/admin/topics/:slug/deleted` and restorable under their original id. **Topics have no restore endpoint in v1** (documented decision).
- **R5 — Every admin write must leave the whole content state valid.** Inside the write's transaction, the exact post-write export is collected and run through the shared validator (`scripts/validate-content.mjs`); failure throws 422 with a `fields` map and rolls back **both** the content change and the outbox row — "no content change, no outbox row" (`rebuild/outbox.service.ts:31-47`).
- **R6 — Draft topics (live, 0 live questions) are invisible publicly**: 404 on `GET /v1/topics/:slug`, excluded from the topic list, export, and validation (`topics.service.ts:58-86`, `export.service.ts:115-126`). The first saved question publishes the topic automatically — there is no separate publish step.
- **R7 — Technology curation is build-checked**: a registered tag carried by no question **throws at build** (`technologies.ts:22-29`); a technology with < 3 matching questions is hidden from nav, home, and routes. The shared validator blocks an admin write that would orphan a technology's last tag (422 `fields.tags`) — including via soft delete.
- **R8 — Unknown built-in diagram ids render nothing** (no error) — `Diagram.tsx:105-107`; `diagram-ids.json` is what the build type-checks against, so a typo fails the build, not the page.

**Quiz engine**

- **R9 — Attempt size = `min(10, floor((pool-1)/2))`** (`quiz.ts:35-37`): strictly under half the topic, so **attempt N+1 can always be built without reusing attempt N's questions**. All current topics (24–28 q) serve exactly 10.
- **R10 — Every quiz option is real guide content**: correct option = the question's own takeaway; 3 distractors = takeaways of *other questions in the same topic*, shuffled (`quiz.ts:55-67`). This is the business reason R1 exists.
- **R11 — Scoring**: basic +10/−5, intermediate +20/−10, advanced +30/−15 (penalty = half the reward) (`quiz.ts:3-8`).
- **R12 — Answers are recorded at check time**, so an abandoned attempt keeps earned points and still counts (`QuizRunner.tsx:23-27`).
- **R13 — History keeps the newest 20 attempts per topic** (`scores.ts:7`); `attemptCount` keeps growing; quiz pages show the last 5.

**Sync and server state**

- **R14 — Known-set deltas: remove wins over add** in one payload; unknown/deleted ids are dropped silently (no tombstones needed); the full resulting set is returned (`progress.service.ts:24-69`).
- **R15 — Quiz events are idempotent and ordered**: replayed `event_id` → `duplicate`; a different event reusing a `client_attempt_id` → `duplicate` with the server attempt number; per-user serialization via row lock on `quiz_state`; each event is its own transaction so one rejection never rolls back batch neighbours (`quiz.service.ts:67-176`).
- **R16 — Reset epoch is optimistic concurrency**: an event tagged with a stale epoch is rejected 409; the client refetches state and re-tags. `reset` deletes the topic's attempts, zeroes totals, bumps the epoch, and **keeps** `quiz_events` (the replay guard) (`quiz.service.ts:297-323`).
- **R17 — One-time local import**: `import_local` runs exactly once per account (guarded by `quiz_state.imported_at`), even when the local history is empty — so a fresh account can never later import over real synced data.
- **R18 — Retention (D8)**: newest 20 attempts per topic kept; `quiz_events` pruned after 90 days; `client_ts` older than 90 days → event rejected 422. Totals live separately, so pruning loses no score.
- **R19 — Server totals are authoritative while signed in**; a failed sync never mutates local state; racing local mutations are detected via enqueue counters and settled on the next flush (`sync.ts:306-342, 472-487`).
- **R20 — Sign-out wipes all local sync state** (known set, scores, queues, epoch) so a following account on the same browser never merges data (`sync.ts:235-243`).

**Platform and security**

- **R21 — Signup can never yield admin**: `role` is `input:false`; only `npm run admin:grant -- <email>` grants it, and it errors if the user hasn't signed up first — because emails are unverified, merely registering an admin-looking address must confer nothing (D3; `grant-admin.ts:6-13`).
- **R22 — `/v1/export` is token-gated** with constant-time comparison (`safeTokenEqual`, sha256-then-timingSafeEqual); never cached, exempt from the throttler (D7).
- **R23 — Limits (D13)**: 100 KB request body everywhere; progress deltas ≤ 1,000 ids per call; quiz event batches ≤ 100; sessions 24h refreshed hourly; public GETs throttled 60/min/IP (429); better-auth sign-in limited 3/10s (429 + `x-retry-after`); 5-min TTL cache on public topic reads, cleared on every admin write.
- **R24 — No HTML sanitizer (D14)**: admin content is stored as written (code samples must keep `<script>` etc. visible) and escaped on output; instead, length caps (question ≤300, answer ≤2000, takeaway ≤240, snippet ≤4000, ≤8 tags) and control-character rejection (everything below 0x20 except \t\n, plus 0x7F) protect integrity.
- **R25 — Error contract**: public/user validation errors are **400** with message arrays; admin write errors are **422** with a `fields` map (path → message) so the admin form can render per-field messages; unique-violation races surface as **409**. Envelope everywhere: `{ statusCode, message, error, fields? }`.
- **R26 — Static-export discipline**: nothing in the Next app may need a server at request time (no request-time searchParams/cookies/route handlers/server actions); client-side fetch to the API is the only exception. All localStorage-backed stores return an **empty server snapshot** so prerendered HTML matches first hydration (`storage.ts:48-51`).
- **R27 — Design-system constraints**: design tokens only (no raw hex/px in components); **zero gradients**; **no background fills** on UI surfaces (`reset.css` is the only file allowed a background); the accent color is used for borders/rules/glyphs only, never text (it fails 4.5:1 AA as text) (PROMPT.md, DESIGN.md as amended).

---

## 6. User Roles and Access Control

| Role | How acquired | Capabilities | Constraints |
| --- | --- | --- | --- |
| **Anonymous reader** (primary) | None — no account needed | Everything public: read all topics/answers/diagrams, search, tag pages, full quiz, local progress, theme | Progress lives only in that browser's localStorage; quiz page payloads contain no answers by design but nothing stops a determined client |
| **Signed-in user** | `/login` (better-auth email/password, auto sign-in on signup; bearer token in localStorage `tl-auth-token`) | Everything above, plus cross-device sync of known set + quiz scores via `/v1/progress/*` and `/v1/quiz/*` | Session 24h, refreshed hourly; no email verification, no password reset flow in v1 (D3) |
| **Admin** (site owner) | **Only** `npm run admin:grant -- <email>` run in `server/` against an existing signup | Full content CRUD via `/v1/admin/*`: topics (create/patch/soft-delete), questions (create/patch/soft-delete/restore), deleted-questions list, rebuild status. Uses the `/admin` browser console | Cannot change slugs/prefixes or move a question between topics (server 422); cannot restore a topic; cannot hard-delete anything |
| **Operator** (owner at a terminal) | Shell access | `migrate`, `seed`, `admin:grant`, `fetch-content.mjs`, `npm run build` | The only path to grant admin or (today) to run the export pipeline |
| **GitHub Actions** (system) | Workflow triggers | Builds and deploys the static site on push to `master`; server CI runs unit+e2e with a Postgres 18 service container | Intended future role: consume `repository_dispatch content-update` and rebuild the site (P6, not yet wired) |

**Guard mechanics** (server): `AuthGuard` requires `Authorization: Bearer <token>` (better-auth bearer plugin; 401 if absent/invalid) and attaches `{id, email, name, role}` to the request; `AdminGuard` requires `role === 'admin'` (403 otherwise) and always runs after `AuthGuard`. Applied per-controller: progress/quiz → authed; admin/rebuild → authed + admin. better-auth's raw handler sits at `/api/auth/*` *outside* Nest — no `/v1` prefix, no Nest guards/pipes/throttler apply there; it has its own database-backed rate limiter and a 100 KB content-length check (`auth.mount.ts`).

**Client-side gating** (`/admin`): the page is prerendered and `noindex`; the console checks the session and `user.role === 'admin'` client-side and renders signed-out/denied/error screens before fetching anything (`AdminConsole.tsx:70-72`). The server remains the real gate — every admin route 401s anonymous and 403s non-admin callers (verified for all 10 routes, `admin.spec.ts:96-118`).

---

## 7. End-to-End Business Workflows

### W1 — Read and track (the core loop, fully offline-capable)

```text
Open /topics/<slug>  →  rail shows Basic → Intermediate → Advanced stations
  → click a question  → answer + [code] + [diagram] + Key takeaway
  → "Mark as known"   → localStorage tl-known-questions Set updated
                      → sidebar/home counters recompute (k/total)
(deep link /topics/<slug>#<question-id> opens + scrolls to the card)
```

Signed-out, this is the whole product. Signed-in, each toggle additionally enqueues a sync op (W3).

### W2 — Quiz attempt (`src/lib/quiz.ts`, `QuizRunner.tsx`, `scores.ts`)

1. **Intro screen** (round is built on button click, not render — shuffling can never mismatch hydration).
2. **Select questions**: candidates = topic pool − previous attempt's `questionIds`; shuffle; take `size = min(10, floor((pool−1)/2))`; top up from previously-asked questions only if the pool shrank (R9).
3. **Build options** per question: correct = own `keyTakeaway`; 3 distractors = shuffled takeaways of other same-topic questions; all 4 shuffled (R10). The quiz page payload deliberately contains only `{id, difficulty, question, keyTakeaway}` — no answers/code (`quiz/[slug]/page.tsx:25-31`).
4. **Answer flow**: reader picks → "Check answer" records the result immediately (R12; ±points by difficulty R11) → per-option correct/wrong/locked states + "Read the full answer" deep link → "Next".
5. **Results**: correct count, attempt points, topic total; "Start attempt N+1" (skips last attempt's questions) or "Review answers".
6. **Local persistence**: `tl-quiz-scores` gains/updates the attempt (history capped 20, R13); Reset scores (two-step confirm) clears a topic — or all topics — locally.
7. **Signed in**: steps 2/4/6 additionally derive sync events (`attempt_started`, `answer_recorded`, `reset`) — W3.

### W3 — Sign in and sync (`src/lib/sync.ts`, `SyncProvider.tsx`; `server/src/progress/`, `server/src/quiz/`)

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as /api/auth (better-auth)
    participant S as NestJS /v1
    B->>A: sign-in (email, password)
    A-->>B: set-auth-token header (24h bearer, rotated hourly)
    B->>B: store tl-auth-token; SyncProvider reacts
    B->>S: GET /v1/progress/known
    S-->>B: server known set
    B->>B: replay queued ops (remove then add) on top
    alt first sign-in on this device
        B->>S: POST known { add: entire local set } (bootstrap, once)
    end
    B->>S: POST known { add[], remove[] } disjoint deltas, 1000-id chunks
    S-->>B: full resulting set (remove-wins, unknown ids dropped)
    B->>S: GET /v1/quiz/state (resetEpoch, importedAt, totals)
    B->>B: drop queued events older than 90 days (notice)
    alt importedAt is null
        B->>S: import_local { local totals } (exactly once, even if empty)
    end
    loop queue in batches of 100
        B->>S: POST /v1/quiz/events { events[] }
        S-->>B: per-event applied | duplicate(number) | rejected(409 epoch | 422)
    end
    B->>B: reconcile server attempt numbers into local history
    B->>S: GET /v1/quiz/state → overlay server totals as authoritative
```

**Trigger rules**: sync runs on mount, on token change, when a queue becomes dirty (debounced 3 s), and on browser `online`. No token → `signed-out`, no network call. Unreachable server → degraded mode: local data kept, a "could not be reached — your progress is saved on this device" notice with Retry. Invalid session → token cleared **and local data wiped** (R20). A stale epoch is retried by refetching state and re-tagging queued events (max 2 times). Quiz numbers are **server-authoritative** and reconciled back into local history (R15, R19).

**Quiz event semantics** (server, one transaction each): `attempt_started` validates that every distinct question id is a **live** question of an existing topic (422 otherwise) and assigns `number = max+1` with race retry; `answer_recorded` requires the attempt to exist by `client_attempt_id` and enforces server-side sanity bounds `correct ≤ answered` and `−15·answered ≤ points ≤ 30·answered` (422 outside); `reset` per R16; `import_local` per R17. After every POST a per-user retention sweep prunes to 20 attempts/topic and drops >90-day events (R18).

### W4 — Content edit lifecycle (admin)

- **Create topic** → exists as a **draft**: visible in `/admin` only ("draft" flag; copy warns "add a question before the next rebuild"). First question publishes it (R6).
- **Create question**: server assigns the id `<prefix>-q<N>` ignoring any client id (R2); the whole post-write state must pass the shared validator inside the transaction (R5); duplicate live takeaway → 422 `fields.keyTakeaway` naming the clashing question (R1); missing `topicSlug` → 422; unknown/deleted topic → 404; pkey race → 409. Response: the refreshed topic + saved question.
- **Update question**: `topicSlug` must equal the current one (questions can't move topics, 422); omitted `code`/`diagram` become null; omitted `sortOrder` is kept.
- **Delete question** → soft delete; id stays reserved (R2/R4); listed under "Deleted questions" (newest first); **Restore** reactivates under the original id unless the takeaway was claimed (422 `fields.restore`).
- **Delete topic** → soft delete; leaves every public surface; slug stays reserved forever; no restore endpoint in v1 (R3/R4).
- **UI safety**: the editor mirrors the server's checks live ("Save checks" panel), blocks navigation while dirty, focuses an error summary whose links jump to each field, and renders server 422 `fields` messages per field.

### W5 — Edit → rebuild → public site (the content pipeline)

```mermaid
sequenceDiagram
    participant Ad as Admin (/admin)
    participant S as NestJS API
    participant O as rebuild_outbox (same tx)
    participant D as Dispatcher worker
    participant GH as GitHub repository_dispatch
    participant CI as Actions: fetch-content.mjs + build + Pages
    Ad->>S: POST/PATCH/DELETE content
    S->>O: collect post-write export, run shared validator, insert outbox row {reason, content_version=sha256(export)}
    Note over S: tx commits: content + outbox row together (or neither)
    S-->>Ad: 201/200 (admin never waits for the rebuild)
    D->>O: claim oldest pending (FOR UPDATE SKIP LOCKED, 5-min claim TTL)
    D->>D: debounce until ~30s after created_at
    D->>S: snapshot CURRENT content version
    D->>GH: repository_dispatch content-update {content_version}
    D->>O: mark dispatched; fold every pending row whose content_version matches
    GH->>CI: (P6, not yet wired) trigger workflow
    CI->>S: GET /v1/export (x-export-token) + assert content_version
    CI->>CI: structural checks + shared validator (drop-protection)
    CI->>CI: rewrite src/data/manifest.json + topics/*.json (canonical order, CRLF/LF preserved; delete removed topic files; never touch technologies.json / diagram-ids.json)
    CI->>CI: next build (static export) + csp-hashes.mjs → deploy to Pages
```

Key mechanics: `content_version` is the sha256 of the exact export body, so **folding by version can never mark un-dispatched content as dispatched** — a row written while the fetch was in flight carries a different version and stays pending for the next cycle. Failures retry with exponential backoff (30s·2ⁿ capped 15 min, 5 attempts) then surface as `failed` in `GET /v1/admin/rebuild`; stale claims (>5 min) recover to `pending`; dispatched rows are cleaned after 24h. With `DISPATCH_ENABLED=false` (the default until P6) the worker logs and marks dispatched without calling GitHub. Public reads see edits immediately (5-min cache cleared on write); the *static site* changes only on the next rebuild — that's the business meaning of the admin "rebuild line".

### W6 — Static build and deploy (today)

Push to `master` → `pages.yml`: checkout → Node 24 → `configure-pages` (sets `PAGES_BASE_PATH=/technical-lead`) → `npm ci` → `lint` → `build` (SSG prerenders all 20 topic pages, quizzes, technologies; postbuild hashes inline scripts into per-page CSP metas, D6) → upload `out/` → deploy Pages. Server CI (`.github/workflows/server-ci.yml`) runs lint + unit + e2e against Postgres 18 on pushes to the backend branch.

### W7 — Legacy authoring (pre-backend)

Before `feat/nestjs-backend`, topic JSON was hand-edited. Post-cutover (D2) the DB owns content and the committed JSON becomes "a seed and a fallback snapshot": `npm run seed` is **insert-only** (`onConflictDoNothing`) — safe to re-run, never resurrects soft-deleted rows, and derives each topic's `question_id_prefix` from its question ids (erroring on mixed prefixes).

---

## 8. APIs, Integrations, and External Dependencies

### 8.1 HTTP API (NestJS, global prefix `/v1`; error envelope `{statusCode, message, error, fields?}`)

**Public (throttled 60/min/IP unless noted)**

| Endpoint | Purpose / notable rules |
| --- | --- |
| `GET /v1/topics` | Live topics with live question counts; drafts excluded; ordered by (group, sort). 5-min cache. |
| `GET /v1/topics/:slug` | Topic + full questions; **404 for missing, soft-deleted, or zero-live-question topics**. |
| `GET /v1/questions` | Keyset-paginated across topics (`limit` 1–100 default 20; opaque base64url cursor `{g,t,s,i}`; invalid cursor → 400; `tag`, `difficulty` filters). Excludes soft-deleted rows. |
| `GET /v1/export` | **Token-gated** (`x-export-token`, constant-time compare, D7); never cached, exempt from throttler. Full content + `contentVersion` (sha256 of body). |
| `GET /v1/health/live` · `/v1/health/ready` | Liveness (no DB) / readiness (`select 1`, 503 on failure). |

**Auth (raw better-auth at `/api/auth/*`, outside Nest)** — `POST sign-up/email`, `POST sign-in/email` (bearer token in `set-auth-token` response header), `sign-out` (revokes session), session get; DB-backed rate limiting (sign-in 3/10s → 429 + `x-retry-after`); 413 over 100 KB; `GET /api/auth/ok` health probe.

**Signed-in user (`AuthGuard`, bearer)**

| Endpoint | Rules |
| --- | --- |
| `GET /v1/progress/known` | Full known-id set, ordered for stable diffs. |
| `POST /v1/progress/known` | `{add?, remove?}` arrays ≤1,000 ids; one transaction; unknown ids silently dropped; **remove wins**; returns the resulting set. |
| `GET /v1/quiz/state` | `{resetEpoch, importedAt, topics: {slug → totals}}`. |
| `POST /v1/quiz/events` | 1–100 events; **always HTTP 200, per-event in-band status**: `applied` / `duplicate` (with server attempt number) / `rejected {reason, code: 409 | 422}`. Runs the per-user retention sweep. |

**Admin (`AuthGuard` + `AdminGuard`; 401/403 verified on all routes)**

| Endpoint | Rules |
| --- | --- |
| `GET /v1/admin/topics` | All topics incl. drafts and soft-deleted, with `draft`/`deleted` flags and live counts. |
| `GET /v1/admin/topics/:slug` | Editor load (works for drafts/deleted too); 404 unknown slug. |
| `POST /v1/admin/topics` | Creates a draft; duplicate slug/prefix → 422 naming the field; concurrent race → 409. |
| `PATCH /v1/admin/topics/:slug` | Title/requirement/group/order only; slug & prefix immutable (must echo current value, else 422); group label without a resolvable order → 422. |
| `DELETE /v1/admin/topics/:slug` | Soft delete only; 404 if already deleted; no restore endpoint exists. |
| `GET /v1/admin/topics/:slug/deleted` | Soft-deleted questions, newest first (restore candidates). |
| `POST /v1/admin/questions` | Server-assigned id (client id ignored); 422 `fields.*` for takeaway clashes, orphaned technology tags, control chars, limit breaches; 409 pkey backstop. |
| `PATCH /v1/admin/questions/:id` | `topicSlug` must equal current (no moving topics); omitted code/diagram → null. |
| `DELETE /v1/admin/questions/:id` | Soft delete; id never reused. |
| `POST /v1/admin/questions/:id/restore` | Under the original id; 422 `fields.restore` if the takeaway is now claimed. |
| `GET /v1/admin/rebuild` | Outbox summary `{pending, failed, lastSavedAt, requestedAt}` — drives the admin "rebuild line". |

### 8.2 External dependencies

| Dependency | Used for | Status |
| --- | --- | --- |
| **PostgreSQL 18** | All state (local install, `technical_lead` / `technical_lead_test` DBs) | Live in dev; production host deferred (P6) |
| **GitHub Pages + Actions** | Static hosting + deploy workflow (`pages.yml`) | Live |
| **GitHub `repository_dispatch`** | Rebuild trigger from the API (`GITHUB_REPO`, `GITHUB_REPO_DISPATCH_TOKEN`) | Sent by the server; **consumer workflow trigger not yet added** (P6) |
| **better-auth** | Email/password auth, bearer tokens, DB rate limiting | Live |
| **Remotion `@remotion/player`** | Animated diagrams (lazy-loaded, never autoplay, reduced-motion aware) | Live |
| **sugar-high** | TS/JS code highlighting | Live |

Packages are first-party only by policy (D10) — NestJS, better-auth, Drizzle, zod, throttler, pino, helmet, Swagger; community packages need owner approval.

### 8.3 Shared code as an integration seam

`scripts/validate-content.mjs` (D9) is one plain-ESM validator with three consumers: the repo CLI, `fetch-content.mjs` (with committed-id drop protection), and the server (which loads `technologies.json` + `diagram-ids.json` from `CONTENT_RULES_DIR`, default the repo's `src/data`). This is what guarantees the admin API, the export fetch, and the build all enforce the *same* editorial rules. Its rules: (1) every technology-map tag carried by ≥1 question; (2) takeaway non-empty + unique per topic; (3) string diagram ids exist in `diagram-ids.json`; (4) all committed question ids still exist in the candidate state (a delete that would orphan a question is blocked); (5) no exported topic empty; (6) one group label ⇔ one `group_sort_order`.

---

## 9. Data Lifecycle and State Transitions

### 9.1 Topic

```
[draft: live, 0 live questions]  --first question-->  [live]
[live]  --DELETE-->  [soft-deleted: deleted_at set]    (terminal; slug reserved forever; no restore)
```

Public visibility only in `live` with ≥1 live question. Soft-deleted topics keep their questions (live rows) and all user data.

### 9.2 Question

```
[live] --DELETE--> [soft-deleted] --restore (if takeaway unclaimed)--> [live, same id]
```

Ids and `sort_order` history survive; id is never reused (next create skips past it, R2). Restore is refused while a live question holds its takeaway (422 `fields.restore`).

### 9.3 Rebuild outbox row

```
pending --claim--> claimed --dispatch ok--> dispatched (fold matching pending siblings) --24h--> deleted
                     |                        (version-mismatch rows stay pending for next cycle)
                     +-claim TTL 5min expired--> pending
                     +-dispatch fail--> attempts+1, backoff 30s·2ⁿ (cap 15min)
                                        --5 attempts--> failed (visible in GET /admin/rebuild)
```

`DISPATCH_ENABLED=false` short-circuits the network call (log + mark dispatched) — the default until P6.

### 9.4 Quiz data (per user)

- **Attempt**: created by `attempt_started` (server-assigned sequential `number`); mutated by `answer_recorded` (absolute counters on the attempt, deltas on totals); retained: newest 20 per topic.
- **Events**: applied → row in `quiz_events` (replay guard) → pruned after 90 days. Replays return `duplicate` forever within the window; rejected events leave no row.
- **Totals**: the durable aggregate; only `reset` (per topic) or `import_local` (once per account) can set them outside normal play.
- **`quiz_state.reset_epoch`**: bumped only by `reset`; every other event must carry the current value.

### 9.5 Known marks

Set membership only: `POST {add}` inserts (idempotent), `POST {remove}` deletes; no timestamps beyond `marked_at`; unknown ids are dropped silently — content deletes need no cleanup.

### 9.6 Browser data (localStorage; all keys prefixed `tl-`)

| Key | Format | Cleared by |
| --- | --- | --- |
| `tl-known-questions` | `string[]` | sign-out / dead session |
| `tl-quiz-scores` | `Record<slug, TopicScore>` with ≤20 attempts each | sign-out / dead session / Reset scores |
| `tl-theme` | `light \| dark \| system` (read pre-paint by `THEME_SCRIPT`) | never (survives sign-out) |
| `tl-auth-token` | bearer string, rotated hourly | sign-out, invalid session |
| `tl-sync-known-queue` / `tl-sync-quiz-queue` | ordered pending ops/events | flushed by sync / sign-out |
| `tl-quiz-reset-epoch` | last-seen epoch | sign-out |
| `tl-sync-known-bootstrapped` | first-upload flag | sign-out |

Corrupt JSON parses to the empty value; quota errors are swallowed (session keeps the in-memory value); server snapshots are always empty so hydration never mismatches (R26).

### 9.7 Sessions

Created on sign-up/sign-in (`autoSignIn`), 24h expiry refreshed hourly (server issues a fresh token via `set-auth-token`, client stores it); sign-out revokes the row; password reset doesn't exist in v1, so a session simply ages out.

---

## 10. Error Handling, Edge Cases, and Exceptions

**Server error contract** (`AllExceptionsFilter`): every error → `{statusCode, message, error}` (+`fields` on 422s carrying a `{field: message}` map); unknown exceptions → generic 500, no internals leaked; pino redacts `authorization`/`cookie` headers. **Two zod pipes (D12)**: public/user bodies → **400** with `"path: message"` arrays; admin bodies → **422** with a `fields` map (root-level issues under key `form`). Shared-validator failures map to fields: tag rule → `tags`, takeaway → `keyTakeaway`, diagram → `diagram`, group-order → `group`, else `form`.

**Deliberate edge-case behaviors worth knowing:**

- **Unknown question ids in a known-delta are dropped silently** — deleted content can never break a client's sync (no tombstones, R14).
- **Sync is fail-safe by design**: unreachable API → degraded local mode with a notice; malformed event batch → dropped with a notice, never an infinite retry loop; stale epoch → refetch + re-tag, max 2 attempts; >90-day-old queued events → dropped with a visible notice.
- **A soft-deleted topic still accepts quiz events** as long as its questions were live at send time (`topicExists` doesn't filter `deleted_at`) — scores on a removed topic are preserved, though the topic is invisible publicly. *(Believed intentional; not pinned by a test — see §12.)*
- **Quiz answer bounds are enforced server-side** (`correct ≤ answered`, `−15·answered ≤ points ≤ 30·answered`) — the client computes points and is trusted, but nonsense values can't enter the aggregate (422).
- **Abandoned quiz attempts keep their points** (recorded at check time, R12); history marks them "stopped after n".
- **Attempt-number races** retry with a fresh number (3 passes) before giving up as 409; `client_attempt_id` replays resolve to `duplicate` + the canonical number instead of a second row.
- **Concurrent admin creates** are serialized by an advisory lock per topic (R2); slug/prefix races fall through to unique-index 409s.
- **A `content_version` mismatch during dispatch folding is a feature**: rows written while a dispatch was in flight stay pending and dispatch in the next cycle — nothing is ever marked dispatched that wasn't (W5).
- **Unknown diagram ids and unparseable diagram specs render nothing / a friendly "Diagram failed to load"** rather than breaking the page; spec validation happens at admin-write time (client pre-check + server zod).
- **Static-export constraints shape the UX**: `useSearchParams` needs Suspense with prerendered fallbacks (home search renders the topic index first); no `loading.tsx` (unsupported) — hand-rolled skeletons instead (D15); quiz rounds build on click so shuffle can't desync hydration (R26).
- **Search/query precedence**: a search query wins over a tag filter on home; `?next=` must be a same-app path (starts with `/`, not `//`).

---

## 11. Module Dependencies and Cross-Domain Interactions

### 11.1 Frontend (root project)

```
src/data/*  (manifest + topics JSON + technologies + diagram-ids)
   ↑ read at build time only (server components, generateStaticParams)
src/app/* (routes) ── renders ──> src/components/* (client islands)
   QuizRunner ──> lib/quiz.ts (pure) ──> lib/scores.ts ──> lib/storage.ts (createStore)
   QuestionRail/TopicNav ──> lib/progress.ts ──> lib/storage.ts
   SyncProvider (mounts in Shell, wraps the app) ──> lib/sync.ts ──> lib/api.ts ──> NestJS :3001
   AccountControl/login ──> lib/auth.ts (better-auth client) ──> /api/auth/*
   AdminConsole/QuestionEditor ──> lib/adminApi.ts ──> /v1/admin/*, /v1/quiz (rebuild line), session
   Diagram.tsx ──> diagrams/* (6 Remotion compositions) + SpecDiagram (spec kinds)
```

Key coupling rules: quiz page payloads stay slim (no answers/code — R26 corollary); full answers never enter client props beyond the page that shows them; `lib/quiz.ts` and `lib/progress.ts` are pure and testable; everything persistent flows through `createStore` (one write path, cross-tab events, empty server snapshots).

### 11.2 Backend (`server/`)

```
main.ts (helmet, CORS allowlist, /api/auth raw mount, 100KB json, /v1 prefix, filter, swagger /docs non-prod)
app.module (env validation, pino, throttler + PublicGetThrottlerGuard, shutdown hooks)
  topics/  ──> content/ (TtlCacheService) ──> db/
  questions/ (keyset pagination)
  export/  ──> db (never cached; contentVersion = sha256(body))
  progress/ quiz/ ──> db (row-lock serialization; retention sweep)
  admin/   ──> db + content rules + OutboxService.recordWrite (same tx) + cache.clear()
  rebuild/ ──> db (outbox) + GitHub dispatch API
  auth/    ──> better-auth factory (drizzle adapter) ──> db
  common/  (zod pipes, fields exception, tokens, env schema)
```

Cross-domain interactions: **admin → rebuild** (outbox row in the content transaction); **admin → topics cache** (clear-on-write so public reads reflect edits immediately); **auth → every authed route** (guard → `auth.api.getSession`); **server → repo `src/data`** (reads `technologies.json`/`diagram-ids.json` via `CONTENT_RULES_DIR` for the shared validator — the server depends on a frontend data file by design, D9); **rebuild → GitHub → Actions → export → frontend data** (the loop that makes the DB the source of truth).

### 11.3 Scripts and CI

`scripts/fetch-content.mjs` (DB→repo sync; canonical JSON ordering; drop protection; never touches the hand-kept rule files) · `scripts/csp-hashes.mjs` (postbuild per-page CSP, D6) · `scripts/validate-content.mjs` (shared validator, 3 consumers) · `server/scripts/grant-admin.ts` (the only admin-grant path) · `pages.yml` (deploy) · `server-ci.yml` (unit+e2e on Postgres 18).

---

## 12. Assumptions, Knowledge Gaps, and Open Questions

### 12.1 Verified but worth flagging (inconsistencies / small gaps)

1. **The rebuild loop is inert end-to-end until P6**: the server sends `repository_dispatch content-update`, but `pages.yml` has no `repository_dispatch` trigger and no fetch step; also, `repository_dispatch` runs workflows from the default branch, so none of it can work before the backend merges to `master` (D4 gates this on owner approval).
2. **`docs/BACKEND_PLAN.md` is stale on two admin endpoints**: it lists `GET /admin/topics/:slug/deleted` and `POST /admin/questions/:id/restore` as "not built", but both exist and are tested (`admin.controller.ts:77,108`; `admin.spec.ts:299-320`).
3. **`AUTH_BASE_URL` bypasses boot validation**: documented in `.env.example` and read via `process.env` in `auth.factory.ts:21` with a localhost fallback, but absent from `env.schema.ts` — a typo would silently fall back.
4. **Id-prefix drift vs. UI copy**: four topics use short prefixes (`stripe-q1`, `hr-q1`, …) while the editor hint cites `<slug>-q27` style; the hint predates the prefix column.
5. **`next build` does not enforce takeaway uniqueness** — enforcement lives in the shared validator + admin checks. A hand-edited JSON (legacy flow) with duplicate takeaways would build and produce a subtly broken quiz (first-match `indexOf` grading).
6. **Stray file**: `src/data/topics/.playwright-mcp/check-animation.png` (~150 KB, committed) — test debris inside the pipeline-owned directory; harmless (loader reads only `<slug>.json`) but should be removed.
7. **`attempts` counter semantics**: the dispatcher increments `attempts` on successful dispatch too, so on `dispatched` rows it isn't purely a failure count.
8. **Shape nit**: `GET /admin/topics/:slug/deleted` returns a bare array while every other endpoint wraps in an object.
9. **Editor hint text** ("choose the next free id") predates server-assigned ids ("Assigned when you save").
10. **Region-specific content**: `hr-round.json` embeds Dhaka-market salary specifics — intentional personalization; generalize before republishing content broadly.
11. **No bulk "unmark known" UI**: the known set can only be unwound mark-by-mark or by signing out (which wipes it).

### 12.2 Assumptions (believed, not test-pinned)

- Quiz activity against a **soft-deleted topic** is allowed while its questions remain live — treated as intentional score preservation, but no test pins it.
- **Single-instance deployment** (in-memory TTL cache, in-memory throttler budget, `setInterval` dispatcher) is assumed in code comments; horizontal scaling would break cache invalidation, rate-limit budgets, and debounce — the outbox claim itself is safe (`SKIP LOCKED`).
- **Quiz anti-cheat is out of scope**: points are client-computed and trusted (documented v1 limitation); server bounds checks stop only nonsense values.
- **Bearer token in localStorage** is an accepted XSS trade-off (comment in `auth.ts:17-19`), mitigated by per-page CSP hashes and output escaping — not eliminated.
- The GitHub-side consumer of `content-update` is intended to be `fetch-content.mjs` inside `pages.yml` (per plan comments); the exact workflow shape (commit-back job, `contents: write`, branch-protection handling) is designed but unbuilt.

### 12.3 Open questions (owner decisions pending)

1. **P6 production hosting**: which host + Postgres provider (candidates recorded: Railway/Fly.io + Neon); production `TRUSTED_ORIGINS`; `vars.API_URL`; `EXPORT_TOKEN` as a secret; fine-grained PAT for dispatches; `DISPATCH_ENABLED=true`; then merge to `master`.
2. **Password reset without email (v1?)**: a CLI script (`user:reset-password`) is listed as an open P4 item; nothing is implemented — today a lost password means manual DB intervention.
3. **Will `/admin` ship on the public Pages site**, or stay local-only until P6 hardens? (The role gate ships either way; hosting the API publicly is the real exposure decision.)
4. **Swagger schemas for zod DTOs** are listed as an open item in the plan; `/docs` serves without them today.
5. **Topic restore**: deliberately absent in v1 — revisit if a mis-delete ever matters (slug is reserved, so a manual SQL restore is possible but unsupported).

---

## Appendix A — Verified platform limits (quick reference)

| Limit | Value | Source |
| --- | --- | --- |
| Session lifetime / refresh | 24 h / hourly | D13, `auth.factory.ts` |
| Public GET rate | 60/min/IP shared (429) | `app.module.ts:39-41` |
| Auth sign-in rate | 3 per 10 s (429 + `x-retry-after`) | better-auth, `auth.spec.ts:128-165` |
| Request body | 100 KB | D13, `main.ts:49` |
| Known-delta arrays | ≤ 1,000 ids/call | `progress.schemas.ts:8-11` |
| Quiz event batch | ≤ 100 events | `quiz.schemas.ts:82-84` |
| Quiz event age | ≤ 90 days | D8, `quiz.service.ts:77-86` |
| Attempt history | newest 20 per topic | D8, `scores.ts:7`, retention sweep |
| Public content cache | 5 min TTL, cleared on admin write | D13, `ttl-cache.service.ts` |
| Question field caps | question 300 / answer 2000 / takeaway 240 / snippet 4000 chars, ≤8 tags | `admin.schemas.ts:114-135` |
| Technology visibility | ≥ 3 matching questions | `technologies.ts:19` |
| Quiz attempt size | min(10, ⌊(pool−1)/2⌋) | `quiz.ts:35-37` |
| Quiz scoring | +10/20/30, −½ that | `quiz.ts:3-8` |
| Rebuild debounce / claim TTL / backoff | ~30 s / 5 min / 30s·2ⁿ cap 15 min, 5 attempts | `dispatcher.service.ts`, env-tunable |

## Appendix B — Where to look (map)

| Question | File |
| --- | --- |
| Content shapes and loading | `src/data/types.ts`, `src/data/index.ts`, `src/data/manifest.json` |
| Quiz algorithm | `src/lib/quiz.ts` |
| Local state | `src/lib/storage.ts`, `src/lib/progress.ts`, `src/lib/scores.ts` |
| Sync protocol (client) | `src/lib/sync.ts`, `src/components/SyncProvider.tsx` |
| Sync protocol (server) | `server/src/progress/progress.service.ts`, `server/src/quiz/quiz.service.ts` |
| Admin rules & id assignment | `server/src/admin/admin.service.ts`, `server/src/admin/admin.schemas.ts` |
| Shared content validator | `scripts/validate-content.mjs` |
| Rebuild outbox & dispatcher | `server/src/rebuild/outbox.service.ts`, `server/src/rebuild/dispatcher.service.ts` |
| Export & content version | `server/src/export/export.service.ts` |
| DB ground truth | `server/src/db/schema.ts`, `server/drizzle/*.sql` |
| Auth & role grant | `server/src/auth/auth.factory.ts`, `server/scripts/grant-admin.ts` |
| Plan of record (D1–D16, P0–P6) | `docs/BACKEND_PLAN.md` |
| Architecture & deploy | `docs/TECHNICAL.md`, `.github/workflows/pages.yml` |
| Product brief & editorial rules | `PROMPT.md`, `DESIGN.md`, `technical-lead.md` |
