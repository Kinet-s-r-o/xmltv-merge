# Design Consistency Validation — Kinet UI/UX

Objective, scriptable checks only. **Subjective similarity scores are not proof of compliance.** Product-task fit, responsive prioritization, copy quality, and realistic-data review require human judgment (see the definition of done in `SKILL.md`).

## 1. What is validated

| Area | Check | Method |
| --- | --- | --- |
| Design token usage | No raw hex colors in UI CSS/TSX (chart-internal constants allowed only in chart modules); no inline `style=` attributes (except `data-dynamic-style`); no palette-shade Tailwind utilities (semantic theme colors only); semantic tokens present | `scripts/validate-design.mjs` |
| Typography | IBM Plex Sans/Mono declared; no Inter; mono used for machine-readable values (manual review) | script + review |
| Component styling | Required component classes present (`.btn`, `.input`, `.data-table`, `.badge`, `.dialog-panel`, `.notice`, `.resource-state`); 3px control radius; no prohibited effects (glow/glass/gradient/purple) | script |
| Layout consistency | Sidebar 256px, topbar 58px, content max-width 1680px, z-index scale respected (no z-index > 120 without comment) | script + review |
| Responsive behavior | 44px mobile touch targets present in media queries; breakpoints 640/1024/1536 used | review |
| Accessibility | Labels associated (`for` or wrapping); icon-only buttons have `aria-label`; dialogs have `role="dialog"` + `aria-modal`; no native `alert/confirm`; `:focus-visible` rule present; `prefers-reduced-motion` rule present; primary action contrast ≥ 4.5:1 | script |
| Visual regression | Screenshot comparison against baseline captures (when a running instance is available) | manual / browser automation |
| Functional compatibility | Build passes (`tsc -b && vite build`); UI gate passes; keyboard flows work | build + manual |

## 2. Running the script

```bash
node scripts/validate-design.mjs <path-to-frontend-src>
```

The script walks `.css/.ts/.tsx` files and reports violations with file:line. Exit code 1 on any violation.

Checks implemented:

1. **Prohibited font:** `Inter` usage.
2. **Prohibited color families:** `purple|violet|indigo` tokens in CSS/TSX.
3. **Palette-shade utilities:** `text-slate-400`, `bg-zinc-700`, `border-amber-300`, … (any Tailwind palette-shade color utility) instead of semantic theme colors — mirrors the UI gate in `scripts/check-ui-standards.mjs`.
4. **Native dialogs:** `window.alert/confirm`, bare `alert(`.
5. **Non-interactive click handlers:** `<div|span|tr|li onClick=` without `role="button"`.
6. **Inline styles:** `style=` attributes without `data-dynamic-style`.
7. **Raw hex in UI CSS:** `#rrggbb` in `.css` files outside chart modules (allowlist: `OntLanVisualization.css`).
8. **Label association:** every `<label>` has `for=` or wraps an input.
9. **Data tables:** `<table>` elements carry the `data-table` class.
10. **Dialog contract:** dialog component file contains `role="dialog"`, `aria-modal="true"`, Escape handling, focus restore.
11. **Focus visibility:** `:focus-visible` rule present in the main stylesheet.
12. **Reduced motion:** `prefers-reduced-motion` rule present.
13. **Primary action contrast:** white-on-`--action-primary` ≥ 4.5:1 (WCAG AA).
14. **Z-index ceiling:** no `z-index` literal above 120 in CSS.
15. **Control radius:** `--radius-control: 3px` declared.

## 3. Visual regression procedure (when a running instance is available)

1. Start the app in an isolated local instance (dev server + local API; never production).
2. Capture baselines at three viewports: desktop 1440×900, tablet 820×1180, mobile 390×844.
3. States to capture: primary layout (sidebar expanded + collapsed), navigation, dashboard, a data table (with rows, empty, loading, error), a form (valid, invalid, dirty), a dialog (small/medium/large, focus trap), notifications (success/error), light and dark themes.
4. Compare new captures against baselines pixel-by-pixel for layout regions; treat color-only diffs as theme regressions.
5. Record captures in `validation/screenshots/` (never commit customer data; use synthetic data only).

**Source-only limitation:** when the application cannot be started (no local API/DB authorization), visual verification of the *running application* is not possible. In that case, report which aspects are verified by source analysis only (all token/component/layout checks above) and which require a running instance (visual regression, real-data density, chart theming in light mode).

**Design-system preview (no services required):** `validation/preview.html` renders the extracted `examples/base.css` with representative markup (app shell, ops register, data table, form, states, tabs, dialog, notifications) using synthetic data only. It can be opened directly in a browser and captured at desktop/tablet/mobile viewports in both themes. Baseline captures are stored in `validation/screenshots/`. This verifies the extracted design system renders correctly; it does **not** verify the running application, live data density, or ECharts theming.

## 4. Human approval gates

The following are **not** auto-verifiable and require sign-off:

- Product-task fit of each screen (does the layout serve the operator's primary task?).
- Copy quality (concrete, domain-specific, actionable).
- Responsive prioritization (which columns/metrics survive on mobile?).
- Realistic-data review (long serials, wide parameter trees, large tables).
- Probable-standard tokens (spacing scale, alpha conventions, chart palette, elevation scale) — see `references/ambiguity-report.md` §B/§E.

## 5. Definition of done (per UI change)

- Default, loading, empty, error, success, permission, partial-data, long-content, and narrow-screen states evaluated.
- Keyboard navigation, focus return, screen-reader names, label associations, zoom, contrast, reduced motion, and mobile touch targets verified.
- Existing semantic tokens and components used; new reusable patterns documented.
- Copy concrete, domain-specific, actionable.
- Realistic long serials, parameter paths, errors, empty results, and large tables exercised.
- `validate-design.mjs` and the build pass.
