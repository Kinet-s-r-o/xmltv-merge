# Ambiguity and Inconsistency Report — Kinet UI/UX

Findings from source analysis of `Kinet-s-r-o/ACS`. Patterns are separated into four classes. **No ambiguous or contradictory pattern is silently resolved** — each item below states what was found, the evidence, and what decision is required.

## A. Confirmed standards (high confidence, consistent across the codebase)

These are safe to adopt as company-wide standards without further review:

1. **Semantic RGB-triplet token architecture** — all colors flow through `:root` custom properties consumed as `rgb(var(--token))`; light theme overrides the same property names. (`index.css`)
2. **IBM Plex Sans + IBM Plex Mono** with the documented fallback stacks; mono for all machine-readable values (serials, IPs, parameter paths, timestamps, register values). (`index.css`, `index.tsx`)
3. **3px control radius** (`--radius-control`); 1px borders; no glow/glass/gradient decoration; no purple-family accents; no Inter. (`index.css`, `docs/ui-ux-standard.md`, `scripts/check-ui-standards.mjs`)
4. **Status semantics:** success/error/warning each have a base + text token; status is always paired with text or icon, never color alone. (`index.css`, `DeviceStatusBadge.tsx`, `Feedback.tsx`)
5. **Focus model:** `:focus-visible` 2px accent outline, offset 2px; keyboard-complete flows; focus-trapped dialogs with restore. (`index.css`, `Dialog.tsx`)
6. **Z-index layering:** topbar 30 < sidebar 50 < scrim 40 < dialog 100 < table dropdowns 110 < notifications 120. (`index.css`)
7. **Density:** compact by default (12px table text, 34px buttons, 58px panel headers, 58px topbar, 256px sidebar). (`index.css`)
8. **Motion:** `--motion-fast: 120ms`, `--motion-standard: 180ms`; `prefers-reduced-motion` honored globally; page transitions opt-in and off by default. (`index.css`, `lib/uiTransitions.ts`)
9. **Component contracts:** Dialog (focus trap/Escape/resize/move), Feedback (5s auto-dismiss success/info, persistent errors), ResourceState (specific copy, retry), data-table (fixed identifier + fixed Actions/visibility columns), PageHeader, Pagination (page sizes 10–1000, default 20). (`components/`, `docs/ui-ux-standard.md`)
10. **Responsive contract:** 640/1024/1536 breakpoints; 44px mobile touch targets; off-canvas sidebar <1024px; dialogs become bottom sheets on mobile. (`index.css`)

## B. Probable standards requiring review

Consistent in practice but not tokenized or documented as policy — recommend confirming before codifying:

1. **Alpha conventions for status tints** — fills `/ .08–.18`, borders `/ .2–.42`, accent tints `/ .1–.16`. Consistent across badges, notices, avatars, brand mark, but never stated as a rule. *Decision: adopt as a documented alpha scale or leave as implementation detail.*
2. **1px "grid line" register technique** — `gap: 1px` over a `--border-default` background for `.ops-register` and `.ops-attention-list`. Used in 3+ dashboard contexts; looks intentional and reusable. *Decision: promote to a documented "register" pattern.*
3. **Spacing scale** — whole-px values (4/5/6/7/8/9/10/11/12/14/16/18/20/24/28/32) with no token. The UI standard says "spacing communicates grouping" but defines no scale. *Decision: define an explicit spacing scale or document the observed one.*
4. **Typography weights 620/650** — non-standard weights used for page titles (620) and brand (650). Works because IBM Plex Sans is variable-capable via fontsource static weights, but is unusual. *Decision: keep or normalize to 600.*
5. **Light-mode body text = black** — `[data-theme="light"] body` forces text tokens to `0 0 0` "for charts", while interactive elements keep blue-gray tokens. This is a deliberate but unusual split. *Decision: confirm intent; consider a dedicated `--text-chart` token.*
6. **Chart default palette** — `#38bdf8, #a78bfa, #34d399, #fbbf24, #f472b6, #fb923c` (Tailwind 400-level). Note `#a78bfa` is a violet-family hex used *inside charts only*; the gate bans purple *tokens* in CSS/TSX class usage, so this is not a gate violation, but it is a brand tension. *Decision: confirm the chart palette is the canonical Kinet data-viz palette.*
7. **Tabular numerals** — `font-variant-numeric: tabular-nums` on mono data. Consistent; recommend making it an explicit rule for all numeric telemetry.

## C. Application-specific patterns (do not generalize)

1. **Fleet dashboard 120-column dense grid** with per-user drag/resize layout (`pages/Dashboard.tsx`, `.fleet-dashboard-grid`). Specific to the fleet status screen.
2. **CWMP fault table auto-layout** (`.cwmp-fault-table`): message wraps, parameter capped at 28rem. Domain-specific.
3. **ONT LAN SVG visualization** (`OntLanVisualization.tsx/.css`). Domain-specific.
4. **Gauge style presets** (speed/stage/grade/barometer/temperature/ring/multi) in `HealthGauge.tsx`. Domain-specific.
5. **Login split-screen** (brand panel + form). One-off screen.
6. **API service-state pill** in the topbar. Specific to this control plane's health polling.
7. **Boolean Yes/No indicators with confirmation** — a strong candidate to *promote* to a standard. The confirmation-before-mutate behavior is intentional (see D-4, which is intentional and will not be unified); the indicator pattern itself is currently implemented for CWMP semantics.

## D. Inconsistencies and defects found (evidence-based)

These are real defects or gaps in the current implementation. **D-1, D-2, D-3, D-5, D-6, and D-7 were resolved in the source repository on 2026-11-13** (commits `da63292`, `0547c96`, `08579dd`, `8710780`, `ffd9646`); the resolutions are recorded below. **D-4 is intentional** (password vs 2FA confirmation flows) and will not be unified.

### D-1. ~~Undefined `--primary` and `--surface` tokens (fleet dashboard)~~ — RESOLVED (2026-11-13)
`index.css` referenced `var(--primary)` and `var(--surface)`, which were never defined in `:root` or `[data-theme="light"]`.
- **Resolution (commit `da63292`):** all references replaced with existing tokens — `--primary` → `--accent`, `--surface` → `--bg-surface`. The fleet grid overlay, drop-target outline, drag-handle background, and resize-handle focus outlines now resolve correctly in both themes.
- *No decision required.*

### D-2. ~~Chart theme adaptation is uneven~~ — RESOLVED (2026-11-13)
Previously `DeviceGrowthChart.tsx` read tokens via `getComputedStyle` while `MetricChart.tsx` used fixed dark-theme constants and `HealthGauge.tsx` used fixed hex zone colors.
- **Resolution (commits `da63292`, `0547c96`):** a shared `lib/chartTheme.ts` hook (`useChartTheme()`) now reads root semantic tokens and maps them to ECharts colors (`text`, `label`, `border`, `grid`, `track`, `surface`, `accent`, `success`, `warning`, `error`, `tooltip`). All chart components (`MetricChart`, `HealthGauge`, `DeviceGrowthChart`, `InterfaceMetricChart`, `IperfResult`) use it inside their reactive option builders, so mounted charts re-theme on resolved-theme changes. `lib/theme.ts` applies the DOM palette before notifying reactive consumers.
- **Remaining (intentional, documented):** series palette (`DEFAULT_PALETTE`) and gauge preset zone colors stay hardcoded — they are user-configurable series colors and visual presets, not structural theme colors. See `references/charts.md` §3.2.
- *No decision required for structural theming; series-palette policy remains probable (see B-6).*

### D-3. ~~Hardcoded hex values outside the token system~~ — RESOLVED (2026-11-13)
Previously hardcoded values existed in UI CSS: `#f97316` (orange distribution progress), `rgb(15 23 42)` in progress inset shadows and diagnostic result text, `#fff` (distribution values), `white` on action buttons, `rgb(0 0 0)` in shadows/backdrops.
- **Resolution (commit `0547c96`):** new tokens introduced — `--text-on-action` (255 255 255), `--warning-strong` (249 115 22 dark / 194 65 12 light), `--shadow-color` (0 0 0), `--highlight-color` (255 255 255). All UI-surface hardcoded colors now use tokens: `.btn-primary`/`.filter-badge`/`.filter-btn-apply` use `--text-on-action`; orange progress uses `--warning-strong`; shadows/backdrops/scrims use `--shadow-color` with alpha; progress inner highlights use `--highlight-color`; diagnostic result text uses `--text-primary`; light-mode Tailwind remaps use semantic tokens instead of raw `rgb()` values.
- **Remaining (intentional, documented):** chart-internal series/gauge-preset hex (see D-2) and the `ColorSwatch` picker palette (user-facing color catalog).
- *No decision required.*

### D-4. Two confirmation mechanisms — INTENTIONAL (not to be fixed)
`Feedback.confirm()` (shared dialog) and `lib/booleanConfirmation.ts` (standalone toggles) both implement confirm-before-mutate.
- **Decision (2026-11-13):** the dual-path design is **intentional and will not be unified**. The two paths serve two different verification flows: password-based confirmation and 2FA-based confirmation, selected according to whether the user has 2FA configured. Do not collapse them into a single API.
- *No further action.*

### D-5. ~~Table text rules forced `--text-table` on many elements~~ — RESOLVED (2026-11-13)
Previously `table tbody td :is(.text-primary, .text-secondary, .text-muted)` forced `--text-table` on nested elements, so semantic text utilities lost meaning inside table cells.
- **Resolution (commits `08579dd`, `8710780`, `ffd9646`):** a shared **`table-text`** class now defines table value typography (IBM Plex Sans, 12px, `--text-table`; add `font-mono` for identifiers/addresses/timestamps/aligned numbers, `data-link` for navigable values, semantic status colors where the value conveys status). Table color rules are scoped to **direct data-table cells only** (`.data-table > tbody > tr > td`), so nested labels, controls, and helper text keep their own colors. The legacy global `table tbody td :is(...)` rules were removed. Light mode forces pure black table text via `[data-theme="light"] .table-text`.
- *No decision required.*

### D-6. ~~Light-theme remapping of Tailwind utilities~~ — RESOLVED (2026-11-13)
Previously `[data-theme="light"]` overrode specific utility classes (`.text-emerald-400`, `.bg-zinc-700`, etc.), coupling the theme to exact utility usage.
- **Resolution (commit `08579dd`):** all light-only utility remaps were **removed** and replaced by a Tailwind 4 `@theme inline` block that maps **semantic** utilities (`text-success-text`, `bg-error/10`, `border-accent/30`, `text-warning-strong`, …) to CSS tokens — they work in both themes with opacity and state variants. The UI gate now **rejects palette-shade utilities** (`text-slate-400`, `bg-zinc-700`, `border-amber-300`, …) in favor of semantic theme colors.
- *No decision required.*

### D-7. ~~`color-scheme` and native control theming~~ — RESOLVED (2026-11-13)
- **Resolution (commit `08579dd`):** native checkboxes, radios, and ranges now inherit the theme via `accent-color: rgb(var(--accent))` and `color-scheme: inherit` (native appearance, disabled states, and keyboard behavior preserved); a shared `.checkbox` class (14×14px) standardizes sizing. `select.input` keeps `appearance: auto` with `color-scheme: inherit`.
- *No decision required.*

## E. Missing design decisions (gaps to fill for a company-wide system)

1. **No documented spacing scale** (see B-3).
2. **No documented elevation/shadow scale** — shadows are per-component constants (dropdown/notice/dialog/sidebar). *Decision: define a 3-level elevation scale.*
3. **No documented data-viz palette policy** — structural chart colors are now token-driven via `lib/chartTheme.ts` (D-2 resolved); the *series* palette and gauge presets remain hardcoded per component (see B-6, D-2 remaining). *Decision: confirm the series palette as canonical.*
4. **No icon sizing scale** — sizes 12–22 are chosen per use with no documented scale. *Decision: define icon sizes (e.g. 12/14/16/18/20/22) and where each applies.*
5. **No documented breakpoint policy beyond the CSS** — 639/640/1024/1536 are used but not named. *Decision: name them (mobile/small/desktop/wide).*
6. **No empty-state illustration policy** — icons only (lucide), no illustrations. *Decision: confirm icon-only is the standard.*
7. **No documented copy/voice guide** beyond "concrete, domain-specific, actionable" in the UI standard. *Decision: add a short voice & tone reference.*
8. ~~**No dark/light chart token set**~~ — RESOLVED (2026-11-13): `useChartTheme()` reads the resolved-theme tokens, so charts adapt to both themes (see D-2).
9. **No documented focus-ring policy for non-interactive focusable regions** (e.g. draggable title bars use default focus). *Decision: define focus treatment for drag handles.*
10. **No documented z-index scale** beyond the observed values (see A-6) — the UI standard says new z-index values require a documented layer need, but no scale table exists. *Decision: publish the scale.*

## F. Duplicates

1. **Panel header vs table toolbar** — `.data-panel-header` and `.table-panel-toolbar` share identical metrics (58px min-height, 13px 16px padding, 13px/600 title, 10px muted sub). *Decision: consider a single `.panel-header` class.*
2. **Filter dropdown vs column dropdown** — `.filter-dropdown` and `.column-dropdown` share the same chrome (fixed, z-110, surface, 1px border, 3px radius, same shadow, same header pattern). *Decision: extract a shared `.dropdown` base.*
3. **Fault/task filter cards** — `.fault-filter-card` and `.task-filter-card` are near-identical (dot indicator, label, count, description). *Decision: unify into one `.register-filter-card`.*
4. **Two spinner usages** — `.spinner` (18px) and the inline `!w-4 !h-4` override in buttons. *Decision: add a `.spinner-sm` variant instead of utility overrides.*
