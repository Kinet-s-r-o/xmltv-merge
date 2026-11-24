---
name: kinet-ui-ux
description: Kinet internal application design system. Use when building, modifying, or reviewing the UI of any internal Kinet application (SolidJS console or new app) so it matches the established Kinet visual identity: IBM Plex typography, dark/light semantic color tokens, 3px control geometry, compact operational density, accessible dialogs/tables/forms, and the documented component contracts. Do not use for non-Kinet products or for backend-only work.
---

# Kinet UI/UX Design System

Authoritative design reference for internal Kinet applications. It preserves the visual identity of the existing Kinet control plane (TR-069/CWMP console) so new internal apps reproduce the same design language, interaction patterns, layouts, and components.

**Rule of thumb:** when in doubt, match the reference implementation exactly. Do not modernize, rebrand, or "improve" the design. Do not invent values that are not in this skill.

## When to use this skill

- Building a new internal Kinet application or console screen.
- Adding a component, page, table, form, dialog, or chart to a Kinet app.
- Reviewing UI changes for design-system compliance.
- Answering "how does Kinet style X?" questions.

## Quick start (new application)

1. Copy `assets/tokens.json` into the project and generate (or hand-write) the `:root` + `[data-theme="light"]` CSS custom properties exactly as in `references/tokens.md` §1. Colors are RGB triplets consumed as `rgb(var(--token))`.
2. Copy `examples/base.css` into the app's `src/` as the stylesheet foundation — it contains the token layer, reset, focus, scrollbar, theme, typography, app shell, and all component classes (buttons, inputs, badges, panels, tables, dialogs, notices, states), extracted from the reference app.
3. Follow the component contracts in `references/components.md` (Dialog, Feedback, ResourceState, data-table, PageHeader, Pagination).
4. Follow the layout contract in `references/layout.md` (sidebar, topbar, content area, z-index, breakpoints).
5. Run the validation script: `node scripts/validate-design.mjs <path-to-src>` (see `references/validation.md`).

## The non-negotiables (hard rules)

- **Typography:** IBM Plex Sans (interface) + IBM Plex Mono (serials, IPs, parameter paths, timestamps, code-like values, numeric telemetry with `tabular-nums`). Never Inter.
- **Color:** only semantic tokens (`background.*`, `text.*`, `border.*`, `accent.*`, `action.*`, `status.*`). Never raw hex in UI CSS. Status is never color-only — always pair with text or icon.
- **Semantic Tailwind utilities:** use the `@theme inline` mapping (`text-success-text`, `bg-error/10`, `border-accent/30`, `hover:bg-hover`, …). Palette-shade utilities (`text-slate-400`, `bg-zinc-700`, …) are prohibited and rejected by the UI gate.
- **Table values:** use the shared `table-text` class (12px, `--text-table`); add `font-mono` for identifiers/addresses/timestamps/aligned numbers. `--text-table` applies to direct data-table cells only — nested labels, controls, and helper text keep their own colors.
- **Geometry:** 3px control radius, 1px borders. No glow, glassmorphism, decorative gradients, purple/violet/indigo accents, or rounded marketing cards.
- **Density:** compact by default — 12px table text, 34px buttons, 36px inputs, 58px panel headers, 58px topbar, 256px sidebar.
- **Accessibility:** visible `:focus-visible` (2px accent, offset 2px), keyboard-complete flows, labelled inputs, named icon controls, focus-trapped dialogs, `prefers-reduced-motion`, 44px mobile touch targets, WCAG 2.2 AA contrast.
- **No native `alert/confirm/prompt`** — use the shared Feedback dialog. No inline `style=` attributes — use tokens or reusable classes. No click handlers on non-interactive elements.
- **Copy:** concrete, domain-specific, actionable. Never generic "No data" / "Something went wrong" empty states.

## Progressive disclosure — read what you need

| Task | Read |
| --- | --- |
| Colors, type, spacing, radii, shadows, motion, z-index | `references/tokens.md` |
| Component contracts (Dialog, Feedback, tables, forms, states) | `references/components.md` |
| App shell, navigation, headers, dashboards, responsive | `references/layout.md` |
| Charts and data visualization | `references/charts.md` |
| What is confirmed vs probable vs app-specific vs missing | `references/ambiguity-report.md` |
| Full evidence-backed inventory with source locations | `references/design-inventory.md` |
| Machine-readable tokens | `assets/tokens.json` |
| Copy-paste CSS foundations (tokens + all component classes) | `examples/base.css` |
| Copy-paste component examples (SolidJS) | `examples/components/` (Dialog, Feedback, ResourceState, DataTable, PageHeader, chartTheme) |
| Validation procedure and script | `references/validation.md`, `scripts/validate-design.mjs` |
| How to install this skill in another repo | `INSTALL.md` |

## Verification checklist (definition of done)

A UI change is complete when:

- Default, loading, empty, error, success, permission, partial-data, long-content, and narrow-screen states are handled.
- Keyboard navigation, focus return, screen-reader names, label associations, contrast, reduced motion, and mobile touch targets are verified.
- Existing semantic tokens and components are used; no new raw hex, no inline styles.
- Copy is concrete and domain-specific.
- `node scripts/validate-design.mjs <src>` passes (objective checks only — product fit and copy quality still need human review).

## Boundaries

- This skill documents the design system only. It does not authorize changes to the reference application, databases, or production systems.
- **Source defects D-1 (undefined `--primary`/`--surface`), D-2 (chart theme adaptation), D-3 (hardcoded UI hex), D-5 (table text scoping), D-6 (light-mode Tailwind remaps), and D-7 (native control theming) were resolved in the reference repository on 2026-11-13** (commits `da63292`, `0547c96`, `08579dd`, `8710780`, `ffd9646`). This skill reflects the post-fix state: chart theming is token-driven via `useChartTheme()` (`examples/components/chartTheme.ts`), the token set includes `--text-on-action`, `--warning-strong`, `--shadow-color`, `--highlight-color`, table values use the shared `table-text` class, and semantic Tailwind utilities map to tokens via `@theme inline`. **D-4 (dual confirmation: password vs 2FA) is intentional** and will not be unified. See `references/ambiguity-report.md` §D for the resolution record.
- Items marked **probable** in `assets/tokens.json` / `references/ambiguity-report.md` require human approval before being treated as company-wide standards.
- Application-specific patterns (fleet dashboard grid, CWMP fault table, ONT LAN visualization, gauge presets) are documented but must not be generalized.
