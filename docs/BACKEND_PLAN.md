# Backend Plan: NestJS + PostgreSQL for `technical-lead`

> **Status:** Approved 2026-10-18, executing in batches · **Date:** 2026-10-18 · **Branch:** `feat/nestjs-backend` (all work)
>
> Revision 11. Revisions 1 to 3 merged a `nestjs-best-practices` review, three codebase reviews
> (frontend/data, backend/security, deploy pipeline) and a verification pass. Revision 4 recorded
> the owner's decisions D1 to D5 and fixed eight findings from the revision 3 review. Revision 5
> recorded the revision 4 defaults as D6 to D10. Revision 6 added D11 to D14 and the gaps they
> exposed. Revision 7 adds the endpoints the `/admin` page design needs. Revision 8 adds D15,
> skeleton loading states for API calls. Revision 9 adds D16, server-assigned readable ids for
> new questions. Revision 10 folds in a review of revision 9: topic delete and create rules,
> safer id assignment and outbox claiming, quiz event edge cases, and three wording fixes.
> Revision 11 folds in the three residuals from the revision 10 verification. The list of
> changes is at the bottom.

## Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Database and hosting.** Development and verification use the local PostgreSQL 18 install (`C:\Program Files\PostgreSQL\18\bin\psql`, 18.2, listening on `localhost:5432`). Production hosting comes later, after development and verification are complete. | Decided |
| D2 | **Source of truth.** The DB owns content after cutover. The committed JSON becomes a seed and a fallback snapshot. Hand edits to `src/data/topics/*.json` stop after cutover. | Decided |
| D3 | **Email verification.** None in v1, and no mail provider. Admin access comes from a CLI script (see Auth), so an unverified signup cannot reach it. | Decided |
| D4 | **Branch rule.** All backend work, this plan included, lives on `feat/nestjs-backend`. Nothing touches `master` until the hosting phase (P6), and P6 starts only with the owner's approval. | Decided |
| D5 | **`CLAUDE.md`.** The owner works alone, so P0 untracks it with `git rm --cached CLAUDE.md`. The `.gitignore` line stays. The untrack is staged and goes into the first P0 commit. | Decided |
| D6 | **CSP.** A post-build script hashes every inline script per HTML file and writes a per-page CSP meta tag. No `'unsafe-inline'`. Used in P4. | Decided |
| D7 | **`/export` access.** A build token (`EXPORT_TOKEN`, sent as a header) protects it. Public GETs keep the throttler. Used in P1. | Decided |
| D8 | **Retention.** `quiz_attempts`: keep the newest 20 per user and topic. `quiz_events`: keep 90 days, and reject events older than that. Used in P4. | Decided |
| D9 | **Shared content rules.** One plain-ESM validator in `scripts/`, imported by the server. The tag map and diagram ids move to JSON. Used in P2. | Decided |
| D10 | **Package trust rule.** First-party packages only (NestJS, better-auth, Drizzle, and the libraries listed in Stack). A community package needs the owner's approval. Applies to all phases. | Decided |
| D11 | **Group order.** Columns on `topics`: `group_label` plus `group_sort_order`. No `groups` table, because there are only 2 groups ("Technical", "Leadership & behavioral"). Move to a table only if groups gain their own fields. Used in P1. | Decided |
| D12 | **Validation library.** zod for every DTO, including the `code` and `diagram` jsonb unions, through a hand-written `ZodValidationPipe` (about 10 lines). It replaces the class-validator global `ValidationPipe`. No `nestjs-zod` (D10). Used in P1. | Decided |
| D13 | **Limits.** Session `expiresIn` 24 h, refreshed while in use. Public GETs: 60 requests per minute per IP. Auth routes: better-auth defaults. Cache TTL 5 min (a backstop, since writes invalidate). Event batch: 100. Delta arrays: 1,000 ids each (above the 532 questions, so a first sign-in fits one call). Request body: 100 KB. Used in P1 and P4. | Decided |
| D14 | **No sanitizer library.** Admin writes are stored as written and escaped on output. Code snippets must keep characters such as `<script>`, so an HTML sanitizer would damage them. Writes get length limits and reject control characters. Used in P3. | Decided |
| D15 | **Skeleton loading.** Every view that waits on an API call with nothing to show yet renders `<Skeleton>` (`src/components/Skeleton.tsx`), shaped like the content it stands in for. Not `loading.tsx`: Next lists static export as unsupported for it (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md:134`), because it needs streaming. Skeletons render in a client component's loading branch or as a `<Suspense>` fallback. See Loading states. Used in P3 and P4; `/admin` already has it. | Decided |
| D16 | **New question ids stay readable and are assigned by the server.** `POST /admin/questions` ignores any id the client sends and assigns `<prefix>-q<N>`, where N is one above the highest number among all of the topic's questions, deleted ones included (so no id is reused). The prefix is the topic's `question_id_prefix` column. This keeps ids short in `#question-id` links, DB rows and logs, and in the same form as the 532 existing ids such as `hr-q1`. The create transaction first takes `pg_advisory_xact_lock(hashtext(topic_slug))`, so two creates in one topic run one after the other and cannot pick the same N. A retry would not work here, because a unique violation aborts the whole PostgreSQL transaction, outbox row included. The primary key stays as a backstop: a violation returns 409. The editor shows the id read-only ("Assigned when you save"). History: the owner asked for UUIDs from the `uuid` package, then for the built-in `crypto.randomUUID()`, then chose readable ids after the readability cost was shown. No package was added, so D10 holds. Used in P3. | Decided |

**Warning for D5.** After the untrack commit, `CLAUDE.md` is an ignored file on this branch, but
`master` still tracks it. Git overwrites ignored files without asking. If you check out `master`,
git replaces your local `CLAUDE.md` with the `master` version and your branch edits are lost.
Copy the file somewhere safe before you switch to `master`. The P6 merge removes the file from
`master`'s index too.

## Open details (decide in the phase that needs them)

| Detail | Options | Phase |
|---|---|---|
| How the admin edits content | **In progress:** a `/admin` page in the static site, designed against a mock (`src/lib/adminApi.ts`). Still open: how it checks the admin role before showing content, and whether it ships to Pages or stays local until P6. | P3 |
| Password reset without email (D3) | a `server/` CLI script `npm run user:reset-password`, or no reset in v1 | P4 |
| Swagger docs for zod DTOs | zod's JSON Schema output fed to `@ApiBody({ schema })`, or hand-written Swagger schemas | P1 |
| Production host and Postgres provider | for example Railway or Fly.io, plus Neon | P6 |

`master` had no branch protection and no ruleset rules on 2026-10-18 (`gh api`), so the
commit-back needs only `contents: write` on its job. Check again at P6.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **NestJS 12** (12.1.x, ESM-first) + TypeScript 5, Express 5 platform | Versions confirmed on npm on 2026-10-18 |
| Modules | ESM throughout: `"type": "module"` in `server/package.json` | better-auth ships ESM only |
| ORM | **Drizzle ORM** + postgres.js, drizzle-kit migrations | Reconfirmed over TypeORM in revision 3 |
| Database | **PostgreSQL 18**, the local install (D1). Two databases: `technical_lead` and `technical_lead_test`. | Production host: P6 |
| Auth | **better-auth 1.7.x**, email/password, **bearer plugin**, `trustedOrigins` | Bearer tokens because cookie sessions break cross-origin from GitHub Pages. OAuth is deferred. |
| Hardening | `@nestjs/throttler`, `helmet`, **zod** with a global hand-written `ZodValidationPipe` (D12), global exception filter (`{ statusCode, message, error }`), env validation with `@nestjs/config` and a schema | The throttler exempts `/health/*` and `/export`. `/export` is outside the throttler and the build token protects it (compared in constant time). |
| Logging | **nestjs-pino** 5.3.x + `app.enableShutdownHooks()` | Peers `@nestjs/* ^11.0.8 \|\| ^12.0.2`, Node `>=22.12.0` (checked on npm) |
| Caching | In-memory TTL cache on public content endpoints, invalidated on admin writes | Valid for one instance. A second instance needs a DB version stamp instead. |
| Docs | `@nestjs/swagger` at `/docs` | Disabled in production. zod DTOs carry no Swagger metadata, so see Open details. |

**Location:** `server/`, a self-contained npm project on this branch.

The frontend keeps `output: "export"`. All API calls are client-side. CORS allowlist:
`http://localhost:3000` now. P6 adds `https://robiparvez.github.io` (origin only, no path).

## P0: Branch setup and root toolchain guards

All on `feat/nestjs-backend`, before any `server/` code:

- `git rm --cached CLAUDE.md` (D5).
- `tsconfig.json`: add `"server"` to `exclude`. It includes `**/*.ts` today, so `next build` would type-check Nest code.
- `eslint.config.mjs`: add `"server/**"` to `globalIgnores`.
- `.gitignore`: add `server/dist` and `!.env.example`. `/node_modules` is anchored to the root, and `.env*` also matches `server/.env.example`.
- Local databases: run `pg_isready`, then `createdb technical_lead` and `createdb technical_lead_test` with the PostgreSQL 18 binaries. Credentials go in `server/.env` only.

## Server structure

```
server/
├── Dockerfile           # for P6: Node >= 22.12; migrate, then start
├── .env.example         # DATABASE_URL, TEST_DATABASE_URL, BETTER_AUTH_SECRET, TRUSTED_ORIGINS,
│                        # EXPORT_TOKEN, DISPATCH_ENABLED, GITHUB_REPO_DISPATCH_TOKEN
├── drizzle.config.ts
├── scripts/
│   └── grant-admin.ts   # npm run admin:grant -- <email>
└── src/
    ├── main.ts          # NestFactory.create(AppModule, { bodyParser: false }); better-auth
    │                    # handler mounted first, then express.json() for Nest routes; /v1 prefix,
    │                    # CORS, helmet, throttler, swagger (non-prod), pino, shutdown hooks,
    │                    # trust-proxy config
    ├── app.module.ts
    ├── db/              # schema.ts, client.ts, seed.ts (insert-only)
    ├── auth/            # toNodeHandler(auth) at /api/auth/*splat, AuthGuard, AdminGuard
    ├── health/  topics/  export/  progress/  quiz/  admin/
    ├── rebuild/         # outbox + dispatcher (see Rebuild pipeline)
    ├── content/         # thin wrapper that imports ../../scripts/validate-content.mjs
    └── common/          # exception filter, cache service
```

The auth handler is a raw Express handler. `setGlobalPrefix('v1')`, the throttler, the
`ZodValidationPipe` and Nest guards do not apply to it. Keep its `basePath` equal to the real mount
path, and configure CORS before the mount. The wiring is written by hand. The trust rule excludes
the community package `@thallesp/nestjs-better-auth`.

## Database schema

Mirrors `src/data/types.ts` and the two localStorage stores.

- **better-auth tables**: `user` (plus `role: 'user' | 'admin'`, default `user`), `session`, `account`, `verification`
- **`topics`**: slug (PK, immutable, never reused), title, requirement, group_label, group_sort_order, sort_order (D11), `question_id_prefix` (unique, immutable; the `<prefix>` in D16, because it is not always the slug), `deleted_at` (soft delete). The topic JSON has no group data today, so the seed reads groups from `src/data/manifest.json` (see Seed). All topics with the same `group_label` must share one `group_sort_order`; the validator checks it.
- **`questions`**: id text PK (immutable, never reused; the server assigns new ids as `<prefix>-q<N>`, D16), topic_slug FK (indexed, `ON UPDATE CASCADE`), difficulty enum, tags text[], question, answer, code jsonb, key_takeaway, diagram jsonb, sort_order, `deleted_at`. **`unique (topic_slug, key_takeaway) WHERE deleted_at IS NULL`**, a partial index so soft-deleted rows do not block reuse. The quiz uses takeaways as options and React keys. Deletes are soft only.
- **`user_known_questions`**: (user_id, question_id) PK, marked_at. `question_id` has an FK to `questions.id`. An unmark deletes the row.
- **`quiz_attempts`**: id, user_id, topic_slug, `client_attempt_id` uuid, number, started_at, question_ids text[], answered, correct, points. **`unique(user_id, topic_slug, number)`** and **`unique(user_id, client_attempt_id)`**. The server assigns `number` on insert. Retention keeps the newest 20 per user and topic (the client's `HISTORY_LIMIT`). Totals live in `quiz_topic_totals`, so pruning loses no score.
- **`quiz_events`**: (user_id, event_id uuid) unique, plus `client_ts`. Stores applied events so a retry is a no-op. Retention keeps 90 days. The API rejects an event whose `client_ts` is older than 90 days, because its replay guard may already be gone.
- **`quiz_topic_totals`**: (user_id, topic_slug): score, correct, wrong, attempt_count. Updated in the same transaction as the event.
- **`quiz_state`**: user_id PK, `reset_epoch` integer, `imported_at` timestamp. `import_local` runs only while `imported_at` is null. Retention never prunes this table.
- **`rebuild_outbox`**: id, status (`pending`, `claimed`, `dispatched`, `failed`), payload, content_version, attempts, next_attempt_at, created_at, dispatched_at. Index on `(status, next_attempt_at)`.

**Seed.** P1 first writes `src/data/manifest.json` by hand from `TOPIC_GROUPS` in
`src/data/index.ts`: group labels, group order, and topic slugs in order. `seed.ts` reads the
manifest and the 20 topic JSONs (532 questions, counted on 2026-10-18), so the server never
imports frontend TypeScript. It inserts missing rows and never overwrites existing ones, so a
re-run cannot erase admin edits. It sets each topic's `question_id_prefix` from its existing question ids (the part before `-q<N>`). P2 then switches `src/data/index.ts` to the same manifest.

## Auth

- Email/password only in v1 (D3). OAuth is deferred. The bearer plugin returns the token in a
  `set-auth-token` response header, and an OAuth callback is a browser redirect, so the token
  never reaches page JavaScript. When OAuth returns, add the `one-time-token` plugin: redirect
  with a one-time code, then exchange it with a `fetch`. Callback URLs must include the base path
  (`/technical-lead/login/`, since `trailingSlash` is on). Do not put tokens in query strings.
- **Admin role comes only from `npm run admin:grant -- <email>`.** No signup path grants it. This
  closes the case where someone registers the admin address first, because email sign-up does not
  require verification.
- Session: `expiresIn` 24 h, refreshed while in use (D13; the default is 7 days; confirm the
  better-auth option names at P1), `revokeSessionsOnPasswordReset: true`, `cookieCache` off, a
  sign-out-everywhere endpoint.
- Rate limiting: better-auth's limiter stores data in memory by default. Set its storage to the
  database, and set `trustedProxies` or `ipAddressHeaders`. Otherwise `x-forwarded-for` can be spoofed.
- Token storage: localStorage is readable by any XSS. DB content reaches raw HTML in one place:
  `src/components/QuestionRail.tsx:187` renders `highlight(snippet)` from `sugar-high` through
  `dangerouslySetInnerHTML`, and the comment at line 184 says `highlight()` escapes the source.
  Everything else renders through React text nodes. A test asserts that a `<script>` snippet
  renders escaped. Admin writes are not sanitized (D14): they are stored as written, length-limited,
  and rejected if they hold control characters.
- CSP: Pages sends no headers, so the CSP goes in a meta tag. Next's nonce approach needs dynamic
  rendering (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md:181`), and its
  experimental SRI option covers script files only. The static export also emits inline
  `<script>self.__next_f...` chunks that differ per page and per build, plus `THEME_SCRIPT`
  (`src/app/layout.tsx:47`). So `scripts/csp-hashes.mjs` runs after `next build`: for each HTML
  file in `out/`, it hashes every inline script and injects a CSP meta tag with those hashes.
- Sign-out clears the token, the local known-questions set, local scores and pending queues. The
  data lives on the server. Without this, the next account on the same browser merges the old data.

## API endpoints (all under `/v1`, except better-auth)

| Endpoint | Auth | Purpose |
|---|---|---|
| `/api/auth/*` (better-auth) | none | sign-up/in/out; `GET /api/auth/ok` smoke test |
| `GET /health/live`, `GET /health/ready` | none | liveness; readiness with DB check. Not throttled. |
| `GET /topics`, `GET /topics/:slug` | none | topics with counts; full topic (cached, throttled) |
| `GET /questions?tag=&difficulty=&limit=&cursor=` | none | filtered, paginated list (throttled) |
| `GET /export` | build token | all topics, groups and questions in one payload, uncached, with a content version hash. Used by `fetch-content.mjs`. |
| `GET /progress/known` | user | `{ questionIds: string[] }` |
| `POST /progress/known` | user | `{ add: string[], remove: string[] }`. Ids are validated against `questions`, arrays are capped, and unknown ids are dropped. |
| `GET /quiz/state` | user | scores snapshot plus `reset_epoch` |
| `POST /quiz/events` | user | capped batch of events, each with a client `event_id` and `client_ts`. The batch is not all-or-nothing: the response lists one result per event, `applied`, `duplicate` (a replayed `event_id`) or `rejected` with a reason, and a client drops a rejected event. Types: `attempt_started` (carries `client_attempt_id`, returns the server number), `answer_recorded` (references `client_attempt_id`; if the server has no such attempt, because the start event was lost or retention removed it, the event is `rejected` with 422), `reset` (for one topic, in one transaction: delete the user's `quiz_attempts` for the topic, set its `quiz_topic_totals` to zero, and increase `reset_epoch`; `quiz_events` rows stay, because they are the replay guard), `import_local` (one time, guarded by `quiz_state.imported_at`). Events run in order. Every quiz event carries the client's `reset_epoch`; on a mismatch with `quiz_state` the event comes back `rejected` with 409 and the client refetches `GET /quiz/state`. Per-event statuses (`applied`, `duplicate`, `rejected` with 422 or 409) are result codes inside the 200 batch response, not HTTP statuses. Validated: `correct <= answered`, bounded `points`, question ids belong to the topic, `client_ts` within 90 days. |
| `GET /admin/topics` | admin | topic list for the `/admin` page: every topic, including drafts (no live question) and soft-deleted ones, each with `draft` and `deleted` flags and question counts. The public `GET /topics` omits them. Added in revision 11. |
| `GET /admin/rebuild` | admin | outbox summary for the `/admin` page: `{ pending, lastSavedAt, requestedAt, failed }`, where `failed` counts rows whose retries are exhausted, so a dead pipeline is visible on the page. Added for the admin page design; `failed` added in revision 11. |
| `GET /admin/topics/:slug/deleted` | admin | soft-deleted questions of one topic, newest first: `{ question, deletedAt }[]`. Added for the admin page; not built. |
| `POST /admin/questions/:id/restore` | admin | clears `deleted_at`, so the question returns under its original id. Returns 422 with `fields.restore` when a live question in the topic now has the same key takeaway (the partial unique index would reject it). Runs the shared validator and inserts an outbox row in the same transaction, like every admin write. Added for the admin page; not built. |
| `POST/PATCH/DELETE /admin/topics[/:slug]`, `/admin/questions[/:id]` | admin | content management. `POST /admin/topics` needs `slug`, `title`, `requirement`, group, and `questionIdPrefix` (unique, lowercase letters, numbers and single hyphens), and may have no questions yet. Such a draft topic stays out of `/export` and the public endpoints until it has a live question. `POST /admin/questions` assigns the next readable id (D16) and ignores a client id, so a client cannot choose or collide one. `PATCH` rejects id, slug and prefix changes. `DELETE` is soft for topics (`deleted_at`) and for questions. A soft-deleted topic keeps its questions and every user row (known marks, attempts, totals), leaves `/export` and the public endpoints, and keeps its slug reserved. A topic restore endpoint is not in v1. Writes run the shared validator and return 422 on failure. Each write inserts an outbox row in the same transaction. |

A 422 response adds `fields: Record<string, string>` (field name to message) to the error
envelope, so the admin form can show each message beside its field.

A 100 KB body limit and string length limits apply to every endpoint. Event batches are capped at
100 and delta arrays at 1,000 ids (D13). The `code` and `diagram` jsonb fields get zod schemas that
mirror `src/data/types.ts` (D12). Sequence `from`/`to` indexes must be in range.

## Content rules (one validator)

- The technology tag map moves from `src/data/technologies.ts` into `src/data/technologies.json`.
  `technologies.ts` imports it and keeps its current exports and its load-time throw.
- The string diagram ids move into `src/data/diagram-ids.json`. `src/components/Diagram.tsx`
  types the `ANIMATED` keys against it, so a missing component fails type-checking.
- `scripts/validate-content.mjs` is plain ESM with no dependencies. It exports
  `validateContent(topics, rules)` and also runs as a CLI. It checks:
  - every tag in the technology map is carried by at least one question
  - `keyTakeaway` is non-empty and unique per topic
  - string diagram ids exist in `diagram-ids.json`
  - all committed question ids still exist
  - no exported topic is empty (a draft topic with no live question is left out of `/export`, so the build never sees an empty topic)
  - topics in one group share one `group_sort_order`
- The server's `content/` module imports the same file and reads the two JSON files from a path
  set by `CONTENT_RULES_DIR`. The P6 Dockerfile copies them into the image. One implementation
  means no sync fixture is needed. The root has no test runner, so the validator is tested from
  the server suite.

## Rebuild pipeline (DB is the source of truth)

On this branch the pipeline runs locally. GitHub Actions cannot reach a local API, so the
Actions part goes live in P6.

1. **Admin edit.** One transaction updates content and inserts an outbox row. A worker claims
   rows with `FOR UPDATE SKIP LOCKED` and marks them `claimed` in a short transaction, then
   commits, so no lock or connection stays open. Outside any transaction it waits for the
   debounce window (~30s, computed from `created_at` so a restart does not lose it), checks for
   newer pending rows (it folds them into the same dispatch), and sends one
   `repository_dispatch`. A `claimed` row older than 5 minutes returns to `pending`, so a crashed
   worker loses nothing. It retries
   with backoff using `attempts` and `next_attempt_at`, and a cleanup job removes old dispatched
   rows. Failures stay in the outbox and never reach the admin response. The `client_payload`
   carries `content_version`. While `DISPATCH_ENABLED=false` (the default until P6), the worker
   logs the payload and marks the row dispatched without calling GitHub. The P6 token is a
   fine-grained PAT scoped to this repo with Contents: read & write (verified in revision 3).
2. **Fetch.** `scripts/fetch-content.mjs` calls `GET /export` with the build token, a timeout and
   3 retries. It checks the response against the `Topic` schema, asserts `content_version` when
   one is given, runs the validator, writes `manifest.json` and `src/data/topics/*.json`, and
   deletes topic files for topics that `/export` no longer lists (soft-deleted topics included). It never writes `technologies.json`: the technology list is a hand-kept file, and adding a technology is a code change. A question tag that is not in that file is fine, because it just is not a technology page. On this branch you run it against
   `http://localhost:3001`, then run `npm run build`.
3. **Registry refactor.** `src/data/index.ts` becomes a loader over `manifest.json` with the same
   exports (`TOPIC_GROUPS`, `TOPICS`, `getTopic`, `getSearchIndex`). The manifest carries group
   labels and group order. `generateStaticParams` reads it. The `Topic` types and the search index
   shape stay unchanged.
4. **Workflow changes, written on this branch, live only after the P6 merge.** `pages.yml` gains
   `repository_dispatch`, the fetch step, the `csp-hashes.mjs` step, `vars.API_URL`, the
   `EXPORT_TOKEN` secret, and `paths-ignore: server/**` on `push`. On a `repository_dispatch` run,
   any fetch failure fails the job and the old site stays up. On `push` and `workflow_dispatch`
   runs, the fetch falls back to the committed snapshot. A commit-back step needs `contents: write`
   on its job only (`pages.yml:10` grants `contents: read` today), and it must handle branch
   protection and a push conflict when `master` has moved. `repository_dispatch` runs workflows
   from the default branch, which is why none of this works before the merge.

## Frontend additions (no new heavy deps)

- `src/lib/api.ts`: typed fetch wrapper (bearer token). DTO types are kept in sync with the server by hand.
- `src/lib/auth.ts`: better-auth `createAuthClient` with the bearer plugin client.
- `/login` page (client component, export-safe; wrap any `useSearchParams` use in `Suspense`) and an account control in the sidebar. It follows the CSS rules: tokens only, no fills.
- A client sync provider inside `Shell`, started after mount (the store server snapshot is empty by design). Export the stores from `progress.ts` and `scores.ts` so it can reach them. **Signed-out rule:** if no token is stored, the user is signed out at once. The provider renders local data with no skeleton and makes no session call. Only a stored token starts the session check, and only then do the P4 skeletons show.
- **Known questions sync.** The client keeps a queue of pending `add`/`remove` operations in localStorage. On sign-in it GETs the server set, applies the queue on top, and POSTs the result. Operations replay in order, so an unmark is never undone by a stale device. First sign-in uploads the local set as `add` operations.
- **Quiz sync.** The client assigns a local `client_attempt_id` (uuid) and shows its local number at once. It queues events in localStorage and flushes them when online. The server returns the canonical number, and the client reconciles it. If the server answers 409 for a stale `reset_epoch`, the client refetches `GET /quiz/state`. Queued events older than 90 days are dropped with a notice. First sign-in sends one `import_local` event. For a signed-in user, server totals are authoritative.
- Signed out or offline: today's behavior, exactly.
- Loading states follow D15 (next section).
- `NEXT_PUBLIC_API_URL`: `.env.local` (`http://localhost:3001`) on this branch. P6 adds the repo variable `vars.API_URL` (not a secret, because it is inlined into the bundle).
- Docs: `CLAUDE.md` (local only after D5: carve out `server/` and client-side API calls from the "no request-time server" rule), `README.md`, and `docs/TECHNICAL.md` (the line "There is no server", the sync rules, and the frozen-JSON rule).

## Loading states (D15)

Every view that waits on an API call gets a skeleton, except the prerendered pages.

`src/components/Skeleton.tsx` takes a `label` (read by screen readers through `role="status"`)
and shapes: `rows` (list rows), `field` (a labelled control) and `line` (one status line). The
shapes are `aria-hidden` outlines in `--color-border-subtle`, with no fill, so the CSS rules hold.
A slow opacity pulse stops under `prefers-reduced-motion`. An error replaces the skeleton with a
`role="alert"` message and a retry, never an endless skeleton.

| Where | API call | Skeleton | Phase |
|---|---|---|---|
| `/admin` topic list | `GET /admin/topics` (revision 11) | topic field and 6 rows | done (mock) |
| `/admin` questions | `GET /topics/:slug` | 6 rows | done (mock) |
| `/admin` header | `GET /admin/rebuild` | one line | done (mock) |
| `/admin` role check | session check | the topic-list skeleton, until the role is known | P3 |
| `/admin` deleted list | `GET /admin/topics/:slug/deleted` | 2 rows. It disappears when the list is empty, which the owner accepted. | done (mock) |
| Sidebar account control | session check | one line | P4 |
| `/login` | session check; also the `<Suspense>` fallback around `useSearchParams` | a field and a button shape | P4 |
| `/quiz` and `/quiz/<slug>` scores, signed in | first `GET /quiz/state` | score lines, until the first response | P4 |
| Known-question marks and progress counts (sidebar, rail), signed in | first `GET /progress/known` | a small outlined placeholder in place of each mark and count, until the first sync answers. Signed out or offline, the local set renders at once with no skeleton. Failure keeps the local set. | P4 |
| Topic, technology, references and home pages | none at request time | none: prerendered at build | n/a |

## CI

New `.github/workflows/server-ci.yml` on this branch: Node 24 with
`cache-dependency-path: server/package-lock.json`, a `postgres:18` service to match D1, then
lint, unit tests, e2e, build. It triggers on pushes to `feat/nestjs-backend` and on pull requests,
so it runs without touching `master`.

## Build & verify (all local, on this branch)

1. **Step 0.** `pg_isready` passes, both databases exist, migrate and seed to 20 topics / 532 questions.
2. **Unit and e2e (Supertest, `TEST_DATABASE_URL`, schema reset per run):**
   - auth, including `GET /api/auth/ok`; a signup with the admin address gets no admin role; bearer revocation; auth rate limit
   - progress deltas: unknown ids dropped, unmark survives a stale-client sync
   - quiz: idempotent replay of the same `event_id`; concurrent `attempt_started` hits the unique constraint and retries; stale `reset_epoch` returns 409; an event older than 90 days is rejected; `import_local` runs once, even after `quiz_events` pruning; attempt retention keeps 20; `answer_recorded` for an unknown attempt is `rejected` with 422 and the rest of the batch still applies; `reset` clears attempts and totals for the topic, bumps the epoch, and keeps `quiz_events`
   - admin: non-admin rejected; id and slug changes rejected; delete is soft; a tag removal that would break `technologies.json` returns 422; a soft-deleted topic leaves `/export` and the public GETs but keeps its questions and all user rows, and its slug cannot be reused; `GET /admin/topics` lists drafts and soft-deleted topics that `GET /topics` omits; a new topic needs a unique `questionIdPrefix`, and an empty draft topic stays out of `/export`; the new-question id skips a deleted question's number, ignores a client id, and N concurrent creates in one topic all succeed with different ids (advisory lock)
   - admin restore: a deleted question appears in the deleted list and comes back under its id; a restore whose key takeaway a live question now uses returns 422 with `fields.restore`; a new question cannot take a deleted question's id
   - `/export` without the build token returns 401; public GETs return 429 past the limit
   - outbox: SKIP LOCKED claim that commits before the debounce wait, a stale `claimed` row returns to `pending`, newer rows fold into one dispatch, backoff, dispatch mocked, content write succeeds when GitHub fails, `DISPATCH_ENABLED=false` makes no network call
   - validator: each rule has a failing fixture
   - exception-filter envelope; CORS preflight from `http://localhost:3000`
   - migrations apply cleanly; `seed.ts` run twice changes nothing
3. **Local pipeline.** API on :3001, admin edit, `fetch-content.mjs`, `npm run build`, `csp-hashes.mjs`, then serve `out/` and check that no CSP violation appears in the console and the theme does not flash. A removed question id fails the fetch. A mismatched `content_version` fails the fetch. API down makes the fetch fail.
4. **Manual pass.** Run the frontend, sign in, mark a question known, check the DB row, unmark it in a second browser. With the network throttled, each row of the Loading states table shows its skeleton and then the content; with the API stopped, each shows its error and retry. A `<script>` code snippet renders as text. Run `npm run build` and `npm run lint` at the root with `server/` present.

## Phases

| Phase | Scope | Depends on |
|---|---|---|
| P0 | Branch setup: untrack `CLAUDE.md`, root toolchain guards, local databases | none |
| P1 | Hand-written `src/data/manifest.json`, `server/` skeleton, `ZodValidationPipe`, schema, migrations, seed, `/health/*`, `/topics`, `/questions`, `/export` (build token), `server-ci.yml` | P0 |
| P2 | Content-rules JSON, `validate-content.mjs`, manifest refactor, `fetch-content.mjs` | P1 |
| P3 | Admin API (including `GET /admin/topics`, `GET /admin/rebuild`, the deleted list, and restore), outbox, dispatcher (`DISPATCH_ENABLED=false`), local pipeline test. Then switch `src/lib/adminApi.ts` from the mock to `fetch` calls and add the admin role check to `/admin` (needs P4 auth). | P2 |
| P4 | Auth, progress sync, quiz events, login UI, sync provider, `csp-hashes.mjs`, the P4 skeletons (D15) | P1 |
| P5 | Docs | P3, P4 |
| P6 | **Later, with the owner's approval.** Choose the production host and Postgres, deploy with the Dockerfile, add `https://robiparvez.github.io` to CORS and `trustedOrigins`, set `vars.API_URL`, `EXPORT_TOKEN` and the dispatch PAT, set `DISPATCH_ENABLED=true`, merge to `master`, then verify a dispatch-triggered Pages build in the Actions log. | P5 |

P3 and P4 can run in parallel, except the last P3 step (the admin role check on `/admin`), which waits for P4 auth.

## Known limitations (accepted for v1)

- **Client-computed quiz points.** `answer_recorded` trusts the client's points. Fine for a self-study tool, not anti-cheat. The server still bounds the values.
- **Theme stays localStorage-only.**
- **No OAuth and no email verification** (D3).
- **Single-instance cache.** Scale out only after the cache moves to a DB version stamp.
- **Hand edits to topic JSON stop after cutover** (D2).
- **Bearer token in localStorage.** An XSS can read it. The per-page CSP and output escaping reduce the risk.
- **Offline queue has a 90-day limit.** Older queued quiz events are dropped.
- **No live rebuild before P6.** The dispatch pipeline runs only locally and in tests until hosting and the merge.

## Changes in revision 11

The owner approved the plan and the three residuals from the revision 10 verification.

1. `GET /admin/topics` (admin): every topic including drafts and soft-deleted ones, with flags and counts. The `/admin` topic list uses it instead of public `GET /topics`, so a newly created draft topic stays reachable and editable.
2. `GET /admin/rebuild` adds `failed`, so exhausted retries are visible on the admin page.
3. Quiz events carry `reset_epoch`, and the per-event statuses are result codes inside the 200 batch response.

## Changes in revision 10

A review of revision 9 gave nine findings. Eight are fixed. One is partly rejected.

1. **Topic delete (high).** Topics get `deleted_at`. A soft-deleted topic leaves `/export` and the public GETs, and keeps its questions, user rows and slug. No topic restore in v1. Fetch removes the files of topics that `/export` no longer lists.
2. **Topic create.** `POST /admin/topics` needs a `questionIdPrefix`, stored in a new unique column, because the prefix is not always the slug. A topic may start empty as a draft that stays out of `/export`. The seed fills the prefix from the existing ids.
3. **Tag map: rejected in part.** The review asked for a rule that every question tag must be in the map. That rule would be wrong: question tags are free text, and the map lists only technologies (a tag that is not a technology is normal). What was true: the rebuild never updates the map. The plan now says so, and says that adding a technology is a code change.
4. **Concurrent creates.** A retry inside the transaction cannot work in PostgreSQL, because a unique violation aborts the whole transaction. The create takes a per-topic advisory lock, so creates run in turn. The primary key stays as a backstop and returns 409.
5. **Unknown attempt.** `answer_recorded` for an attempt the server does not have is rejected with 422. The batch returns one result per event and is not all-or-nothing.
6. **Reset.** The event clears the topic's attempts and totals and bumps `reset_epoch` in one transaction. `quiz_events` stay as the replay guard.
7. **`/export` and the throttler.** The two statements are now one: `/export` is outside the throttler, and the build token protects it.
8. **Signed-out rendering.** No stored token means signed out at once, with no skeleton and no session call.
9. **Outbox lock.** The worker claims rows with a status change, commits, waits outside any transaction, then folds in newer rows before it dispatches. A stale `claimed` row returns to `pending`.

## Changes in revision 9

1. D16: new question ids stay readable (`<prefix>-q<N>`) and the server assigns them. UUIDs were tried (the `uuid` package, then `crypto.randomUUID()`) and removed, because UUIDs are hard to read in links, rows and logs. No package was added, so D10 has no exception.
2. The next number counts deleted questions too, so a deleted id is never reused. A concurrent-create clash is caught by the primary key and retried once.
3. The `/admin` editor shows the id read-only ("Assigned when you save"). The mock assigns it in `saveQuestion`, and the client no longer checks the id, because the client never sends one. A test in P3 covers: the id skips a deleted question's number, a client id is ignored, and two concurrent creates both succeed with different ids.

## Changes in revision 8

1. D15: skeleton loading for every API wait, through `src/components/Skeleton.tsx`. `loading.tsx` is not used, because Next does not support it in a static export.
2. New Loading states section lists each API wait and its skeleton. Only the prerendered pages get none, because they call no API.
3. `/admin` shows skeletons for the topic list, the questions, the deleted list and the rebuild line. P4 adds the account, login, quiz-score, and known-question skeletons. The manual pass checks them.

## Changes in revision 7

1. The `/admin` page exists on this branch, built against a mock in `src/lib/adminApi.ts`. It needed three endpoints the plan lacked: `GET /admin/rebuild`, `GET /admin/topics/:slug/deleted`, and `POST /admin/questions/:id/restore`.
2. 422 responses carry a `fields` map, so the form can show each message beside its field.
3. P3 now ends by replacing the mock with real calls and adding the admin role check. Restore tests added.

## Changes in revisions 5 and 6

1. The five revision 4 defaults became decisions D6 to D10.
2. D11 to D14: group columns on `topics`, zod with a hand-written pipe, concrete limits, no sanitizer library.
3. Seed reads a hand-written `src/data/manifest.json` (created in P1), so the server never imports frontend TypeScript. The validator checks group order.
4. Open details now list the admin editing surface, password reset without email, Swagger docs for zod DTOs, and the P6 host.
5. Branch protection checked: `master` had none on 2026-10-18.

## Changes in revision 4

1. D1 to D5 recorded: local PostgreSQL 18, DB as source of truth, no email verification, branch-only work, `CLAUDE.md` untracked. Docker Compose dropped. CI uses `postgres:18`.
2. New P6 hosting phase. All `master`, Pages-workflow, production CORS and PAT steps moved there. `DISPATCH_ENABLED` flag added.
3. CSP: per-page hashes from a post-build script, because the static export emits per-page inline scripts.
4. XSS citation corrected to `QuestionRail.tsx:187`.
5. `/export` protected by a build token. Public GETs keep the throttler.
6. One retention rule per table, a 90-day event window, and `import_local` guarded by `quiz_state.imported_at`.
7. One shared validator in plain ESM, with the tag map and diagram ids moved to JSON. The fixture-sync approach was dropped, because the root has no test runner.
8. Package trust rule defined. `@thallesp/nestjs-better-auth` excluded.
9. Commit-back permission and branch-protection notes added to the P6 workflow changes.

## Verification notes (2026-10-18)

- **PostgreSQL**: `psql (PostgreSQL) 18.2` at `C:\Program Files\PostgreSQL\18\bin`; `pg_isready` reports `localhost:5432 - accepting connections`.
- **Branch**: `feat/nestjs-backend` is checked out. `AGENTS.md` is tracked. `CLAUDE.md` is untracked (removal staged, D5), and `.gitignore:8` lists it.
- **nestjs-pino** 5.3.1: peers `@nestjs/* ^11.0.8 || ^12.0.2`; engines Node `>=22.12.0` (`npm view`).
- **Inline scripts**: `out/index.html` from the last build contains several `<script>self.__next_f` chunks.
- **Next CSP doc**: nonces need dynamic rendering (line 181). SRI is experimental (line 458).
- **PAT**: fine-grained = Contents: read & write, scoped to this repo; classic = `repo` scope (GitHub REST docs, checked in revision 3).
- **one-time-token plugin**: checked in revision 3. A 3-minute token that the other origin exchanges for the session.
- **Codebase facts**: `master` is the default branch; `tsconfig` includes `**/*.ts`; `.env*` matches `server/.env.example`; `trailingSlash: true`; 532 questions; `pages.yml:10` grants `contents: read`.
