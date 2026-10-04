<context>
I am preparing for a Technical Lead interview (5-7 years experience). The source of truth for content is technical-lead.md; the source of truth for visual design is DESIGN.md, amended by the <design_system> section below. Both files are in the project root. The position profile lists categories, not products: languages (JavaScript, TypeScript, Python, Java, C#), front-end (React, Angular, Vue), back-end (Node.js, microservices), SQL and NoSQL databases, REST and GraphQL APIs, cloud, containers, CI/CD, serverless, event-driven and messaging, application security and encryption, agile team leadership, code review, system design, mentoring, and release planning. The site is for personal study on desktop and phone: fast scan, review, and recall. It runs locally only; no deployment.
</context>

<task>
Build a Next.js study-guide app that turns the requirements and responsibilities in technical-lead.md into interview questions with model answers, ordered basic to advanced, explained with outline-style diagrams (animated where motion clarifies the idea), and styled by DESIGN.md with all background colors removed.
</task>

<goal>
On a phone I can open any topic in one tap, find a question through search in under 3 seconds, and read a question and answer without clutter or horizontal scroll. Every topic covers the most common interview questions. The UI passes WCAG 2.2 AA, has zero gradients, and has zero background fills.
</goal>

<decisions>
All confirmed. Build them as stated, and do not reopen them.
- Stack: latest stable Next.js (App Router, TypeScript). Animated diagrams use Remotion through @remotion/player. Simple diagrams use static SVG.
- Answers are stack-neutral, with TypeScript/Node code snippets where code clarifies (the skills tags list TypeScript).
- Features: live client-side search, "/" shortcut to focus search, "Mark as known" progress in localStorage, difficulty rail with progress glyphs, References page, vertical-slice stop before full build.
- Design: DESIGN.md with background colors removed from UI surfaces and diagram fills, canvas left white. Near-monochrome palette with one accent. Geist plus Geist Mono. Border-width tokens added. Single light theme.
- Hosting: local only.
</decisions>

<design_direction>
Act as the design lead: make deliberate choices specific to this subject, not a template.

1. Process: Before writing UI code, draft a compact design plan in your reasoning: palette (DESIGN.md tokens only), type roles, layout concept with an ASCII wireframe, and one signature element. Compare the plan against the generic defaults below, revise anything that matches them, then build. After the vertical slice, review screenshots at 375px and desktop width, and remove one decorative element.
2. Subject: Technical Lead interview study guide. Audience: me. Single job: recall the right answer fast.
3. DESIGN.md wins wherever it pins a choice (Geist, tokens, palette). Bring distinctiveness through what it leaves open: weight contrast and size steps within Geist, layout, rhythm, and the signature.
4. Avoid the three common AI defaults: (a) cream background, serif display, terracotta accent; (b) near-black background with one acid accent; (c) broadsheet look with hairline rules, zero radius, and dense columns. With backgrounds removed, the risk is (c). Counter it with radius tokens on outlined cards, a single reading column, generous vertical rhythm built from space tokens, and hierarchy carried by weight and size instead of rules.
5. Palette: near-monochrome. Text and outlines use color.text.primary and color.text.secondary, plus one color.accent for rails, focus rings, underlines, and glyphs. Do not add colors.
6. Signature (spend boldness here only): a difficulty rail. Each topic has a vertical color.accent line on its inline-start edge with three labeled stations, Basic, Intermediate, Advanced. Questions hang from their station in order. Known questions show a check glyph on the rail. The rail encodes real information (difficulty order and my progress). Keep everything else quiet.
7. Structure carries meaning: each topic header shows a small eyebrow labeled "Requirement" followed by the matching line from technical-lead.md, copied exactly. Do not present it as a verbatim quote from the original job ad. No decorative numbering. Order markers appear only where order is real (the difficulty stations).
8. Layout wireframe:
   Desktop:  [ topic list | search input ]
             [ (sticky)   | topic title + posting-requirement eyebrow ]
             [            | rail: Basic > Q, Q ... Intermediate > Q ... Advanced > Q ]
   Phone:    [ menu button | search button ]
             [ topic title + eyebrow ]
             [ rail with questions, one column ]
   The home page is a topic index (topic name, question count, my progress) with search at the top. Do not build a marketing hero.
9. Motion: only where it teaches, which means the Remotion diagrams. No page-load sequences and no hover effects beyond state changes. State changes are instant, with no transitions.
10. Copy: write from my side of the screen, in sentence case with active verbs, and keep names consistent through each flow ("Mark as known" produces "Marked as known"). Empty and error states say what happened and what to do, for example: "No questions match 'kafka'. Clear the search or try a broader term."
</design_direction>

<design_system>
Read DESIGN.md fully, then apply it with these amendments (all approved).

1. Remove all background colors from UI surfaces and diagram fills. Delete color.surface.muted, color.surface.base, and color.surface.strong. No element may set a visible background (background-color, background-image, or the background shorthand), including inline styles and Tailwind bg-* utilities. The page canvas stays white: leave it unset and set color-scheme: light so it renders white in every browser.
2. Reset user-agent backgrounds in one file, web/src/styles/reset.css. It is the only file allowed to contain background declarations, and only with the values transparent or none. Target buttons, inputs, selects, details/summary, the mark element, and the Remotion Player wrapper. Confirm with computed styles in the browser.
3. Rename the accent: the value #c8553d survives as color.accent (its old name, color.surface.raised, implied a fill). It is used only for borders, rules, focus rings, underlines, and icon glyphs. Never use it for text: its contrast on white is 4.35:1, which fails the 4.5:1 requirement for normal text, and the largest type token is 16px, below the WCAG large-text cutoff (24px, or 18.66px bold), so no accent text qualifies for the relaxed 3:1 large-text threshold.
4. Remaining color tokens on the white canvas: color.text.primary (#1a1a1a, 17.40:1), color.text.secondary (#6b6b6b, 5.33:1), color.border.strong (#e8e4dd, 1.27:1, decorative only). Delete color.text.tertiary: at 2.81:1 it cannot carry information and has no remaining use.
5. Interactive controls (search input, buttons, expandable questions) must show a boundary or cue that reaches 3:1. Use a 1px color.text.secondary border, since color.border.strong is too faint.
6. Structure without fills: separate content with whitespace from the space tokens, borders, the difficulty rail, type weight, and shadow.1. Outlined cards use radius.md. Badges (difficulty, tags) are outlined text, not filled pills.
7. State rules without backgrounds. Hover: border color swaps to color.text.primary. Active: 2px border. Selected (nav item, current topic): 2px color.accent inline-start border and font weight 600. Focus-visible: 2px color.accent outline with an offset. Disabled: color.text.secondary text with a dashed border. Loading and error: text label plus an icon glyph, with error using a color.text.primary border and the message. Do not use opacity for any state.
8. Search matches: highlight with a color.accent underline (text-decoration) and font weight 600, never a background.
9. Code blocks: no background. Use a 1px color.border.strong border and a 2px color.text.secondary inline-start rule. Syntax highlighting uses only color.text.primary and color.text.secondary plus italic and bold. Do not use accent for code text.
10. SVG and diagrams: area shapes (rect, circle, ellipse, polygon, and closed paths used as containers) use fill="none" with strokes in color.text.primary or color.text.secondary. Fill is allowed only on text elements and icon glyph paths, using token colors. Arrowheads are open chevrons (stroked, not filled). Labels use Geist. color.accent marks the single highlighted path or active node stroke. No gradients in CSS, inline styles, or SVG.
11. Tokens: define every DESIGN.md token as a CSS custom property in one token file, plus these approved additions: border.width.1 = 1px and border.width.2 = 2px. Drop the corrupted radius.lg token (33554400px in DESIGN.md); do not define it. Components use semantic tokens only, with no raw hex or one-off px values. Use only space.1 to space.8 (4px to 18px). If the scale is too tight for section separation, compose existing tokens and report the gap to me instead of inventing a token. Layout widths use ch or fr units, not new spacing tokens.
12. Typography: Geist via next/font, base 14px, weight 400, line-height 22.75px. Use only the 11px to 16px scale. Answer body on phones is 16px with a line-height of 26px, derived from the base ratio (22.75/14); define it as the token font.lineHeight.reading and list it as an amendment. 11px to 13px is for labels and metadata only. Code and other monospace text use Geist Mono (approved addition), loaded through next/font.
13. Single light theme. No dark mode.
14. Every interactive component defines default, hover, focus-visible, active, disabled, loading, and error states. Search has an empty-results state. Diagram players have loading and failed-to-load states.
15. Accessibility (WCAG 2.2 AA): keyboard-first with a skip link, visible focus on every focusable element, and documented keyboard, pointer, and touch behavior per component. Touch targets are at least 44px. That is a deliberate stricter choice (WCAG 2.5.5, AAA); AA only requires 24px (2.5.8). It is an accessibility floor, not a spacing token. "/" focuses search. Respect prefers-reduced-motion: diagrams do not autoplay, and any animation longer than 5 seconds has a pause control.
</design_system>

<constraints>
1. Setup: Look up the latest stable Next.js release and its create-next-app defaults online (App Router, TypeScript). Use it. Record the version and the source you checked. Check the installed Node version before scaffolding and tell me if it is too old. If create-next-app adds Tailwind, disable or override any default background utilities and the globals.css background rules. Follow the Next.js code-pattern rules in .claude/skills/next-best-practices/ (file conventions, RSC boundaries, data patterns, async APIs, Suspense, hydration, error handling); where a skill rule conflicts with the online docs for the checked Next.js version, the docs win, and where either conflicts with this prompt's design rules, this prompt wins.
2. Location: Scaffold in web/ with source under web/src/. Do not modify technical-lead.md or DESIGN.md.
3. Topic mapping: Read technical-lead.md fully first. Map its Required Qualifications, Preferred Competencies, Responsibilities, and Skills lines to about 12-15 topics. Merge lines that overlap (for example technical leadership, mentoring, and code review may share or split topics by what interviewers actually ask). Skip Education and the certification line, since they yield no technical interview questions. Where a line names only a category (cloud, containers, messaging, databases), give vendor-neutral answers and mention common products as examples. Add no topics unrelated to the posting.
4. Question selection: Search online for interview questions and current best practices per topic. Prefer questions that appear in 2 or more independent sources you opened. Do not invent quotes or attribute questions to sources you did not open. List all sources on a References page.
5. Difficulty: Tag every question Basic, Intermediate, or Advanced and order each topic Basic first. Include 6-10 questions per topic, mixing conceptual and scenario-based. Include leadership and behavioral questions for the team-lead responsibilities (mentoring, code review, release ownership, stakeholder work).
6. Answers: 3-6 sentences, technically correct, stack-neutral, ending with a one-line "Key takeaway". Add short TypeScript or Node snippets where code clarifies the answer.
7. Diagrams: Add one wherever a picture explains the concept better than text (microservices, CI/CD, event-driven flow, REST vs GraphQL, DB indexing, container deployment, saga pattern). Build animated diagrams with Remotion through @remotion/player and simple ones as static SVG. Prefer position and scale motion over opacity fades. Check the current Remotion docs online for the Next.js integration and license terms, and tell me if the license affects personal use. Inspect the Player's default controls: if they render a background or gradient, set controls={false} and build flat custom controls that meet the state rules.
8. Navigation and search: Sticky sidebar on desktop, collapsible menu on phones, one entry per topic. Client-side live search across questions, answers, and tags. No backend.
9. Progress: Let me mark questions as known, persisted in localStorage, with per-topic progress in the nav and on the difficulty rail. Avoid hydration mismatches: render progress only after mount.
10. Data: Keep questions in structured local files (JSON or MDX) separate from components.
11. Build order: Build a vertical slice first: shell, nav, search, difficulty rail, and 4 topics with diagrams. Verify it, then stop and report: the full topic mapping (every .md line to its topic, plus skipped lines), screenshots, and verification results. Wait for my go-ahead before expanding to all topics.
12. Verification: Run the dev server and use the Playwright browser tools (mcp__plugin_playwright_playwright__*) to check: home page, one topic, search (including empty results), 375px width, keyboard-only navigation, one animated diagram, and prefers-reduced-motion (emulate it). Then grep web/src, including SVG files, excluding the token file and reset.css, for: gradient values (linear-gradient, radial-gradient, conic-gradient, repeating-*-gradient, linearGradient, radialGradient); background-color, background-image, the background shorthand, and Tailwind bg-* classes; and raw hex values. Each grep must return zero matches. Grep reset.css separately: every background declaration must be transparent or none. Then check computed background-color on body, buttons, inputs, cards, code blocks, and the Player wrapper: all must be transparent (rgba(0, 0, 0, 0)). Report what passed and what you could not test.
</constraints>

<example>
Topic: Microservices Architecture
Eyebrow: Requirement: "Extensive back-end experience: Node.js, Python, Java, or C#, plus microservices architecture."

Basic station
Q: What is a microservices architecture and how does it differ from a monolith?
A: A microservices architecture splits an application into small, independently deployable services, each owning one business capability and its data. A monolith ships as a single unit, so any change redeploys everything. Microservices allow independent scaling and team autonomy, but add network latency, distributed data consistency problems, and operational overhead.
Key takeaway: Trade simplicity for independent scaling and deployment.
Diagram: outline-only animated request flow from an API gateway to three services and their databases, with open-chevron arrows. The active request path uses a color.accent stroke. It has a pause control and does not autoplay under reduced motion.

Advanced station
Q: How do you handle a distributed transaction across three services?
A: Avoid two-phase commit where possible. Use the saga pattern: each service runs a local transaction and publishes an event, and a failure triggers compensating actions in earlier services. Choose orchestration when the flow needs central visibility, and choreography when services should stay loosely coupled. Make every step idempotent so retries are safe.
Key takeaway: Saga with compensating actions replaces distributed ACID.
</example>

<format>
Deliver a runnable Next.js project in web/. Include a README with run instructions, the Next.js and Remotion versions, the token-to-component mapping, and the list of DESIGN.md amendments (background removal, color.accent rename, color.text.tertiary removal, border.width tokens, radius.lg drop, font.lineHeight.reading, Geist Mono). Include a References page. At each stop (slice and final), report in under 300 words: topics built, question counts, diagrams built, the design plan's signature and what you revised after critique, grep and computed-style results, and a pass/fail QA checklist (keyboard access, focus visibility, contrast, touch targets, reduced motion, seven component states). List anything unverified.
</format>
