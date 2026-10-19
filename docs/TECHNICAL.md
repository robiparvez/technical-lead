# Technical Lead Study Guide (technical notes)

This file holds the developer-facing details that used to live in the README: structure, the backend, design tokens, component behavior, deploy setup, versions and verification. For a plain description of the app, see the [README](../README.md).

The live site is at https://robiparvez.github.io/technical-lead/.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Production build: `npm run build`, then `npm start` (`next start`). Every page renders per request from the API, so the API in `server/` must be running (commands in Backend). The build itself does not call the API.

## Deploy

The site is no longer a static export (`output: 'export'` is gone). A Next server reads all content from the NestJS API on each request (`src/lib/content.ts`, `GET /v1/export`, `cache: 'no-store'`). The Next server needs `API_URL` (default `http://127.0.0.1:3001`) and `EXPORT_TOKEN`; when `EXPORT_TOKEN` is unset in dev it is read from `server/.env`. If the API is unreachable, pages return HTTP 500 and show `src/app/error.tsx`.

The old GitHub Pages deploy (`pages.yml`) was removed, because Pages cannot run a Node server. `.github/workflows/web-ci.yml` now runs lint, a type check and the build on pull requests and on the backend branch; it deploys nothing. Hosting for the Next server and the API is the open P6 decision. `PAGES_BASE_PATH` and `trailingSlash` are kept in `next.config.ts` for now.

## Backend

A NestJS 12 API lives in `server/` — its own npm project with its own tests (plan of record: `docs/BACKEND_PLAN.md`). It owns accounts, progress and quiz sync, and (after cutover) the content itself. The Next server reads content from it per request, and the browser calls it for accounts, sync and admin edits. It listens on port 3001 (`PORT` in `server/.env`), and the site targets it at `NEXT_PUBLIC_API_URL`, which defaults to `http://localhost:3001` when unset (`src/lib/auth.ts`; `.env.local` pins it in development).

Local commands (inside `server/`):

```bash
npm install
cp .env.example .env      # DATABASE_URL, BETTER_AUTH_SECRET, EXPORT_TOKEN, ...
npm run migrate           # drizzle-kit migrations
npm run start:dev         # dev API on http://localhost:3001 (npm run build && npm run start otherwise)
npm test                  # vitest unit + e2e against technical_lead_test
npm run admin:grant -- <email>   # the only path to the admin role
```

Routes — global prefix `/v1`; better-auth mounts raw at `/api/auth/*` (outside the prefix, with `GET /api/auth/ok` as a smoke test); Swagger at `/docs` only when `NODE_ENV=development`:

- Public GETs, throttled 60 requests/min/IP, in-memory cache with a 5 min TTL that admin writes invalidate: `GET /v1/topics`, `GET /v1/topics/:slug`, `GET /v1/questions?tag=&difficulty=&limit=&cursor=` (`limit` 1–100, default 20). Draft topics (no live question) and soft-deleted rows are omitted.
- `GET /v1/export` — all groups, topics, questions and technologies in one payload with a `content_version` hash (groups and topics only). Exempt from the throttler; protected by the build token (`x-export-token` header, compared in constant time). Read by `src/lib/content.ts` on every page request.
- Signed-in user (bearer token): `GET`/`POST /v1/progress/known`, `GET /v1/quiz/state`, `POST /v1/quiz/events`.
- Admin (bearer token plus admin role): `GET /v1/admin/topics` (drafts and soft-deleted included), `POST /v1/admin/topics`, `GET`/`PATCH`/`DELETE /v1/admin/topics/:slug`, `GET /v1/admin/topics/:slug/deleted`, `POST`/`PATCH`/`DELETE /v1/admin/questions[/:id]`, `POST /v1/admin/questions/:id/restore`.
- `GET /v1/health/live` and `GET /v1/health/ready` (readiness checks the DB); unthrottled.

Validation is zod behind a hand-written `ZodValidationPipe`. Errors use one envelope, `{ statusCode, message, error }`; a 422 adds `fields: Record<string, string>`, which the admin form shows beside each field. Deletes are soft; question ids are immutable, and the server assigns new ones as `<prefix>-q<N>` counting deleted questions, so no id is ever reused.

### Auth

better-auth with email/password and the bearer plugin. Bearer tokens, not cookies, because the site and the API run on different origins, where cross-origin cookie sessions do not work. The token arrives in the `set-auth-token` response header and is stored in localStorage (`tl-auth-token`) — readable by XSS, accepted as a known limitation, with output escaping as the mitigation (the CSP is only a baseline now, see Content Security Policy). Sessions last 24 h and refresh while in use. No email verification and no OAuth in v1 (D3); the admin role comes only from the `admin:grant` CLI above, never from signup. Sign-out revokes the session server-side and clears the token, both pending queues, the local known set and the local scores, so a following account on the same browser starts clean.

Passwords: better-auth's own routes, with no extra package. "Forgot password" calls `POST /api/auth/request-password-reset` (the answer is the same for known and unknown emails; `redirectTo` must be a trusted origin). The reset token lives in the `verification` table, works once, and expires after 30 minutes. A successful reset (`POST /api/auth/reset-password`) signs out every session of that account. Change password (`POST /api/auth/change-password`) needs the current password and signs out the other devices. Mail: `server/src/mail/send-mail.ts` sends plain-text mail over SMTP to `SMTP_HOST`/`SMTP_PORT` (`MAIL_FROM` is the sender), with no TLS and no login, using only `node:net`. In dev, MailHog catches it: start `MailHog.exe -smtp-bind-addr 127.0.0.1:1025 -api-bind-addr 127.0.0.1:8025 -ui-bind-addr 127.0.0.1:8025`, set the three variables from `server/.env.example`, and read the mail at http://localhost:8025. Two mails go out (`server/src/auth/auth-mail.ts`): the reset link, and a "password was changed" notice after a reset or a change. A send failure is logged and never breaks the request. With `SMTP_HOST` empty nothing is sent: outside production the mail text is logged, and in production only a warning is logged. Before production, replace `send-mail.ts` with a client that supports STARTTLS and login (nodemailer, a community package, so the owner approves it first).

### Content (the DB is the source of truth)

PostgreSQL owns every group, topic, question and technology. The Next server reads them per request: `src/lib/content.ts` calls `GET /v1/export` with the build token, and `src/data/index.ts` and `src/data/technologies.ts` turn the result into the helpers the pages use. An admin edit is visible on the next page load, with no rebuild step.

No JSON file holds content any more. Back the database up with `pg_dump`. `src/data/diagram-ids.json` stays: it lists the animated diagram components, which are code. The e2e tests load a fixture snapshot from `server/test/fixtures/seed/` into the test database only (`server/test/support/seed.ts`).

The rebuild outbox, its dispatcher and `GET /v1/admin/rebuild` were removed once the site began reading the database per request. Each admin write still runs the shared content validator inside its transaction (`ContentService.assertValid`), and the `rebuild_outbox` table is dropped by migration `0003`.

### Sync rules (signed in)

- **Known questions.** Marks and unmarks apply locally at once and append `add`/`remove` ops to a localStorage queue. The sync engine (`src/lib/sync.ts`, run by `src/components/SyncProvider.tsx` after the session check, on sign-in, and on later activity) GETs the server set, replays the queue on top in order, and POSTs the result (chunked at 1,000 ids per call). Replaying in order is what keeps an unmark from being undone by a stale device. First sign-in uploads the local set as adds.
- **Quiz events.** Every event carries a client-assigned `event_id` (uuid) and `client_ts`; the server dedupes on `event_id`, so a replayed event is a `duplicate`. `attempt_started` carries a `client_attempt_id`; the server assigns the attempt number and the client reconciles it. Every event also carries the client's `reset_epoch`; a mismatch comes back `rejected` with code 409 and the client refetches `GET /v1/quiz/state`. `answer_recorded` for an attempt the server no longer has is `rejected` (422) and the rest of the batch still applies: the 200 response lists one result per event — `applied`, `duplicate`, or `rejected` with a 422/409 code — and the client drops rejected events. `reset` clears the topic's attempts and totals and bumps the epoch in one transaction, keeping `quiz_events` rows as the replay guard. `import_local` (first sign-in, carrying the local totals) runs once, guarded by `quiz_state.imported_at`. Events older than 90 days are dropped client-side with a notice and rejected server-side; batches cap at 100 events; attempt history keeps the newest 20 per user and topic.
- **Signed out or offline:** no API calls at all — the localStorage-only behavior the site always had. Server totals are authoritative only while signed in; a failed sync keeps the local data and offers a retry.

### Content Security Policy

`next.config.ts` sends `X-Content-Type-Options`, `Referrer-Policy` and a CSP with only `frame-ancestors 'none'; base-uri 'none'; object-src 'none'`. The earlier per-page script hashes (`scripts/csp-hashes.mjs`) worked only for a static export and are removed. A nonce-based `script-src` is the follow-up; until it exists, scripts are not restricted by CSP.
### What waits for P6

Everything production: hosting and the production database, `https://robiparvez.github.io` added to CORS and `trustedOrigins`, the `vars.API_URL` build variable, the `EXPORT_TOKEN` secret, a host that runs the Next server (with `API_URL` and `EXPORT_TOKEN` set), a deploy workflow for that host (the Pages workflow is gone), and the merge to `master`.

## Versions

| Package | Version | Source |
| --- | --- | --- |
| Next.js | 16.3.8 | `npm view next version`, 2026-10-01 |
| React | 19.2.8 | create-next-app |
| remotion / @remotion/player | 4.0.532 | `npm view` |

Node v24.3.0 was used (create-next-app requires 18.18+ or 20.9+). The API in `server/` carries its own dependency list (`server/package.json`, Node >= 22.12); the plan of record for it is `docs/BACKEND_PLAN.md`.

Remotion license: free for individuals, including personal use
(https://www.remotion.dev/docs/license/faq). This project is personal study use.

## Structure

- `src/lib/content.ts` — the one server-side reader: fetches groups, topics, questions and technologies from the API per request. `src/data/index.ts` holds the async helpers over it
- `src/data/technologies.ts` — async helpers over the technologies from the database (`technologies` table: slug, label, tags, sort order). A technology with fewer than 3 matching questions is hidden
- `src/data/diagram-ids.json` — the animated diagram id set, shared with the server's content validator; `src/components/Diagram.tsx` types its `ANIMATED` keys against it, so a missing component fails type-checking
- `src/components/QuestionRail.tsx` — difficulty rail with stations and progress glyphs; each card lists its tags as links to `/?tag=<tag>`
- `src/components/SearchResults.tsx` — home index ("Study guide"): topic cards and technology cards, `?q=` search results, or the questions carrying one `?tag=` across all topics
- `src/app/technologies/[slug]/page.tsx` — one page per technology: every matching question across all topics on the difficulty rail, each card labelled with its topic
- `src/components/Diagram.tsx` — diagram host: every diagram plays as a looping @remotion/player animation
- `src/components/diagrams/` — Remotion compositions: hand-built diagrams and `SpecDiagram`, which animates any JSON-authored `DiagramSpec`
- `src/styles/tokens.css` — every design token as a CSS custom property, with light and dark values
- `src/styles/reset.css` — the only file with background declarations (the themed page canvas, repeated on the sticky desktop header so scrolled content stays hidden; everything else transparent/none)
- `src/components/ThemeSwitch.tsx` — light/dark icon toggle; follows the OS until clicked, then saves the choice in localStorage
- `src/app/admin/page.tsx`, `src/components/AdminConsole.tsx`, `src/components/QuestionEditor.tsx` — content admin at `/admin` (not linked from the nav, `noindex`), gated on the admin role from the session: pick a topic, edit its details, add, edit, or delete questions, with the validation checks beside the form
- `src/components/Skeleton.tsx` — outlined placeholder shapes shown while an API call is in flight; API calls from the browser have no route-level loading state
- `src/lib/api.ts` — typed `fetch` wrapper for the API: attaches the stored bearer token, turns the JSON error envelope (plus the 422 `fields` map) into a thrown error, and holds the DTO types hand-synced with the server's zod schemas
- `src/lib/auth.ts` — better-auth client (bearer token captured from the `set-auth-token` header into localStorage) plus the API base URL
- `src/lib/sync.ts`, `src/components/SyncProvider.tsx` — the sync engine and its provider: localStorage queues for known-question ops and quiz events, flushed per the Backend sync rules; signed out, it makes no calls at all
- `src/app/reset-password/`, `src/app/admin/account/`, `src/components/PasswordForms.tsx` — the reset page the emailed link lands on (new password twice, token from `?token=`) and the signed-in change-password form (current password, new password twice; other devices are signed out and this session gets a fresh token). The "Forgot password?" form is a mode of `AdminSignIn.tsx`
- `src/app/login/`: admin sign-in / sign-up page; redirects to `?next=` and defaults to `/admin`. The site shows no sign-in link to visitors
- `src/lib/adminApi.ts` — admin API client for `/admin`: typed calls to the `/v1/admin/*` endpoints through the bearer wrapper, plus the client-side validation that mirrors the server's (the server validates again on every save)

## Token-to-component mapping

Every color token is `light-dark(light, dark)`. The OS preference picks the branch unless the reader chooses Light or Dark.

| Token | Used by |
| --- | --- |
| `--color-canvas` | page background (`html`, in `reset.css`) |
| `--color-text-primary` | headings, question text, answer body, borders on hover/active, static SVG labels |
| `--color-text-secondary` | eyebrows, metadata, nav idle text, tag chip text, code comments and punctuation |
| `--color-accent` | difficulty rail line, focus rings, known-check glyph, search match underline, key-takeaway rule, active diagram path, selected-nav and pressed-theme border |
| `--color-border-control` | control boundaries at 3:1: buttons, search input, tag chips, quiz options and radios, code block rule, progress rings |
| `--color-border-subtle` | card outlines, hairlines, frame edges (decorative only) |
| `--color-code-*` | syntax tokens: keyword, string, entity, type, property |
| `--space-3xs`-`--space-3xl` | all paddings and gaps (4px to 80px) |
| `--radius-md` | outlined cards, player frames |
| `--radius-sm` / `--radius-xs` | search input and buttons / badges and tag chips |
| `--border-width-1` / `--border-width-2` | default borders / active, focus, and rail weights |
| `--text-xs`-`--text-xl` | labels 13px, controls and code 15px, body 17px, questions 19px, titles 24-34px |
| `--leading-*` | label, UI, body (1.65), code, and title line heights |
| `--measure` | answer line length (about 75 characters) |
| `--duration-theme` / `--ease-theme` | theme toggle only: the sun/moon icon swap and the page cross-fade |
| Geist / Geist Mono | `next/font` variables `--font-geist-sans`, `--font-geist-mono` |

## DESIGN.md amendments

1. All background colors removed (UI surfaces and diagram fills); `color.surface.muted`, `color.surface.base`, `color.surface.strong` deleted. Canvas stays white via `color-scheme: light`.
2. `color.surface.raised` renamed to `color.accent` (#c8553d); borders, rules, focus rings, underlines, glyph strokes only, never text.
3. `color.text.tertiary` deleted (2.81:1 cannot carry information).
4. Added `border.width.1 = 1px`, `border.width.2 = 2px`.
5. `radius.lg` dropped (corrupted value in DESIGN.md).
6. Added `font.lineHeight.reading = 26px` for 16px phone answer body (derived from 22.75/14).
7. Added Geist Mono (`font.family.mono`) via `next/font`.
8. Space scale gap: `space.8` (18px) is too tight for section separation; sections compose `calc(var(--space-8) * 2)` = 36px instead of a new token, as instructed.
9. Reading-comfort redesign (supersedes parts of 1, 2, 6, and 8; see PROMPT.md): low-glare light and dark themes that follow `prefers-color-scheme` or a saved choice; a themed page canvas (never pure white or black) is the only fill; DESIGN.md's hex palette, px type scale, and space scale replaced by OKLCH colors, a rem type scale with a 17px body, and a 4px-to-80px space scale; muted syntax colors for TypeScript snippets via `sugar-high`; `shadow.1` removed (unused).

## Component behavior

Every interactive component: keyboard, pointer, touch. State rules live in `src/styles/app.css` (default, hover, focus-visible, active, disabled; loading and error where meaningful).

| Component | Keyboard | Pointer / touch |
| --- | --- | --- |
| Skip link | First Tab stop; Enter moves focus to `#main` | Tap jumps to content |
| Search input | `/` anywhere focuses it; type filters live; Escape clears the browser's search text; the box mirrors `?q=` and re-reads it on every route change, so a topic page or tag link shows it empty and Back restores the query | Tap opens (phone panel); typing filters after 200 ms debounce |
| Menu / Search buttons (phone) | Tab + Enter toggles panel; `aria-expanded` reflects state; Menu shows a hamburger icon | Tap toggles in-flow panel; 44 px target |
| Sidebar toggle (desktop) | Tab + Enter, or Ctrl+B (Cmd+B on macOS) from anywhere except rich-text editors, collapses or restores the sidebar; focus moves to the toggle that replaces the unmounted one; `aria-expanded` and `aria-keyshortcuts` set | Click the hamburger at the top of the sidebar to collapse, the floating hamburger top-left to restore; 44 px target |
| Admin frame (`/admin`) | `app/admin/layout.tsx` draws the same frame as the site (`AppFrame` in `Shell.tsx`: collapsible sidebar, Ctrl+B or Cmd+B, sticky header, phone menu) with the admin nav (`AdminNav`), the project title ("Technical Lead Study Guide") as brand, a 72 rem content column, and no search: the Search button, the search panel and the `/` shortcut are absent. The root `Shell` steps aside under `/admin` and only keeps `SyncProvider` mounted. A new admin page needs one entry in `SECTIONS` in `AdminNav.tsx`. Sign out, from any page, goes to `/admin`, which shows the Admin sign-in screen while nobody is signed in | Tap the hamburger for the phone menu; the "Study guide" link in the nav returns to the site |
| Section fold toggle | The Topics and Technologies headings in the sidebar and on the home page are buttons: Tab + Enter/Space folds or unfolds the list below; `aria-expanded` and `aria-controls` set; the chevron points up while unfolded. Topics come first, Technologies second. Both start unfolded, so the server-rendered markup matches; the state lives in memory, so a reload unfolds both again | Tap the heading; 44 px min height |
| Nav links | Tab reachable; `aria-current="page"` on the open topic or technology; Enter navigates | Tap navigates; 44 px min height |
| Question toggle | Tab + Enter/Space expands or collapses; `aria-expanded` and `aria-controls` set; a `#question-id` in the URL (search results, quiz review links) opens that card and scrolls it just below the sticky header | Tap anywhere on the header; 44 px min height |
| Tag link | Tab reachable, one link per tag under each question; Enter opens `/?tag=<tag>`, which lists every question with that exact tag across all topics; typing in search replaces the tag filter | Tap navigates; "Show all topics" returns to the index |
| Mark as known | Tab + Enter/Space toggles; `aria-pressed` reflects state; label swaps "Mark as known" / "Marked as known" | Tap toggles; glyph appears on the rail |
| Play / Pause / Restart | Tab + Enter/Space; label announces the action | Tap; 44 px target |
| Diagram player | Group with `aria-label`; no autoplay; controls are regular buttons | Never autoplays, including under `prefers-reduced-motion` |
| Diagram animation | The figure's `aria-label` carries the full text alternative | The whole diagram is always visible; an accent dot walks the flow, the current node or path turns accent, visited ones turn primary; loops after a short hold |
| Index / result / reference links | Tab reachable; focus-visible outline; Enter navigates; topic and technology cards sit under their own headings on the home page, and a technology card opens `/technologies/<slug>` | Tap navigates |
| Desktop header | Sticky at the top of the content column, its row aligned with the full-height sidebar's head; holds the search input and theme toggle, centered over the content | Stays in view while the page scrolls; hidden on phone, where the top bar and panels take over |
| Full-screen toggle | One icon button labelled "Full screen"; Tab + Enter/Space enters or exits full screen for the whole page; `aria-pressed` is true while in full screen; the tooltip names the next action; Escape or F11 exits and the button follows `fullscreenchange`; hidden where the browser has no Fullscreen API | Tap toggles; the icon swaps between corners out and corners in; beside the theme toggle in the desktop header and the phone top bar; 44 px target |
| Admin question row | Tab reachable, one button per question; Enter opens the editor and focus moves to its heading; leaving the editor returns focus to the row (or to "Add question" after a delete) | Tap anywhere on the row; 44 px min height |
| Admin form fields | Every field has a visible label and, where needed, a hint and a character count tied by `aria-describedby`; errors show after the field loses focus or on save, with `aria-invalid` and a 2 px primary border; saving with errors moves focus to a summary whose links jump to each field | Tap to edit; select and radio controls use native behavior. The id is read-only: a new question shows "Assigned when you save" and gets the next `<prefix>-q<N>` id (deleted questions count, so no id is reused); existing ids never change |
| Admin build checks | Read-only list beside the form (below it on narrow screens); each line says "Passes" or "Fails" to screen readers and updates as you type | Sticky beside the form when the editor is at least 46rem wide |
| Admin save / delete | Save is the primary button (2 px accent border) and reads "Saving…" while busy; a failure keeps the edits and shows a `role="alert"` message; Delete and leaving with unsaved edits each ask first, with focus on the safe choice; the browser warns before a reload drops unsaved edits | Tap; 44 px targets |
| Admin deleted questions | Shown only when the topic has deleted questions; a toggle with `aria-expanded` shows the list; each Restore button names its question for screen readers and reads "Restoring…" while busy; after a restore, filters clear and focus moves to the restored row; a refused restore (key takeaway now taken) shows a `role="alert"` message under the row | Tap; 44 px targets |
| Skeleton | Not focusable; `role="status"` announces its label (for example "Loading questions") and the shapes are `aria-hidden`; the content or an error message replaces it | Outlines only, no fills; a slow pulse that stops under `prefers-reduced-motion` |
| Theme toggle | One icon button labelled "Dark theme"; Tab + Enter/Space flips light and dark; `aria-pressed` is true in dark; the tooltip names the next theme | Tap flips; a sun shows in light, a moon in dark, and they rotate and cross-fade while the page cross-fades (View Transitions where supported); instant under `prefers-reduced-motion`; in the desktop header and the phone top bar; 44 px target |

## Verification

- `npm run build` passes; every page is server-rendered per request.
- Greps over `src/` (including SVG) excluding `tokens.css`/`reset.css`: zero gradient values, zero background declarations, zero raw hex.
- `reset.css` holds the canvas background for `html` and the sticky `.site-header`, and otherwise only `transparent`/`none` backgrounds.
- Computed `background-color` on body, buttons, inputs, cards, code blocks, badges, mark, and `__remotion-player` (Player root): all `rgba(0, 0, 0, 0)`; only `html` and `.site-header` carry the canvas color.
- Rendered contrast on the canvas (light / dark): primary text 12.73 / 11.95, secondary text 6.36 / 6.59, accent 4.56 / 6.58, control borders 3.19 / 3.29, syntax tokens 5.71-7.00 / 7.97-8.70.
