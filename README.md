# Technical Lead Study Guide

Interview study app built from the technical-lead position profile. Live at https://robiparvez.github.io/technical-lead/.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Production build: `npm run build` writes a static site to `out/`; `npm start` serves it.

## Deploy

`.github/workflows/pages.yml` lints, builds the static export (`output: 'export'`, `trailingSlash: true`), and publishes `out/` to GitHub Pages on every push to `master`. The workflow sets `PAGES_BASE_PATH` to `/technical-lead`; local runs leave it unset and serve from `/`. There is no server: the home page reads `?q=` (search) and `?tag=` (tag filter) in the browser, and on the home page the search box updates the query with `history.replaceState`, since the export has no per-query payload.

## Versions

| Package | Version | Source |
| --- | --- | --- |
| Next.js | 16.3.8 | `npm view next version`, 2026-10-01 |
| React | 19.2.8 | create-next-app |
| remotion / @remotion/player | 4.0.532 | `npm view` |

Node v24.3.0 was used (create-next-app requires 18.18+ or 20.9+).

Remotion license: free for individuals, including personal use
(https://www.remotion.dev/docs/license/faq). This project is personal study use.

## Structure

- `src/data/topics/*.json` — questions, answers, tags, diagrams, key takeaways
- `src/components/QuestionRail.tsx` — difficulty rail with stations and progress glyphs; each card lists its tags as links to `/?tag=<tag>`
- `src/components/SearchResults.tsx` — home index: topic cards, `?q=` search results, or the questions carrying one `?tag=` across all topics
- `src/components/Diagram.tsx` — diagram host: every diagram plays as a looping @remotion/player animation
- `src/components/diagrams/` — Remotion compositions: hand-built diagrams and `SpecDiagram`, which animates any JSON-authored `DiagramSpec`
- `src/styles/tokens.css` — every design token as a CSS custom property, with light and dark values
- `src/styles/reset.css` — the only file with background declarations (the themed page canvas, repeated on the sticky desktop header so scrolled content stays hidden; everything else transparent/none)
- `src/components/ThemeSwitch.tsx` — light/dark icon toggle; follows the OS until clicked, then saves the choice in localStorage

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
| Search input | `/` anywhere focuses it; type filters live; Escape clears the browser's search text | Tap opens (phone panel); typing filters after 200 ms debounce |
| Menu / Search buttons (phone) | Tab + Enter toggles panel; `aria-expanded` reflects state; Menu shows a hamburger icon | Tap toggles in-flow panel; 44 px target |
| Sidebar toggle (desktop) | Tab + Enter, or Ctrl+B (Cmd+B on macOS) from anywhere except rich-text editors, collapses or restores the sidebar; focus moves to the toggle that replaces the unmounted one; `aria-expanded` and `aria-keyshortcuts` set | Click the hamburger at the top of the sidebar to collapse, the floating hamburger top-left to restore; 44 px target |
| Nav links | Tab reachable; `aria-current="page"` on the open topic; Enter navigates | Tap navigates; 44 px min height |
| Question toggle | Tab + Enter/Space expands or collapses; `aria-expanded` and `aria-controls` set; a `#question-id` in the URL (search results, quiz review links) opens that card and scrolls it just below the sticky header | Tap anywhere on the header; 44 px min height |
| Tag link | Tab reachable, one link per tag under each question; Enter opens `/?tag=<tag>`, which lists every question with that exact tag across all topics; typing in search replaces the tag filter | Tap navigates; "Show all topics" returns to the index |
| Mark as known | Tab + Enter/Space toggles; `aria-pressed` reflects state; label swaps "Mark as known" / "Marked as known" | Tap toggles; glyph appears on the rail |
| Play / Pause / Restart | Tab + Enter/Space; label announces the action | Tap; 44 px target |
| Diagram player | Group with `aria-label`; no autoplay; controls are regular buttons | Never autoplays, including under `prefers-reduced-motion` |
| Diagram animation | The figure's `aria-label` carries the full text alternative | The whole diagram is always visible; an accent dot walks the flow, the current node or path turns accent, visited ones turn primary; loops after a short hold |
| Index / result / reference links | Tab reachable; focus-visible outline; Enter navigates | Tap navigates |
| Desktop header | Sticky at the top of the content column, its row aligned with the full-height sidebar's head; holds the search input and theme toggle, centered over the content | Stays in view while the page scrolls; hidden on phone, where the top bar and panels take over |
| Theme toggle | One icon button labelled "Dark theme"; Tab + Enter/Space flips light and dark; `aria-pressed` is true in dark; the tooltip names the next theme | Tap flips; a sun shows in light, a moon in dark, and they rotate and cross-fade while the page cross-fades (View Transitions where supported); instant under `prefers-reduced-motion`; in the desktop header and the phone top bar; 44 px target |

## Verification

- `npm run build` passes; 20 topic pages prerendered (SSG), references static.
- Greps over `src/` (including SVG) excluding `tokens.css`/`reset.css`: zero gradient values, zero background declarations, zero raw hex.
- `reset.css` holds the canvas background for `html` and the sticky `.site-header`, and otherwise only `transparent`/`none` backgrounds.
- Computed `background-color` on body, buttons, inputs, cards, code blocks, badges, mark, and `__remotion-player` (Player root): all `rgba(0, 0, 0, 0)`; only `html` and `.site-header` carry the canvas color.
- Rendered contrast on the canvas (light / dark): primary text 12.73 / 11.95, secondary text 6.36 / 6.59, accent 4.56 / 6.58, control borders 3.19 / 3.29, syntax tokens 5.71-7.00 / 7.97-8.70.
