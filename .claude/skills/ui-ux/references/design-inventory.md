# Design System Inventory — Kinet UI/UX

Extracted from actual implementations in `Kinet-s-r-o/ACS` (`frontend/src/`). Every entry lists the exact value, source location, selector/component, reuse frequency where measurable, confidence, and scope (global vs application-specific).

Confidence key: **High** = declared token or repeated pattern with source evidence; **Medium** = consistent observed pattern, not tokenized; **Low** = single occurrence or inferred.

---

## 1. Colors and semantic color roles

### 1.1 Core palette (dark theme, default)

Source: `frontend/src/index.css` `:root` (lines 3–33). Values are RGB triplets consumed as `rgb(var(--token))`.

| Token | RGB | Hex (approx) | Role | Confidence | Scope |
| --- | --- | --- | --- | --- | --- |
| `--bg-base` | `8 15 26` | `#080f1a` | App background, input fill base | High | Global |
| `--bg-surface` | `13 24 39` | `#0d1827` | Panels, dialogs, table body, sidebar | High | Global |
| `--bg-elevated` | `20 36 56` | `#142438` | Hover fills, table header, secondary buttons | High | Global |
| `--bg-hover` | `29 50 74` | `#1d324a` | Nav hover, secondary button hover | High | Global |
| `--bg-sidebar` | `13 24 39` | `#0d1827` | Sidebar background (same as surface) | High | Global |
| `--nav-active-bg` | `20 55 88` | `#143758` | Active nav item fill | High | Global |
| `--nav-active-border` | `35 111 164` | `#236fa4` | Active nav item border | High | Global |
| `--text-primary` | `232 240 248` | `#e8f0f8` | Primary text | High | Global |
| `--text-secondary` | `154 174 196` | `#9aaec4` | Secondary text, button labels | High | Global |
| `--text-muted` | `126 148 171` | `#7e94ab` | Captions, labels, placeholders | High | Global |
| `--text-table` | `255 255 255` | `#ffffff` | Data-table cell text (both themes) | High | Global |
| `--text-on-action` | `255 255 255` | `#ffffff` | Text on filled action/accent controls (primary buttons, filter badges, apply buttons) | High | Global |
| `--border-subtle` | `28 48 70` | `#1c3046` | Hairline dividers | High | Global |
| `--border-default` | `43 67 92` | `#2b435c` | Panel/control borders | High | Global |
| `--accent` | `14 165 233` | `#0ea5e9` | Focus, links, active states, chart lines | High | Global |
| `--accent-hover` | `56 189 248` | `#38bdf8` | Accent hover, data links, active nav text | High | Global |
| `--action-primary` | `3 105 161` | `#0369a1` | Primary button fill (white text) | High | Global |
| `--action-primary-hover` | `7 89 133` | `#075985` | Primary button hover | High | Global |
| `--success` | `34 197 94` | `#22c55e` | Success base (borders, fills at alpha) | High | Global |
| `--success-text` | `74 222 128` | `#4ade80` | Success text | High | Global |
| `--error` | `239 68 68` | `#ef4444` | Error base | High | Global |
| `--error-text` | `248 113 113` | `#f87171` | Error text | High | Global |
| `--warning` | `245 158 11` | `#f59e0b` | Warning base | High | Global |
| `--warning-text` | `251 191 36` | `#fbbf24` | Warning text | High | Global |
| `--warning-strong` | `249 115 22` | `#f97316` | Strong warning (orange) — orange distribution progress, orange text utilities | High | Global |
| `--shadow-color` | `0 0 0` | `#000000` | Base color for all shadows, backdrops, scrims (consumed with alpha) | High | Global |
| `--highlight-color` | `255 255 255` | `#ffffff` | Inner highlight edges on progress bars and similar controls | High | Global |
| `--scrollbar-track` | `8 15 26` | `#080f1a` | Scrollbar track | High | Global |
| `--scrollbar-thumb` | `43 67 92` | `#2b435c` | Scrollbar thumb | High | Global |

### 1.2 Light theme overrides

Source: `frontend/src/index.css` `[data-theme="light"]` (lines 35–60).

| Token | RGB | Hex (approx) |
| --- | --- | --- |
| `--bg-base` | `235 242 249` | `#ebf2f9` |
| `--bg-surface` | `247 250 253` | `#f7fafd` |
| `--bg-elevated` | `226 235 245` | `#e2ebf5` |
| `--bg-hover` | `213 227 243` | `#d5e3f3` |
| `--bg-sidebar` | `209 225 250` | `#d1e1fa` |
| `--nav-active-bg` | `190 211 241` | `#bed3f1` |
| `--nav-active-border` | `161 188 222` | `#a1bcde` |
| `--text-primary` | `22 43 67` | `#162b43` |
| `--text-secondary` | `54 78 106` | `#364e6a` |
| `--text-muted` | `73 96 124` | `#49607c` |
| `--text-table` | `0 0 0` | `#000000` |
| `--border-subtle` | `202 216 232` | `#cad8e8` |
| `--border-default` | `176 198 222` | `#b0c6de` |
| `--accent` | `15 98 168` | `#0f62a8` |
| `--accent-hover` | `11 76 132` | `#0b4c84` |
| `--action-primary` | `15 76 129` | `#0f4c81` |
| `--action-primary-hover` | `10 58 101` | `#0a3a65` |
| `--success` | `22 163 74` | `#16a34a` |
| `--success-text` | `21 128 61` | `#15803d` |
| `--error` | `220 38 38` | `#dc2626` |
| `--error-text` | `185 28 28` | `#b91c1c` |
| `--warning` | `217 119 6` | `#d97706` |
| `--warning-text` | `180 83 9` | `#b45309` |
| `--warning-strong` | `194 65 12` | `#c2410c` |
| `--scrollbar-track` | `235 242 249` | `#ebf2f9` |
| `--scrollbar-thumb` | `176 198 222` | `#b0c6de` |

(`--text-on-action`, `--shadow-color`, `--highlight-color` are theme-invariant and not overridden in light mode.)

Light-mode text policy (source: same file, lines 62–105):
- `body` text tokens are forced to black (`0 0 0`) for chart compatibility; interactive elements (`button`, `[role="button"]`, `.btn`, `.app-sidebar`, `.tab-bar`, `[role="tablist"]`, `[role="tab"]`, `.badge`, `.health-value`, `progress`, `meter`, `[role="progressbar"]`, swatches) keep the blue-gray text tokens.
- **Semantic Tailwind utilities (since 2026-11-13, commit `08579dd`):** the old light-only utility remaps (`.text-emerald-400`, `.bg-zinc-700`, …) were **removed**. A Tailwind 4 `@theme inline` block now maps **semantic** utilities to CSS tokens so they work in both themes, including opacity and state variants: `--color-accent`, `--color-action-primary`, `--color-success`, `--color-success-text`, `--color-error`, `--color-error-text`, `--color-warning`, `--color-warning-text`, `--color-warning-strong`, `--color-neutral` (border-default), `--color-base`, `--color-surface`, `--color-elevated`, `--color-hover`, `--color-primary` (text-primary), `--color-secondary`, `--color-muted`, `--color-subtle` (border-subtle), `--color-default` (border-default). Example usage: `text-success-text`, `bg-error/10`, `border-accent/30`, `hover:bg-hover`.
- **Palette-shade utilities are prohibited** (`text-slate-400`, `bg-zinc-700`, `border-amber-300`, …): the UI gate (`scripts/check-ui-standards.mjs`) rejects them in favor of semantic theme colors.
- Explicit semantic text utilities (`.text-accent`, `.text-success-text`, `.text-error-text`, `.text-warning-text`, `.text-warning-strong`, plus `hover:` variants) are defined unlayered at the end of `index.css` so they override legacy component defaults.

Confidence: High. Scope: Global.

### 1.3 Semantic usage rules (observed)

- **Status is never color-only.** Badges pair color with text (`DeviceStatusBadge.tsx`); notices pair icon + tone border + text; service-state pill pairs icon + text. Confidence: High (also mandated by `docs/ui-ux-standard.md`).
- **Alpha conventions:** status fills use `/ .08–.18` of the base color; status borders `/ .2–.42`; accent tints `/ .1–.16`. Confidence: Medium (consistent across badges, notices, operator avatar, brand mark).
- **Primary action contrast:** white on `--action-primary` is checked by the UI gate against WCAG AA 4.5:1 (`scripts/check-ui-standards.mjs`). Confidence: High.
- **Prohibited:** purple/violet/indigo tokens, Inter font, glow/glass/decorative gradients, rounded marketing-card geometry (`docs/ui-ux-standard.md`, gate). Confidence: High.

### 1.4 Chart/visualization colors

**Structural colors — token-driven (since 2026-11-13, commits `da63292`/`0547c96`).** All chart components use the `useChartTheme()` hook from `lib/chartTheme.ts`, which reads root semantic tokens via `getComputedStyle` and re-themes mounted charts on resolved-theme changes:

| Role | Token | Confidence | Scope |
| --- | --- | --- | --- |
| Tooltip text, gauge detail/split lines | `--text-primary` | High | Global (charts) |
| Axis labels, legend, gauge axis labels/ticks, chart titles | `--text-muted` | High | Global (charts) |
| Axis lines, tooltip border | `--border-default` | High | Global (charts) |
| Grid lines | `--border-subtle` | High | Global (charts) |
| Gauge track (progress/ring/multi) | `--bg-elevated` | High | Global (charts) |
| Tooltip background, gauge speed-style detail background | `--bg-surface` | High | Global (charts) |
| Default line/series color | `--accent` | High | Global (charts) |
| Online/healthy series | `--success` | High | Global (charts) |
| Warning/critical threshold lines | `--warning` / `--error` | High | Global (charts) |

**Series and gauge-preset colors — intentionally hardcoded (user-configurable / visual presets):**

| Value | Use | Source | Confidence | Scope |
| --- | --- | --- | --- | --- |
| `#38bdf8` (sky-400) | Default series color, gauge progress, ONT LAN focus glow | `MetricChart.tsx:27`, `HealthGauge.tsx:83`, `OntLanVisualization.css:11`, `IperfResult.tsx:45` | High | App-specific (charts) |
| `#a78bfa`, `#34d399`, `#fbbf24`, `#f472b6`, `#fb923c` | `DEFAULT_PALETTE` series rotation | `MetricChart.tsx:27` | High | App-specific (charts) |
| `#f59e0b`, `#f43f5e` | `thresholdLines()` default warn/critical | `lib/health.ts:185` | High | App-specific (charts) |
| `#fb7185`, `#fde047`, `#4ade80`, `#41d3e8`, `#58d9f9`, `#ffab91`, `#f97316` | Gauge style zones (grade/barometer/stage/speed/temperature) | `HealthGauge.tsx:58-83` | High | App-specific (charts) |
| `#38bdf8` default + user colors | Distribution progress bars via `--distribution-progress-color` | `index.css` | High | App-specific |

**Resolved gap (2026-11-13):** previously `MetricChart` tooltip/axis colors were dark-theme-only constants and only `DeviceGrowthChart` adapted to theme. All charts now share the token-driven `useChartTheme()` pattern (see ambiguity report D-2, resolved).

---

## 2. Typography

Source: `index.css` (base + component classes), `docs/ui-ux-standard.md`.

| Scale | Size | Weight | Use | Source | Confidence |
| --- | --- | --- | --- | --- | --- |
| Display / page title | `20px` (18px <640px) | `620` | `.page-header-copy h1` | `index.css:151` | High |
| Dialog title | `16px` | `620` | `.dialog-header h2` | `index.css:470` | High |
| Brand name | `16px` | `650`, `letter-spacing: -.015em` | `.brand-name` | `index.css:117` | High |
| Section heading | `13px` | `600` | `.data-panel-header h2/h3`, `.table-panel-toolbar h2/h3` | `index.css:160-163` | High |
| Body | `14px` | `400`, `line-height: 1.45` | `body` | `index.css:99` | High |
| Nav link | `13px` | `500` | `.nav-link` | `index.css:121` | High |
| Nav sub-link | `12px` | `400` | `.nav-link-sub` | `index.css:127` | High |
| Button | `12px` | `600` | `.btn` | `index.css:348` | High |
| Input | `12px` | `400` | `.input` | `index.css:355` | High |
| Table body | `12px` | `400`, `line-height: 1.35` | `.data-table` | `index.css:373,386` | High |
| Table header | `10px` | `600`, `letter-spacing: .025em` | `.data-table thead th` | `index.css:380` | High |
| Generic `th` | `10px` | `600`, `letter-spacing: .015em` | `th` | `index.css:371` | High |
| Badge | `10px` | `600`, `letter-spacing: .015em` | `.badge` | `index.css:341` | High |
| Label / caption | `10–11px` | `400–600` | `.nav-section`, `.fault-filter-label`, `.filter-dropdown-label`, form labels (`text-[11px] font-semibold`) | multiple | High |
| Register value | `24px` (clamp 16–24) | `600`, mono, tabular-nums | `.ops-register-cell dd`, `.fault-filter-count` | `index.css:155,166` | High |
| Health value | `clamp(15px, 1.3vw, 20px)` | `600`, mono | `.health-value` | `index.css:200` | High |
| Topbar title | `14px` | `600` | `.topbar-title h1` | `index.css:141` | High |
| Topbar kicker | `9px` mono, `letter-spacing: .04em` | `400` | `.topbar-title p` | `index.css:140` | High |
| Sidebar meta | `9px` | `400` | `.sidebar-meta` | `index.css:133` | High |

- **Mono usage:** serials, IPs, parameter paths, timestamps, register values, distribution values, login context values, code blocks. Confidence: High.
- **Letter-spacing:** negative on display headings (`-.015em` to `-.035em` on login hero), positive on small caps labels (`.01em`–`.06em`). Confidence: Medium.
- **Uppercase:** only for tiny metric labels (`.health-metric-card h3`, `text-transform: uppercase`, 9px). Confidence: Medium.
- Scope: Global.

---

## 3. Spacing and sizing

| Token/Value | Use | Source | Confidence |
| --- | --- | --- | --- |
| `4 / 5 / 6 / 7 / 8 / 9 / 10 / 11 / 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32` px | The de-facto spacing scale (all values are whole px, no scale variable) | `index.css` throughout | High |
| `1px` | All borders (no 2px borders except tab underline) | `index.css` | High |
| `gap: 1px` + `background: border-default` | "Grid line" technique for registers/attention lists (`.ops-register`, `.ops-attention-list`) | `index.css:153,232` | High |
| Content padding | `16px 12px 32px` (<640), `20px 18px 40px` (≥640), `24px 24px 48px` (≥1024) | `.content-area` media queries | High |
| Panel padding | `14px 16px` (`.data-panel-body`, `.data-panel-section`) | `index.css:164,170` | High |
| Panel header | `13px 16px`, min-height `58px` | `.data-panel-header`, `.table-panel-toolbar` | High |
| Dialog body | `18px`; header `16px 18px`; actions `12px 18px` | `index.css:470-474` | High |
| Max content width | `1680px` centered | `.content-area` | High |
| Sidebar width | `256px` expanded, `64px` collapsed | `index.css:110,576` | High |
| Topbar height | `58px` sticky | `index.css:139` | High |
| Control heights | button `34px`, input `36px`, icon-button `32px`, table icon-button `30px`, nav link `36px`, table header `40px`, tab `8px 16px` padding | multiple | High |
| Mobile touch targets | `44px` (buttons, inputs, icon-buttons, tabs); nav links `48px` at <640px; `44px` coarse-pointer resize handle | `index.css` media queries | High |
| Dialog sizes | small `420px`, medium `560px`, large `880px`, side-panel `1120px`; max-height `min(760px, 100vh - 32px)` | `.dialog-small/medium/large` | High |
| Dropdown widths | column filter `320px`, column visibility `220px` | `index.css:414,447` | High |
| Notice stack | `min(420px, 100vw - 32px)`, top-right `16px` | `.notice-stack` | High |
| Scrollbar | `8px` width, `2px` thumb radius | `index.css:104` | High |

Scope: Global. No spacing scale is tokenized — px values are used directly (Medium confidence that this is intentional; the UI standard says "spacing communicates grouping").

---

## 4. Borders, radii, shadows

| Property | Value | Use | Source | Confidence |
| --- | --- | --- | --- | --- |
| Control radius | `3px` (`--radius-control`) | Buttons, inputs, icon-buttons, badges, dialogs, dropdowns, resource-state icon | `index.css` | High |
| Panel radius | `2px` (`.card`) / `0` (`.data-panel` uses 1px border, no radius) | Cards | `index.css:335` | High |
| Chip radius | `999px` (pill) | `.table-filter-chip`, `.dialog-header-badge` | `index.css:452,471` | High |
| Swatch radius | `2px` (chart), `50%` (tag dot) | `.chart-color-swatch`, `.tag-color-swatch` | `index.css:222-224` | High |
| Border widths | `1px` everywhere; `2px` only for active tab underline and focus outline | — | `index.css` | High |
| Focus outline | `2px solid rgb(var(--accent))`, `outline-offset: 2px` (inset `-2px` for group toggles) | `:focus-visible` on button/a/input/select/textarea | `index.css:108` | High |
| Shadow — dropdown | `0 12px 32px rgb(0 0 0 / .28)` | `.filter-dropdown`, `.column-dropdown` | `index.css:414,447` | High |
| Shadow — dialog | `0 24px 64px rgb(0 0 0 / .32)` | `.dialog-panel` | `index.css:462` | High |
| Shadow — notice | `0 14px 36px rgb(0 0 0 / .24)` | `.notice` | `index.css:478` | High |
| Shadow — collapsed sidebar hover | `12px 0 32px rgb(0 0 0 / .2)` | `.app-sidebar.is-collapsed:hover` | `index.css:590` | High |
| Shadow — sticky first column | `1px 0 0 rgb(var(--border-subtle))` | Mobile fixed identifier column | `index.css:520` | High |
| Backdrops | `rgb(0 0 0 / .68)` dialog; `rgb(0 0 0 / .58)` sidebar scrim | `.dialog-backdrop`, `.sidebar-scrim` | `index.css:461,113` | High |
| Progress bar inset shadows | `inset 0 1px 2px rgb(15 23 42 / 14%)` etc. | `.distribution-progress` | `index.css:286` | Medium |

**Prohibited:** glow, glassmorphism, decorative gradients, rounded marketing cards (`docs/ui-ux-standard.md`). Confidence: High.

---

## 5. Sidebar and navigation

Source: `index.css` (`.app-sidebar` block, lines 110–137, 576–640), `components/Layout.tsx`.

- **Structure:** fixed left sidebar, `256px`, `z-index: 50`, `border-right: 1px solid --border-default`, background `--bg-sidebar`.
- **Brand row:** `min-height: 72px`, `padding: 14px 16px`, `border-bottom: 1px solid --border-subtle`. Brand mark: `34×34px`, 1px accent border at `.7` alpha, accent fill at `.1` alpha, 3px radius, three ascending bars (7/13/19px). Brand name `16px/650`; subtitle `9px` muted.
- **Nav:** `padding: 14px 10px`; section labels `11px/500` muted, `margin: 0 10px 6px`; group gap `18px`.
- **Nav link:** `min-height: 36px`, `padding: 0 10px`, `gap: 10px`, `13px/500`, `--text-secondary`, transparent 1px border, `3px` radius. Hover: `--text-primary` on `--bg-hover`. Active: `--accent-hover` text, `--nav-active-bg` fill, `--nav-active-border` border, plus a `ChevronRight` accent indicator.
- **Submenu:** `padding: 2px 0 2px 27px`, items `min-height: 30px`, `12px/400` muted.
- **Collapse (≥1024px):** `64px` wide, `--bg-sidebar / .42` + `backdrop-filter: blur(8px)`, icon-only `46×40px` centered links; hover expands to full width with `blur(10px)` and shadow (pointer:fine only).
- **Mobile (<1024px):** off-canvas drawer `min(88vw, 320px)`, scrim `rgb(0 0 0 / .58)` at `z-index: 40`, `transform: translateX(-100%)` → `is-open`; nav links `48px` min-height; Escape closes and returns focus to the menu button.
- **Footer:** operator card (30px avatar, initials, `--accent / .16` bg), role line, sign-out icon-button; meta row `9px` with app name + version.
- **Topbar:** `58px` sticky, `z-index: 30`, `--bg-base`, `border-bottom: 1px solid --border-subtle`; left: mobile menu button + kicker (`9px` mono) + `h1 14px/600`; right: API service-state pill (30px, success/error tinted) + theme switcher icon-button.
- **Z-index layering (documented):** content < sticky topbar (30) < sidebar (50) < scrim (40) < dialog (100) < table dropdowns (110) < notifications (120). Confidence: High.

Scope: Global (shell). Confidence: High.

---

## 6. Headers and toolbars

- **Page header** (`.page-header`, `index.css:150`): flex, `align-items: flex-end`, `justify-content: space-between`, `gap: 18px`, `min-height: 66px`, `padding-bottom: 14px`, `border-bottom: 1px solid --border-default`. Title `20px/620`, `letter-spacing: -.02em`; description `12px` muted, `max-width: 680px`. Tools right-aligned, `gap: 8px`, wrap. Mobile: column layout, title `18px`.
- **Panel header** (`.data-panel-header`): `min-height: 58px`, `padding: 13px 16px`, `border-bottom: 1px solid --border-subtle`; `h2/h3 13px/600`, sub `10px` muted.
- **Table toolbar** (`.table-panel-toolbar`): same metrics as panel header; title `13px/600` in `--text-secondary`.
- **Component:** `PageHeader.tsx` (title, description, status slot, children into `.page-header-tools`).
- **Device detail header** (`.device-detail-header`): sticky below topbar (`top: 58px`, `z-index: 20`), holds the tab bar.
- Confidence: High. Scope: Global.

---

## 7. Dashboard layouts

Source: `pages/Dashboard.tsx`, `index.css` (`.ops-register`, `.fleet-dashboard-grid`, `.dashboard-health-grid`, `.inventory-grid`).

- **Ops register** (`.ops-register`): CSS grid with `gap: 1px` over a `--border-default` background so 1px grid lines show between cells; cells `--bg-surface`, `padding: 14px 16px`. Label `11px` muted; value `24px` mono `600` tabular-nums; footnote `10px` muted. Status variants tint the value (`is-online` success, `is-offline` error, `is-warning` warning, `is-sent` accent).
- **Filter cards** (`.fault-filter-card`, `.task-filter-card`): full-width buttons, transparent 1px border, hover `--bg-hover`; `aria-pressed="true"` shows a `6px` accent dot top-right; count `24px` mono (clamp 16–24).
- **Fleet dashboard grid** (`.fleet-dashboard-grid`): 120-column × 8px-row dense grid (`grid-auto-flow: dense`), user-resizable/draggable panels (`fleet-layout-panel`), per-user layout persisted in `localStorage`. Panels use `data-panel` chrome; drag handle `28×28px` top-left; resize handles 10px edges. Grid overlay, drop-target outline, and drag/resize focus outlines use `--accent`; drag-handle background uses `--bg-surface` (previously undefined `--primary`/`--surface` — resolved 2026-11-13, see ambiguity D-1).
- **Health grid** (`.dashboard-health-grid`, `.inventory-grid`): auto-fit `minmax(280px, 1fr)` at ≥1024px; sections separated by 1px borders.
- **Distribution list** (`.distribution-list`): label `12px` / progress bar `12px` tall, `2px` radius, 1px `--border-subtle` border, colored value bar via `--distribution-progress-color`; value `12px` mono right-aligned.
- **Ops attention list** (`.ops-attention-list`): 3-column grid (1 on mobile), 1px grid lines, links `11–12px` with accent icon.
- Confidence: High. Scope: Global pattern; fleet grid is application-specific (dashboard).

---

## 8. Cards and widgets

- **Data panel** (`.data-panel`): `--bg-surface` + `1px solid --border-default`, no radius. The universal container for tables, forms, and dashboard sections. Confidence: High.
- **Card** (`.card`): `--bg-surface`, `1px --border-default`, `2px` radius. Confidence: High.
- **Health metric card** (`.health-metric-card`): `padding: 9px`, `1px --border-subtle`, `--bg-base / .45`; label `9px/600` uppercase muted; value tile `min-height: 82px` centered.
- **Value tile** (`.health-value-tile`): `--bg-surface`, 1px subtle border, centered mono value `clamp(15px, 1.3vw, 20px)`.
- **Gauge widgets:** ECharts gauge (`HealthGauge.tsx`) with style variants (basic, simple, speed, barometer, stage, grade, temperature, ring, progress, multi); arc 180/220/360; width 12–22px; 600ms cubicOut animation.
- **Boolean indicator** (`.boolean-indicator`): badge-styled Yes/No, `min 44×24px` (44px coarse pointer), green/red.
- Confidence: High. Scope: Global.

---

## 9. Buttons and action controls

Source: `index.css:348-355`, components.

| Class | Style | Use |
| --- | --- | --- |
| `.btn` | `min-height: 34px`, `padding: 6px 12px`, `gap: 7px`, `12px/600`, `3px` radius, 1px transparent border, `--motion-fast` transitions | Base |
| `.btn-primary` | white on `--action-primary` (hover `--action-primary-hover`) | Main action |
| `.btn-secondary` | `--text-secondary` on `--bg-elevated / .6`, `--border-default` border; hover `--text-primary` on `--bg-hover` | Secondary |
| `.btn-danger` | `--error-text` on `--error / .08`, `--error / .24` border | Destructive |
| `.btn:disabled` | `opacity: .48`, `cursor: not-allowed` | — |
| `.btn-xs` (in tables) | `min-height: 28px`, `padding: 4px 8px`, `11px` | Row actions |
| `.icon-button` | `32×32px` (30 in tables, 44 mobile), `place-items: center`, `--text-secondary`, transparent bg, `1px --border-subtle`, `3px` radius; hover `--bg-elevated` + `--border-default` | Icon-only (always `aria-label`) |
| `.filter-btn-apply` / `.filter-btn-clear` | `10px/600`, `padding: 4px 10px` | Dropdown footers |
| `.filter-add-rule` | dashed `1px --accent / .4` border, accent text | Additive action |
| `.data-link` | `--accent-hover`, underline on hover only (`text-underline-offset: 3px`) | Inline links |

- Mobile: `.btn`/`.input`/`.icon-button` become `44px` min-height/width.
- **Rules:** no hover-only behavior; destructive actions require confirmation dialog; every icon control is named. Confidence: High. Scope: Global.

---

## 10. Forms and validation

Source: `index.css:355-370`, `Login.tsx`, `SearchableSelect.tsx`, `FieldHelpDialog.tsx`.

- **Input** (`.input`): `min-height: 36px` (40px via `h-10` in login), `padding: 7px 10px`, `12px`, `--text-primary` on `--bg-base / .45`, `1px --border-default`, `3px` radius. Focus: `border-color: --accent` + `box-shadow: 0 0 0 2px rgb(var(--accent) / .12)`, outline removed. Placeholder: `--text-muted`.
- **Select:** `appearance: auto` (native), `color-scheme: inherit`; options themed (`--text-primary` on `--bg-surface`, checked on `--bg-elevated`).
- **Native checkboxes / radios / ranges (since 2026-11-13, commit `08579dd`):** `input:is([type="checkbox"], [type="radio"], [type="range"])` inherit the theme via `accent-color: rgb(var(--accent))` and `color-scheme: inherit`; native appearance, disabled states, and keyboard behavior are preserved. A shared `.checkbox` class (14×14px, `flex-shrink: 0`, `cursor: pointer`; `cursor: not-allowed` when disabled) standardizes sizing.
- **Labels:** `11px/600` `--text-secondary`, `margin-bottom: 8px` (`mb-2`), always `for=`-associated or wrapping (enforced by UI gate).
- **Field error** (`.field-error`): `11px` `--error-text`, `margin-top: 5px`.
- **Dirty form banner** (`.form-dirty-banner`): `11px` `--warning-text` on `--warning / .1`, `1px --warning / .25` border.
- **Searchable select** (`SearchableSelect.tsx`): combobox pattern — button trigger styled as `.input`, absolute listbox `z-10`, search input, arrow-key navigation, Enter selects, Escape closes and restores focus, `aria-activedescendant`, 200-item cap with status line.
- **Validation behavior:** inline errors, values preserved after failure, `aria-invalid` + `aria-describedby` on failed fields (Login), rate-limited auth feedback, disabled/loading submit with spinner.
- **Field help:** `FieldHelpDialog` + `HelpLabel` question-mark triggers; expands dialog side panel ≥1024px, nested dialog below.
- Confidence: High. Scope: Global.

---

## 11. Data tables and filtering

Source: `index.css:373-399, 400-460, 711-718`, `lib/tableColumnReorder.ts`, `lib/tableSelection.ts`, `Pagination.tsx`, `ColumnFilter.tsx`, `ColumnVisibility.tsx`.

- **Base table:** `border-collapse: separate`, `border-spacing: 0`, `width: 100%`.
- **`.data-table`:** `12px`, `--bg-surface`. Header: sticky `top: 0`, `z-index: 4`, `--bg-elevated` (or `.opaque-table-header`), `height: 40px`, `padding: 9px 14px`, `10px/600` `--text-table`, `letter-spacing: .025em`, `inset 0 -1px 0 --border-subtle` shadow. Body cells: `padding: 10px 14px`, `border-top: 1px --border-subtle`, `line-height: 1.35`, text `--text-table`. Row hover: `--bg-elevated / .42` (100ms transition).
- **Value typography — shared `table-text` class (since 2026-11-13, commits `8710780`, `ffd9646`):** `.table-text` (and `.data-table`) set IBM Plex Sans, `12px`, `--text-table`; `.table-text` adds `font-weight: 400`, `line-height: 1.35`. Add `font-mono` for identifiers, addresses, timestamps, and aligned numbers (IBM Plex Mono, `tabular-nums`); `data-link` for navigable values (`--accent-hover`); semantic status colors where the value conveys status. Helper copy, badges, and form controls stay separate from value typography.
- **Table color scoping (since 2026-11-13, commit `08579dd`):** `--text-table` applies to **direct data-table cells only** (`.data-table > tbody > tr > td`), never globally to nested labels, controls, or helper text. Cells carrying explicit semantic text utilities (`.text-accent`, `.text-success-text`, `.text-error-text`, `.text-warning-text`, `.text-warning-strong`) keep their semantic color. Light mode forces pure black table text via `[data-theme="light"] .table-text`.
- **Scroll container** (`.table-scroll`): `max-height: calc(100vh - 280px)`, `overflow-y: auto`; non-data tables inside use `13px`.
- **Fixed columns:** first identifier column sticky-left on mobile (`z-index: 2`, surface bg, 1px right shadow); trailing `data-column-fixed="visibility"` (40px, right: 0, z-3) and `data-column-fixed="actions"` (right: 40px, z-2, centered) sticky-right, excluded from reordering.
- **Sorting:** `SortableHeader` button with `aria-sort` (ascending/descending/none), `ArrowUp/ArrowDown/ArrowUpDown` 12px icons.
- **Column reordering:** pointer drag with `cursor: grab/grabbing`, dragging header `opacity: .45`, keyboard alternative, stable `data-column-order-id` on every reorderable cell; fixed columns cannot move.
- **Column filter** (`.filter-dropdown`): fixed-position portal, `z-index: 110`, `320px`, `--bg-surface`, `1px --border-default`, `3px` radius, shadow `0 12px 32px / .28`; header (11px/600 title + 20px close), body (10px labels, 28px min-height 11px inputs, rule rows), footer (Clear secondary / Apply primary, 10px/600). Active filter toggle: 20px button, accent when active, `12px` accent badge with count.
- **Column visibility** (`.column-dropdown`): `220px`, 14px checkboxes `accent-color: --accent`, rows `11px` `--text-secondary`, hover `--bg-elevated`.
- **Filter summary** (`.table-filter-chip`): pill `999px`, `--bg-elevated`, `11px`, 16px remove button; clear-all 24px button with accent hover.
- **Pagination** (`.table-footer`): "Showing X - Y of Z" `11px` muted; page-size select (options `10, 15, 20, 50, 100, 200, 500, 1000`, default `20`, persisted `acs_page_size`); Previous/Next `.btn-secondary` with 14px chevrons.
- **Selection:** row checkboxes `data-table-select-row`, header select-all `data-table-select-all` (Ctrl/Cmd+A), Shift range select, Delete key triggers `data-table-delete-selected` button.
- **Row reordering:** grip button + pointer capture (not native HTML5 drag), edge autoscroll, Escape cancels, stable record IDs.
- **Boolean cells:** `BooleanIndicator` (green Yes / red No badge-button, `aria-pressed`, confirmation before mutation).
- **CWMP fault table:** `table-layout: auto`, message wraps, parameter single-line capped `28rem` ellipsis.
- Confidence: High. Scope: Global.

---

## 12. Dialogs and notifications

Source: `Dialog.tsx`, `Feedback.tsx`, `index.css:461-490`.

- **Dialog** (`.dialog-backdrop` / `.dialog-panel`): fixed `z-index: 100`, backdrop `rgb(0 0 0 / .68)`, centered; panel `--bg-surface`, `1px --border-default`, `3px` radius, shadow `0 24px 64px / .32`, `max-height: min(760px, 100vh - 32px)`. Sizes: 420/560/880px (+1120 with side panel).
  - Header: `16px 18px`, `h2 16px/620`, description `12px` muted, optional warning badge (pill, `--warning` tint), close icon-button; draggable title bar (grab cursor), arrow-key move, Home resets.
  - Body: `18px` padding, scrolls independently.
  - Actions: right-aligned, `gap: 8px`, `12px 18px`, `border-top: 1px --border-subtle`; Cancel `.btn-secondary`, confirm `.btn-primary`/`.btn-danger` with `autofocus`.
  - Resize: bottom-right handle (32×24, 44px coarse pointer), pointer drag + arrow keys (Shift = 40px steps), Home resets, click opens size sliders; clamped to viewport.
  - A11y: `role="dialog"`, `aria-modal="true"`, focus trap (Tab/Shift+Tab), Escape closes (innermost dialog first), body scroll locked, other dialogs `inert`, focus restored to trigger on close. Enforced by UI gate.
  - Mobile: bottom-aligned sheet, `border-radius: 6px 6px 0 0`, safe-area padding.
- **Confirmation:** `Feedback.confirm()` promise API → small dialog, danger or primary tone.
- **Notifications** (`.notice-stack` / `.notice`): fixed top-right `z-index: 120`, `min(420px, 100vw - 32px)`, `gap: 8px`; notice: `--bg-surface`, `1px` tone-tinted border (success `.38`, error `.42`, accent `.38`), `3px` radius, shadow `0 14px 36px / .24`; icon 17px tone-colored; title `12px` bold; message `11px` `--text-secondary`; optional `details/summary` "Technical details" with mono `pre` (`--bg-base`, subtle border, `max-height: 140px`).
  - Behavior: success/info auto-dismiss after 5s; errors persist until dismissed; `role="alert"` for errors, `role="status"` otherwise; `aria-live="polite"` stack.
- Confidence: High. Scope: Global.

---

## 13. Charts and visualizations

Source: `MetricChart.tsx`, `DeviceGrowthChart.tsx`, `HealthGauge.tsx`, `InterfaceMetricChart.tsx`, `IperfResult.tsx`, `OntLanVisualization.tsx`.

- **Library:** ECharts `6.1.0`, tree-shaken via `echarts/core` + registered modules (Line, Bar, Scatter, EffectScatter, Candlestick, Boxplot, Heatmap, Gauge, Grid, Tooltip, MarkLine, Legend, CanvasRenderer).
- **Fonts:** axis labels and tooltips use `"IBM Plex Mono", monospace` at `10–11px`.
- **Theme adaptation (since 2026-11-13):** all chart components use the `useChartTheme()` hook from `lib/chartTheme.ts`, which reads root semantic tokens (`--text-primary`, `--text-muted`, `--border-default`, `--border-subtle`, `--bg-elevated`, `--bg-surface`, `--accent`, `--success`, `--warning`, `--error`) via `getComputedStyle` and maps them to ECharts colors. The hook tracks the resolved-theme signal, so mounted charts re-theme automatically on theme change (no MutationObserver). `lib/theme.ts` applies the DOM palette before notifying reactive consumers. Previously only `DeviceGrowthChart` adapted; `MetricChart`/`HealthGauge` used fixed dark constants (resolved, see ambiguity D-2).
- **Palettes:** `DEFAULT_PALETTE` 6-color rotation (sky, lavender, mint, gold, pink, orange) — intentionally hardcoded (user-configurable series colors); per-metric user colors override.
- **Gauges:** default zones use `--success`/`--warning`/`--error` tokens; style presets (grade/barometer/stage/speed/temperature) use hardcoded hex; 600ms cubicOut animation; pointer/progress variants.
- **Tooltips:** `--bg-surface` bg, `--border-default` border, `--text-primary` text, 11px mono, axis-triggered, formatted via `formatDateTime`.
- **Time axis:** `formatDateTime` with `hideOverlap: true`.
- **ONT LAN visualization:** custom SVG (`OntLanVisualization.css`), focus glow `drop-shadow(0 0 3px #38bdf8)`.
- Confidence: High. Scope: App-specific implementation, global conventions (mono, theme tokens where read).

---

## 14. Loading and empty states

Source: `index.css:440-445, 487-490`, `ResourceState.tsx`, `App.tsx`.

- **App loader** (`.app-loader`): full-viewport centered `18px` spinner + `12px` `--text-secondary` label ("Loading control plane…").
- **Spinner** (`.spinner`): `18×18px`, `2px --border-default` ring, `--accent` top arc, `.7s linear infinite`; inline variant in buttons `!w-4 !h-4 !border-white/40 !border-t-white`.
- **Skeleton** (`.skeleton`): `2px` radius, `linear-gradient(90deg, --bg-elevated, --bg-hover, --bg-elevated)` at `200%` size, `shimmer 1.4s linear infinite`.
- **Empty state** (`EmptyState` / `.resource-state`): `min-height: 180px` (120 compact), centered column, `28px 18px` padding; icon in `38×38px` `3px`-radius box (`--text-muted`, `--border-default`); title `13px` bold; description `11px` muted `max-width: 520px`; optional action row `gap: 8px`. Copy must be specific (never generic "No data").
- **Error state** (`ResourceError` / `.resource-state.is-error`): `role="alert"`, error-tinted icon box (`--error / .36` border), "Retry request" `.btn-secondary`.
- **Table loading:** skeleton rows matching column structure (per UI standard).
- Confidence: High. Scope: Global.

---

## 15. Responsive behavior

Source: `index.css` media queries.

- **Breakpoints:** `639px` / `640px` (mobile → small), `1024px` (tablet → desktop), `1536px` (wide). Tailwind defaults (`sm 640`, `lg 1024`, `xl 1280`, `2xl 1536`) plus custom `639px` max-width queries.
- **Mobile (<640px):** sidebar off-canvas; topbar `min-height: 58px + safe-area`; content padding `12px 10px`; page header stacks; registers 2-col; inputs/buttons/icon-buttons `44px`; nav links `48px`; dialogs become bottom sheets; first table column sticky; `scroll-padding-top` for sticky topbar; `100dvh` shell.
- **Small (≥640px):** service-state pill visible; content padding `20px 18px 40px`; registers 3–4 col; data-panel grid 2-col.
- **Desktop (≥1024px):** sidebar fixed + collapsible; content padding `24px 24px 48px`; topbar padding `0 24px`; task register 6-col; health grid 3-col at ≥1536px.
- **Landscape short screens:** `table-scroll` max-height removed.
- **Coarse pointers:** 44px resize handle, 44px boolean indicator.
- **Safe areas:** `env(safe-area-inset-*)` on topbar, content, dialogs, notice stack.
- Confidence: High. Scope: Global.

---

## 16. Dark/light themes

- **Mechanism:** `data-theme` attribute on `<html>`; dark is the default (`:root`), light overrides the same custom properties. `color-scheme` set per theme.
- **Preference:** `dark | light | system` cycled by `ThemeSwitcher` (Sun/Moon/Monitor icons); persisted `localStorage['acs-theme']`; `system` follows `prefers-color-scheme` with a live `matchMedia` listener.
- **`meta[theme-color]`:** `#080f1a` (dark) / `#ebf2f9` (light).
- **Light-mode text policy:** body text black for chart compatibility; interactive elements keep blue-gray tokens; table text forced pure black (`.table-text`); semantic Tailwind utilities map to tokens via `@theme inline` (see 1.2) — no light-only utility remaps remain.
- **Theme transition:** `.transition-theme` (`160ms` bg/border/color) where applied.
- Confidence: High. Scope: Global.

---

## 17. Accessibility and keyboard interaction

Source: `index.css`, `Dialog.tsx`, `Layout.tsx`, `SortableHeader.tsx`, `SearchableSelect.tsx`, `scripts/check-ui-standards.mjs`, `docs/ui-ux-standard.md`.

- **Focus:** `:focus-visible` `2px solid --accent`, `offset 2px` on all interactive elements; focus outlines on fleet drag/resize handles use `--accent` (previously `--primary`, undefined — resolved 2026-11-13, see ambiguity D-1).
- **Keyboard:**
  - Dialogs: Tab trap, Escape (innermost first), arrow-key resize/move, Home reset.
  - Sidebar: Escape closes drawer, returns focus to menu button.
  - Tables: Ctrl/Cmd+A select page, Delete triggers bulk-delete button, Shift+click/Space range select, arrow-key column sort via buttons, keyboard column reorder, keyboard row reorder alternative.
  - Dropdowns (filter/column/searchable-select): Escape closes and restores focus to trigger; arrow keys navigate options; Enter selects.
  - Boolean indicators: real buttons with `aria-pressed`, confirmation dialog before mutation.
- **Screen reader:** `aria-label` on all icon-only controls; `aria-sort` on sortable headers; `role="dialog"`/`aria-modal`; `role="alert"` for errors, `role="status"` for notices; `aria-live="polite"`; `aria-invalid`/`aria-describedby` on failed inputs; `aria-current="page"` on active nav; `aria-expanded` on toggles; `aria-keyshortcuts="Delete"` on bulk delete.
- **Labels:** every `<label>` associated via `for` or wrapping (gate-enforced).
- **Reduced motion:** `prefers-reduced-motion` collapses all animations/transitions to `.01ms`.
- **Contrast:** WCAG 2.2 AA target; primary action contrast gate-checked at 4.5:1.
- **Touch:** 44px targets on mobile; no hover-only behavior.
- **Motion:** UI transitions (fade/slide/fade-slide, 150–600ms) are opt-in via settings, default off.
- Confidence: High. Scope: Global.

---

## Reuse frequency notes (measurable)

- `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-danger`: used across all 20+ pages (hundreds of occurrences).
- `.input`: every form field in the app.
- `.data-table`: every list page (Devices, Faults, Firmwares, Security, Users, Tasks, Provisioning, Dictionaries, SystemTasks, DatabaseIndexes…).
- `.badge` + status variants: device status, task state, fault state, boolean cells.
- `.icon-button`: topbar, sidebar, table rows, notices, dialogs.
- `Dialog`: all confirmations and edit forms (CreateDeviceDialog, WanSettingsModal, WifiSettingsModal, LanSettingsModal, MetricModal, CustomCPEEditModal, FieldHelpDialog…).
- `EmptyState`/`ResourceError`: every data region.
- `PageHeader`: every page.
- `Pagination`: every paginated table.
- `DeviceStatusBadge`: inventory, detail, fleet counts.
