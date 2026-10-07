# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev     # dev server on http://localhost:3000
npm run build   # production build; prerenders every topic and quiz page (SSG)
npm run lint    # eslint
```

No test runner is configured. Verify changes with `npm run lint` and `npm run build`; the build fails on type errors and on a bad `generateStaticParams`.

## Overview

Next.js study guide for a Technical Lead interview, published as a static export to GitHub Pages (see `README.md`, Deploy). Nothing may need a server at request time: no request-time `searchParams`, cookies, headers, route handlers, or server actions. Content comes from `technical-lead.md`; design rules come from `DESIGN.md` as amended in `README.md` and `PROMPT.md`. See `README.md` for token and component-behavior tables; update them when you change tokens or interaction behavior.

## Architecture

**Content is JSON, registered by hand.** Each topic is `src/data/topics/<slug>.json` shaped like `Topic` in `src/data/types.ts`. A new file does nothing until `src/data/index.ts` imports it and adds it to a group in `TOPIC_GROUPS`. Routes, sidebar, search, and quiz all derive from `slug` through `TOPICS`. The layout and quiz page pass slimmed topic data to client components; keep full answers out of those props.

**IMPORTANT: question `id` values (e.g. `hr-q1`) are saved in localStorage** for "known" progress and quiz history. Renaming or reusing an id silently breaks saved state.

**A string `Question.diagram` must match a key in `ANIMATED` in `src/components/Diagram.tsx`.** An unknown id renders nothing, with no error.

**The quiz is derived from the guide.** `src/lib/quiz.ts` uses each question's `keyTakeaway` as the correct option and other questions' takeaways from the same topic as distractors. Every question needs a distinct, self-contained `keyTakeaway`.

**Client state uses `createStore` in `src/lib/storage.ts`.** The server snapshot is always the empty value, so saved state appears only after hydration. The theme key `tl-theme` is also read by the inline `THEME_SCRIPT` in `src/app/layout.tsx` before first paint; keep the key and JSON format in sync in both places.

**Styling is global CSS in `src/styles/` with design tokens in `tokens.css`.** Use tokens, never literals. No background fills on UI surfaces, no gradients, no raw hex outside `tokens.css` and `reset.css`. `reset.css` is the only file allowed to set a background (the themed page canvas). The accent color is for borders, rules, and glyphs, never text.

## Gotchas

- Route `params` are a `Promise` and must be awaited (see existing pages). Read `node_modules/next/dist/docs/` before using other Next APIs, as `AGENTS.md` says.
