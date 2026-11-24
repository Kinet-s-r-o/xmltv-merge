# XMLTV EPG Design System

> Visual source of truth for the XMLTV EPG web application. The app follows the
> **Kinet UI/UX Design System** (skill `.claude/skills/ui-ux`, "Kinet UI/UX
> Design System"). When this file and the skill disagree, the skill wins and
> this file must be corrected. A page file under `pages/` overrides this file
> only for that page and only for the rule it names.

**Project:** XMLTV EPG
**Status:** active — aligned with Kinet UI/UX
**Stack:** React 19, TypeScript, Tailwind CSS 4 (`@theme inline`), Lucide React,
TanStack Query, `@fontsource` IBM Plex Sans/Mono
**Product type:** internal operations console for XMLTV import, EPG browsing and
feed publishing
**Direction:** compact, data-dense, dark-first operations UI. Do not modernize,
rebrand or "improve" beyond the Kinet reference.

## Where things live

| Concern | File |
| --- | --- |
| Tokens, base reset, every component class | `frontend/src/index.css` |
| Theme preference (dark / light / system) | `frontend/src/lib/theme.ts`, pre-paint script in `frontend/index.html` |
| App shell (sidebar, topbar, service pill, theme switch) | `frontend/src/components/layout/Layout.tsx` |
| Dialog (focus trap, inert root, focus return) | `frontend/src/components/ui/Dialog.tsx` |
| Confirmation dialog | `frontend/src/components/ui/ConfirmDialog.tsx` |
| Notifications (notice stack) | `frontend/src/components/ui/Feedback.tsx` (`useFeedback().notify`) |
| Page header | `frontend/src/components/ui/PageHeader.tsx` |
| Loading / empty / error states | `frontend/src/components/ui/ResourceState.tsx` |
| Table footer pagination | `frontend/src/components/ui/Pagination.tsx` |
| Source status labels and timestamp formatting | `frontend/src/lib/sourceStatus.ts` |

## Non-negotiable rules (from Kinet)

- **Typography:** IBM Plex Sans for interface text, IBM Plex Mono with
  `tabular-nums` for machine-readable values (timestamps, XMLTV channel IDs,
  feed URLs, slugs, counts in tables/registers). Never Inter or system UI fonts.
- **Color:** only semantic tokens (`--bg-*`, `--text-*`, `--border-*`,
  `--accent*`, `--action-primary*`, `--success*`, `--error*`, `--warning*`).
  Values are RGB triplets consumed as `rgb(var(--token) / alpha)`.
  No raw hex in UI code, no Tailwind palette shades (`text-zinc-400`,
  `bg-indigo-600`, …), no purple/violet/indigo, no glow, glass or decorative
  gradients. Semantic Tailwind utilities (`text-muted`, `bg-elevated`,
  `text-error-text`, `bg-error/10`, …) map to tokens through `@theme inline`.
- **Status is never color-only.** Every status color is paired with text
  (badge label, "Enabled"/"Disabled" next to switches, legend in the EPG grid).
- **Geometry:** 3px control radius (`--radius-control`), 1px borders, panels
  without radius (`.data-panel`). Pills (999px) only for chips, the service
  pill and switches.
- **Density:** 12px table text, 34px buttons, 36px inputs, 58px panel headers
  and topbar, 256px sidebar (64px collapsed rail on desktop).
- **No inline `style=`** except computed geometry, which must carry
  `data-dynamic-style` (EPG programme positions and hour lines only).
- **No native `alert/confirm/prompt`.** Decisions use `ConfirmDialog`;
  outcomes use `useFeedback().notify`.
- **Copy:** concrete and domain-specific (source, import, channel, XMLTV ID,
  feed URL). Never "No data" or "Something went wrong".

## Tokens

Dark is the default (`:root`, `color-scheme: dark`); light overrides the same
names under `[data-theme="light"]` on `<html>`. Values are copied verbatim from
the skill (`references/tokens.md` §1) — do not invent new ones.

| Role | Dark | Light |
| --- | --- | --- |
| `--bg-base` app background | `8 15 26` | `235 242 249` |
| `--bg-surface` panels, dialogs, table body | `13 24 39` | `247 250 253` |
| `--bg-elevated` table header, hover fill | `20 36 56` | `226 235 245` |
| `--bg-hover` nav / secondary hover | `29 50 74` | `213 227 243` |
| `--bg-sidebar` | `13 24 39` | `209 225 250` |
| `--text-primary / -secondary / -muted` | `232 240 248` / `154 174 196` / `126 148 171` | `22 43 67` / `54 78 106` / `73 96 124` |
| `--text-table` | `255 255 255` | `0 0 0` |
| `--border-subtle / -default` | `28 48 70` / `43 67 92` | `202 216 232` / `176 198 222` |
| `--accent / -hover` | `14 165 233` / `56 189 248` | `15 98 168` / `11 76 132` |
| `--action-primary / -hover` | `3 105 161` / `7 89 133` | `15 76 129` / `10 58 101` |
| `--success / -text` | `34 197 94` / `74 222 128` | `22 163 74` / `21 128 61` |
| `--error / -text` | `239 68 68` / `248 113 113` | `220 38 38` / `185 28 28` |
| `--warning / -text` | `245 158 11` / `251 191 36` | `217 119 6` / `180 83 9` |

Light-mode text policy (Kinet §1.4): content text inside `body` is black;
interactive chrome (`button`, `.btn`, `.input`, `.app-sidebar`, `.topbar`,
`.badge`, `.service-pill`, tabs) keeps the blue-gray text tokens.

Motion: `--motion-fast` 120ms (color/border), `--motion-standard` 180ms
(sidebar/drawer). `prefers-reduced-motion: reduce` collapses all durations.

Z-index: content 0 < EPG sticky header 20 < topbar 30 < scrim 40 < sidebar 50 <
dialog 100 < notifications 120. The skip link uses 120 while focused.

## Typography scale

| Use | Size / weight |
| --- | --- |
| Page title (`.page-header h1`) | 20px / 620, `-.02em` (18px < 640px) |
| Dialog title | 16px / 620 |
| Brand name | 16px / 650 |
| Topbar title / kicker | 14px / 600; kicker 9px mono uppercase |
| Panel / toolbar heading | 13px / 600; sub-line 10px muted |
| Body | 14px / 400, line-height 1.45 |
| Nav link | 13px / 500 |
| Buttons, inputs, table values | 12px |
| Form labels (`.field`) | 11px / 600 `--text-secondary` |
| Table header, badges | 10px / 600 |
| Register value | 16–24px mono 600 tabular-nums |

## Layout

- Shell: fixed 256px sidebar (≥1024px) with brand mark, grouped navigation
  ("Monitor": Dashboard, EPG grid, Channels; "Configure": Sources, Outputs),
  footer meta and a persisted collapse toggle (64px icon rail). Below 1024px
  the sidebar is an off-canvas drawer with scrim; Escape closes it and returns
  focus to the menu button; a closed drawer is `visibility: hidden`.
- Topbar: 58px sticky; mono kicker "XMLTV EPG" + section title; right side has
  the API service pill (polls `/api/v1/health` every 30s, icon + text) and the
  theme switch cycling dark → light → system.
- Content: `.content-area`, max-width 1680px, padding 16/12 → 20/18 → 24/24,
  16px gap between page blocks. Route changes move focus to `<main>`.
- Page composition: `PageHeader` → optional `.ops-register` → `.data-panel`
  regions (`.table-panel-toolbar` + `.data-table` + `.table-footer`) → dialogs
  and notices.
- Breakpoints 640 / 1024 / 1536. Below 640px: stacked page header, 44px
  controls and icon buttons, 48px nav links, bottom-sheet dialogs, two-column
  register. No page-level horizontal scroll; wide tables scroll inside
  `.table-scroll`.

## Components

- **Buttons:** `.btn` + `.btn-primary` (one per region, the main action),
  `.btn-secondary`, `.btn-danger` (destructive, always confirmed),
  `.btn-xs` for table/panel row actions. Icon-only controls use
  `.icon-button` (`.is-danger` for delete) with `aria-label` and `title`.
  Busy buttons show `.spinner.spinner-sm` and "Working…"/"Saving…".
- **Forms:** labels wrap their control (`<label class="field">Label<input
  class="input"></label>`); hints use `.field-hint`, errors `.field-error`
  with `aria-invalid`/`aria-describedby`. Form-level failures render as
  `.inline-alert.is-error` next to the submit button and keep entered values.
  An open edit shows `.form-dirty-banner`.
- **Search fields:** `.search-field` with a 14px Lucide `Search` icon and an
  sr-only label.
- **Switch:** `button[role="switch"].switch` inside `.switch-control`, always
  followed by the text state.
- **Badges:** `.badge` + `.badge-success|-error|-warning|-accent`; neutral
  `.badge` for disabled. Source states: Imported (success), Import failed
  (error), Awaiting import (warning), Disabled (neutral).
- **Tables:** `<table class="data-table">`, sticky 40px header, values wrapped
  in `.table-text` (+ `font-mono` for IDs, timestamps, numbers), secondary
  lines in `.cell-sub`, actions in `.cell-actions`. Every data table pages
  client-side with `usePagedRows` + `Pagination`: page sizes 10, 15, 20, 25,
  50, 100 (default 20), remembered per table in `localStorage`, page reset to
  1 when filters or page size change. The EPG grid uses the same sizes for
  "Stations per page".
- **Dialogs:** `Dialog` sizes small 420 / medium 560 / large 880; Cancel is
  `.btn-secondary`, confirm `.btn-primary` or `.btn-danger`. Not draggable or
  resizable (Kinet's drag/resize affordance is not adopted in this app).
  Dialogs may stack (e.g. a confirm over a form); only the top one handles
  Escape and the focus trap.
- **Create/edit forms:** records are added and edited in a `Dialog` opened
  from the page header ("Add …") or a row's edit action, not in inline page
  forms. Once a field differs from its opening values the form is dirty: a
  `.form-dirty-banner` appears, Save is enabled (edit mode), and every close
  path — ×, Cancel, Escape, backdrop click — opens a "Discard unsaved
  changes?" `ConfirmDialog` (Keep editing / Discard changes). Reloading or
  leaving the page triggers the browser's `beforeunload` warning. Closing is
  blocked while saving.
- **Notifications:** `.notice-stack` top-right; success/info auto-dismiss after
  5s, errors persist. Used for mutation outcomes (source added/updated/
  deleted/refreshed/enabled, output created/saved/deleted, clipboard failure).
- **Resource states:** `LoadingState`, `EmptyState` (icon, specific title,
  next step, optional action), `ResourceError` (`role="alert"`, "Retry
  request"). Filtered-empty and truly-empty cases have different copy and a
  "Clear filters" action for the former.
- **Operational register:** dashboard metrics only — sources, imported, import
  failed, awaiting import, channels, programmes — each with a freshness or
  next-step footnote.

## Accessibility

- `:focus-visible` = 2px accent outline, 2px offset; skip link to `<main>`.
- Dialogs: `role="dialog"`/`alertdialog`, `aria-modal`, labelled title, focus
  trap, Escape, `#root` set `inert` while open, focus returned to the trigger.
- Every icon-only button has an accessible name; decorative icons are
  `aria-hidden`.
- Checkboxes and radios are native with `accent-color` (`.checkbox`).
- WCAG 2.2 AA contrast; white on `--action-primary` ≥ 4.5:1 in both themes.

## Validation

```sh
cd frontend && npm run build
node ../.claude/skills/ui-ux/scripts/validate-design.mjs src
```

The validator's "data table without data-table" check matches the SolidJS
`class="…"` attribute only and reports every React `<table className=
"data-table">` as a false positive; all other checks must pass.

## Change policy

- System-wide visual changes update this file and `frontend/src/index.css` in
  the same change; never introduce a second token system.
- Page-specific exceptions go in `pages/<route>.md` (current: `epg.md`,
  `outputs.md`).
- After UI changes check both themes, 375 / 768 / 1024 / 1440px, keyboard
  focus, empty database (API collections are `[]`), loading and error states,
  and reduced motion.
