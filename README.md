# Technical Lead Study Guide

Interview study app built from the technical-lead position profile. Runs locally only.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Production build: `npm run build && npm start`.

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
- `src/components/QuestionRail.tsx` — difficulty rail with stations and progress glyphs
- `src/components/Diagram.tsx` — diagram host: static SVG inline, animated via @remotion/player
- `src/components/diagrams/` — Remotion compositions and static SVG diagrams
- `src/styles/tokens.css` — every DESIGN.md token as a CSS custom property
- `src/styles/reset.css` — the only file with background declarations (transparent/none only)

## Token-to-component mapping

| Token | Used by |
| --- | --- |
| `color.text.primary` | headings, question text, borders on hover/active, answer body, static SVG labels |
| `color.text.secondary` | eyebrows, metadata, nav idle text, input borders, badges, SVG idle strokes |
| `color.accent` | difficulty rail line, focus rings, known-check glyph, search match underline, key-takeaway rule, active diagram path, selected-nav border |
| `color.border.strong` | card outlines, code block border, frame edges (decorative) |
| `space.1`-`space.8` | all paddings/gaps; section rhythm composes `calc(var(--space-8) * 2)` |
| `radius.md` | outlined cards, player frames |
| `radius.sm` / `radius.xs` | search input / buttons, badges |
| `shadow.1` | question cards, index cards, result cards |
| `border.width.1` / `border.width.2` | default borders / active + focus + rail weights |
| `font.size.xs`-`font.size.4xl` | labels 11-13px, body 14px, titles 16px |
| `font.lineHeight.reading` | phone answer body (16px/26px) |
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

## Component behavior

Every interactive component: keyboard, pointer, touch. State rules live in `src/styles/app.css` (default, hover, focus-visible, active, disabled; loading and error where meaningful).

| Component | Keyboard | Pointer / touch |
| --- | --- | --- |
| Skip link | First Tab stop; Enter moves focus to `#main` | Tap jumps to content |
| Search input | `/` anywhere focuses it; type filters live; Escape clears the browser's search text | Tap opens (phone panel); typing filters after 200 ms debounce |
| Menu / Search buttons (phone) | Tab + Enter toggles panel; `aria-expanded` reflects state; Menu shows a hamburger icon | Tap toggles in-flow panel; 44 px target |
| Sidebar toggle (desktop) | Tab + Enter collapses or restores the sidebar; focus moves to the toggle that replaces the unmounted one; `aria-expanded` reflects state | Click the hamburger at the top of the sidebar to collapse, the floating hamburger top-left to restore; 44 px target |
| Nav links | Tab reachable; `aria-current="page"` on the open topic; Enter navigates | Tap navigates; 44 px min height |
| Question toggle | Tab + Enter/Space expands or collapses; `aria-expanded` and `aria-controls` set | Tap anywhere on the header; 44 px min height |
| Mark as known | Tab + Enter/Space toggles; `aria-pressed` reflects state; label swaps "Mark as known" / "Marked as known" | Tap toggles; glyph appears on the rail |
| Play / Pause / Restart | Tab + Enter/Space; label announces the action | Tap; 44 px target |
| Diagram player | Group with `aria-label`; no autoplay; controls are regular buttons | Never autoplays, including under `prefers-reduced-motion` |
| Index / result / reference links | Tab reachable; focus-visible outline; Enter navigates | Tap navigates |

## Verification

- `npm run build` passes; 15 topic pages prerendered (SSG), references static.
- Greps over `src/` (including SVG) excluding `tokens.css`/`reset.css`: zero gradient values, zero background declarations, zero raw hex.
- `reset.css` holds only `transparent`/`none` backgrounds.
- Computed `background-color` on body, buttons, inputs, cards, code blocks, badges, mark, and `__remotion-player` (Player root): all `rgba(0, 0, 0, 0)`.
