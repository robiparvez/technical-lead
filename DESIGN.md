# Design System

## Mission

Create implementation-ready, token-driven UI guidance for the product that is optimized for consistency, accessibility, and fast delivery across dashboard web app.

## Product Context

- Audience: authenticated users and operators
- Product surface: dashboard web app

## Style Foundations

- Visual style: structured, tokenized, content-first
- Color application: flat solid fills only. All surfaces, borders, text, icons, and states must use single solid color tokens.
- Main font style: `font.family.primary=Geist`, `font.family.stack=Geist, Geist Fallback`, `font.size.base=14px`, `font.weight.base=400`, `font.lineHeight.base=22.75px`
- Typography scale: `font.size.xs=11px`, `font.size.sm=11.5px`, `font.size.md=12px`, `font.size.lg=12.5px`, `font.size.xl=13px`, `font.size.2xl=13.5px`, `font.size.3xl=14px`, `font.size.4xl=16px`
- Color palette: `color.text.primary=#1a1a1a`, `color.text.secondary=#6b6b6b`, `color.text.tertiary=#9a9a9a`, `color.surface.muted=#ffffff`, `color.surface.base=#000000`, `color.surface.raised=#c8553d`, `color.surface.strong=#faf8f5`, `color.border.strong=#e8e4dd`
- Spacing scale: `space.1=4px`, `space.2=8px`, `space.3=10px`, `space.4=12px`, `space.5=14px`, `space.6=15px`, `space.7=16px`, `space.8=18px`
- Radius/shadow/motion tokens: `radius.xs=4px`, `radius.sm=8px`, `radius.md=12px`, `radius.lg=33554400px` | `shadow.1=rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.04) 0px 1px 2px 0px, rgba(0, 0, 0, 0.04) 0px 4px 12px 0px`

## Accessibility

- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone

Concise, confident, implementation-focused.

## Rules: Do

- Use semantic tokens, not raw hex values, in component guidance.
- Use solid color tokens for all fills, borders, text, and icons.
- Convey hover, active, and selected states with solid token swaps, border changes, or shadow tokens, never with color blends.
- Every component must define states for default, hover, focus-visible, active, disabled, loading, and error.
- Component behavior should specify responsive and edge-case handling.
- Interactive components must document keyboard, pointer, and touch behavior.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't

- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.
- Do not ship component guidance without explicit state rules.
- Do not use gradient colors of any kind (linear, radial, conic, mesh, or gradient text, borders, overlays, or masks).
- Do not use gradient-based fades for overflow or truncation; use solid fills, ellipsis, or scroll affordances instead.

## Guideline Authoring Workflow

1. Restate design intent in one sentence.
2. Define foundations and semantic tokens.
3. Define component anatomy, variants, interactions, and state behavior.
4. Add accessibility acceptance criteria with pass/fail checks.
5. Add anti-patterns, migration notes, and edge-case handling.
6. End with a QA checklist.

## Required Output Structure

- Context and goals.
- Design tokens and foundations.
- Component-level rules (anatomy, variants, states, responsive behavior).
- Accessibility requirements and testable acceptance criteria.
- Content and tone standards with examples.
- Anti-patterns and prohibited implementations.
- QA checklist.

## Component Rule Expectations

- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.
- Include known page component density: buttons (50), links (43), inputs (16), lists (9), navigation (5).

- Extraction diagnostics: Audience and product surface inference confidence is low; verify generated product context.

## Quality Gates

- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Teams should prefer system consistency over local visual exceptions.
- Implementations must contain zero `linear-gradient`, `radial-gradient`, `conic-gradient`, or `repeating-*-gradient` values in CSS, inline styles, or SVG `<linearGradient>`/`<radialGradient>` elements.
