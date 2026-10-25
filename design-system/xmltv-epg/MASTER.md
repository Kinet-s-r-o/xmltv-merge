# XMLTV EPG Design System

> This is the visual source of truth for the XMLTV EPG web application. Read it
> before changing UI structure, styling, interaction, accessibility, or
> responsive behavior. A page-specific file under `pages/` overrides this file
> only for that page. This document defines the product UI; it is not a
> marketing landing-page template.

**Project:** XMLTV EPG
**Status:** active master definition
**Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, TanStack Query
**Product type:** operational EPG dashboard and XMLTV source/output manager
**Visual direction:** Minimalism & Swiss, data-dense, calm, precise, dark-first
**Density:** 8/10 for dashboards; preserve readability and touch targets
**Motion:** 3/10, subtle and functional

## Product UX goals

1. Let an operator understand feed health and programme coverage at a glance.
2. Make the EPG grid the primary working surface, with fast date/channel
   navigation and predictable programme detail access.
3. Make source and output configuration safe: visible state, clear errors,
   explicit save/delete actions, and no accidental token exposure.
4. Keep dense operational information scannable without clipping, unexplained
   color, or horizontal page overflow.

## Non-negotiable rules

- Use Lucide SVG icons consistently; never use emoji as UI icons.
- Keep keyboard focus visible and preserve native button/link semantics.
- Maintain at least 4.5:1 text contrast; do not communicate status by color
  alone.
- Use visible labels for forms and place validation errors next to the field or
  action that caused them.
- All clickable controls need a clear hover/focus/disabled state and a pointer
  cursor; target size should be at least 44x44px where practical.
- Respect `prefers-reduced-motion`; motion must never hide the final state.
- Long URLs, tokens, channel IDs, and IPv6-like identifiers must remain
  readable through wrapping or a deliberate local scroll container, never
  silent ellipsis.
- Do not introduce a second theme/token system. Extend the semantic tokens in
  `frontend/src/index.css` and migrate components incrementally.

## Semantic color tokens

Use semantic roles rather than raw colors in new components. Current Tailwind
zinc/indigo classes are accepted while components are migrated to these roles.

| Role | Dark baseline | Light baseline | Use |
| --- | --- | --- | --- |
| `app-bg` | `#09090B` | `#F4F4F5` | Page background |
| `surface` | `#18181B` | `#FFFFFF` | Sidebar, cards, panels |
| `surface-raised` | `#27272A` | `#FAFAFA` | Hovered rows, popovers, inputs |
| `border` | `#3F3F46` | `#D4D4D8` | Dividers and controls |
| `text` | `#F4F4F5` | `#18181B` | Primary content |
| `text-muted` | `#A1A1AA` | `#52525B` | Metadata and secondary labels |
| `primary` | `#818CF8` | `#4F46E5` | Navigation, links, focus, selection |
| `primary-strong` | `#6366F1` | `#4338CA` | Primary action fill |
| `success` | `#4ADE80` | `#15803D` | Healthy/imported/enabled |
| `warning` | `#FBBF24` | `#B45309` | Stale/attention/pending |
| `danger` | `#F87171` | `#B91C1C` | Error/destructive/disabled |

The existing `--color-primary` and `--color-primary-hover` tokens in
`frontend/src/index.css` remain the starting point. Any token migration must
verify both `.light` and dark mode contrast.

## Typography

- Use the existing system sans stack for UI text; do not add a remote font only
  for visual novelty.
- Use a clear scale: page title 24-30px, section title 18-20px, body 14-16px,
  metadata 12-13px. Do not use body text below 12px.
- Use medium/semibold weight for labels and headings, regular weight for data.
- Use a monospace face only for technical values such as feed URLs, IDs, and
  timestamps where alignment improves scanning.
- Keep line height around 1.4-1.6 for readable descriptions and error text.

## Layout and responsive behavior

- Desktop shell: fixed left navigation around 224px and a scrollable main area.
- Page content uses 24px desktop padding, 16px tablet padding, and 12-16px
  mobile padding; use an 8px spacing rhythm.
- Prefer CSS grid for dashboard cards and aligned repeated rows. Keep actions
  aligned at the right without being displaced by variable status text.
- The EPG timeline may scroll horizontally inside its grid container; the page
  itself must not acquire accidental horizontal scrolling.
- Validate at 375px, 768px, 1024px, and 1440px. At narrow widths, stack or
  collapse controls rather than clipping labels.
- Preserve deep links and predictable browser/back navigation for every route.

## Component rules

### Navigation

The primary sections are Dashboard, EPG, Channels, Sources, and Outputs. Keep
labels explicit, active state visually distinct, and icon meaning redundant
with text. Theme switching remains a secondary control with an accessible
label and persisted preference.

### Dashboard and cards

Use compact KPI cards for source/channel/programme counts, then surface recent
import health and next actions. Cards are containers, not automatically
clickable; only add hover/cursor behavior when the whole card is a link or
button.

### EPG grid and tables

Use stable station columns, clear time headers, and row highlighting for the
current or selected item. Keep programme titles readable, show source context
where ambiguity is possible, and provide loading/empty/error states. Dense does
not mean zero whitespace: retain 8-16px cell padding where content permits.

### Forms and configuration

Group related fields, show units and acceptable ranges, preserve entered values
on validation errors, and make destructive actions explicit. Switches must have
text/status context and must not move when neighboring status messages change.

### Outputs and public feeds

Treat public feed URLs and tokens as sensitive link credentials. Use a clear
copy action, readable local scrolling for long URLs, and a confirmation/error
state. Field toggles must be aligned in repeated rows and their effect on the
generated XML must remain understandable.

### Feedback and motion

Use 150-250ms transitions for hover/focus and small state changes. Prefer
opacity/color/border transitions over layout-shifting transforms. Loading,
success, conflict, and error states must remain understandable with motion
disabled.

## Page-specific overrides

Create `pages/<route-name>.md` only when a page genuinely needs a different
layout or interaction rule. It must link back to this master and state only the
override. Current planned page names are `dashboard`, `epg`, `channels`,
`sources`, `outputs`, and `programme-detail`.

## Change policy

- A system-wide visual change updates this file first, then the affected
  components in small batches.
- A single-page exception goes in `pages/<page-name>.md`, not in this file.
- When implementation and this definition differ, treat current code as the
  runtime truth, record the discrepancy, and update the definition in the same
  UI change when the new direction is intentional.
- After UI changes, check keyboard focus, contrast, responsive widths, long
  labels/URLs, loading/empty/error states, and reduced motion before handoff.

## Pre-delivery checklist

- [ ] No emoji icons; Lucide icons have accessible labels where needed.
- [ ] Keyboard navigation and visible focus work.
- [ ] Light and dark modes retain readable contrast.
- [ ] Buttons, switches, inputs, and links expose hover/focus/disabled states.
- [ ] Empty, loading, error, and success states are designed.
- [ ] 375px, 768px, 1024px, and 1440px layouts are checked.
- [ ] No accidental page-level horizontal scroll.
- [ ] Long identifiers and feed URLs remain accessible.
- [ ] Reduced-motion users receive the same final semantic state.
