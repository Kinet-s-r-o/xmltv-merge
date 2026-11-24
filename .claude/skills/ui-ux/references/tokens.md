# Design Tokens — Kinet UI/UX

Machine-readable form: `assets/tokens.json`. This file is the human reference with usage rules.

## 1. Color tokens

### 1.1 Architecture

- All colors are **semantic CSS custom properties** declared as **RGB triplets** (`--bg-base: 8 15 26;`) and consumed as `rgb(var(--bg-base))`.
- Alpha composition works directly: `rgb(var(--accent) / .1)`.
- `:root` holds the **dark** palette (default, `color-scheme: dark`). `[data-theme="light"]` overrides the **same property names** with light values.
- Theme is applied by setting `data-theme="dark" | "light"` on `<html>`; a `system` preference resolves via `prefers-color-scheme`.

### 1.2 Dark palette (default)

| Token | RGB | Hex | Role |
| --- | --- | --- | --- |
| `--bg-base` | `8 15 26` | `#080f1a` | App background; input fill base |
| `--bg-surface` | `13 24 39` | `#0d1827` | Panels, dialogs, table body, sidebar |
| `--bg-elevated` | `20 36 56` | `#142438` | Hover fills, table header, secondary buttons |
| `--bg-hover` | `29 50 74` | `#1d324a` | Nav hover, secondary button hover |
| `--bg-sidebar` | `13 24 39` | `#0d1827` | Sidebar background |
| `--nav-active-bg` | `20 55 88` | `#143758` | Active nav fill |
| `--nav-active-border` | `35 111 164` | `#236fa4` | Active nav border |
| `--text-primary` | `232 240 248` | `#e8f0f8` | Primary text |
| `--text-secondary` | `154 174 196` | `#9aaec4` | Secondary text, button labels |
| `--text-muted` | `126 148 171` | `#7e94ab` | Captions, labels, placeholders |
| `--text-table` | `255 255 255` | `#ffffff` | Table cell text |
| `--text-on-action` | `255 255 255` | `#ffffff` | Text on filled action/accent controls (primary buttons, filter badges, apply buttons) |
| `--border-subtle` | `28 48 70` | `#1c3046` | Hairline dividers |
| `--border-default` | `43 67 92` | `#2b435c` | Panel/control borders |
| `--accent` | `14 165 233` | `#0ea5e9` | Focus, links, active states, chart lines |
| `--accent-hover` | `56 189 248` | `#38bdf8` | Accent hover, data links, active nav text |
| `--action-primary` | `3 105 161` | `#0369a1` | Primary button fill (white text) |
| `--action-primary-hover` | `7 89 133` | `#075985` | Primary button hover |
| `--success` | `34 197 94` | `#22c55e` | Success base |
| `--success-text` | `74 222 128` | `#4ade80` | Success text |
| `--error` | `239 68 68` | `#ef4444` | Error base |
| `--error-text` | `248 113 113` | `#f87171` | Error text |
| `--warning` | `245 158 11` | `#f59e0b` | Warning base |
| `--warning-text` | `251 191 36` | `#fbbf24` | Warning text |
| `--warning-strong` | `249 115 22` | `#f97316` | Strong warning (orange) — orange progress bars, orange text utilities |
| `--shadow-color` | `0 0 0` | `#000000` | Base for all shadows, backdrops, scrims (consumed with alpha) |
| `--highlight-color` | `255 255 255` | `#ffffff` | Inner highlight edges on progress bars and similar controls |
| `--scrollbar-track` | `8 15 26` | `#080f1a` | Scrollbar track |
| `--scrollbar-thumb` | `43 67 92` | `#2b435c` | Scrollbar thumb |

### 1.3 Light palette

| Token | RGB | Hex |
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

(`--text-on-action`, `--shadow-color`, `--highlight-color` are theme-invariant — not overridden in light mode.)

### 1.4 Light-mode text policy

- `body` text tokens are forced to black in light mode for chart compatibility.
- Interactive elements (`button`, `[role="button"]`, `.btn`, `.app-sidebar`, `.tab-bar`, `[role="tab"]`, `.badge`, `.health-value`, `progress`, `meter`, `[role="progressbar"]`, swatches) keep the blue-gray text tokens.
- Table text is forced pure black in light mode via `[data-theme="light"] .table-text` (commit `ffd9646`).
- **No light-only utility remaps remain** (removed in commit `08579dd`). Instead, a Tailwind 4 `@theme inline` block maps **semantic** utilities to CSS tokens so they work in both themes, including opacity and state variants (e.g. `text-success-text`, `bg-error/10`, `border-accent/30`, `hover:bg-hover`). **New code must use semantic theme colors, not raw Tailwind palette utilities** — the UI gate rejects palette-shade classes (`text-slate-400`, `bg-zinc-700`, `border-amber-300`, …).
- Explicit semantic text utilities (`.text-accent`, `.text-success-text`, `.text-error-text`, `.text-warning-text`, `.text-warning-strong`, plus `hover:` variants) are defined unlayered at the end of `index.css` so they override legacy component defaults.

### 1.5 Usage rules

- **Status is never color-only.** Pair every status color with text or an icon.
- **Alpha conventions (probable):** status fills `/ .08–.18`, status borders `/ .2–.42`, accent tints `/ .1–.16`, row hover `/ .42`, disabled opacity `.48`.
- **Primary action contrast:** white on `--action-primary` must meet WCAG AA 4.5:1 (checked by the validation script).
- **Prohibited:** purple/violet/indigo, Inter, glow, glass, decorative gradients.

## 2. Typography

| Token | Value | Use |
| --- | --- | --- |
| `--font-sans` | `"IBM Plex Sans", "Segoe UI", Arial, sans-serif` | Interface copy |
| `--font-mono` | `"IBM Plex Mono", "Cascadia Code", Consolas, monospace` | Serials, IPs, parameter paths, timestamps, code-like values |

Base: `font-size: 14px; line-height: 1.45; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-synthesis: none;`

| Scale | Size | Weight | Use |
| --- | --- | --- | --- |
| Display / page title | 20px (18px <640px) | 620, `letter-spacing: -.02em` | Page headers |
| Dialog title | 16px | 620 | Dialog headers |
| Brand name | 16px | 650, `-.015em` | Brand lockup |
| Section heading | 13px | 600 | Panel/toolbar headings |
| Body | 14px | 400, lh 1.45 | Base text |
| Nav link | 13px | 500 | Sidebar links |
| Nav sub-link | 12px | 400 | Submenu items |
| Button | 12px | 600 | `.btn` |
| Input | 12px | 400 | `.input` |
| Table body | 12px | 400, lh 1.35 | `.data-table` |
| Table value text | 12px | 400, lh 1.35, `--text-table` | shared `.table-text` (add `font-mono` for identifiers/addresses/timestamps/aligned numbers; `data-link` for navigable values) |
| Table header | 10px | 600, `.025em` | `.data-table thead th` |
| Badge | 10px | 600, `.015em` | `.badge` |
| Label / caption | 10–11px | 400–600 | Form labels, nav sections, footnotes |
| Register value | 24px (clamp 16–24) | 600, mono, tabular-nums | Ops register values |
| Health value | clamp(15px, 1.3vw, 20px) | 600, mono | Health tiles |
| Topbar title | 14px | 600 | Topbar h1 |
| Topbar kicker | 9px mono | 400, `.04em` | Topbar app name |
| Sidebar meta | 9px | 400 | Version/app footer |

**Mono rule:** any machine-readable value (serial, IP, MAC, parameter path, timestamp, code, numeric telemetry) uses mono with `font-variant-numeric: tabular-nums`.

## 3. Spacing

Observed whole-px scale (probable — not tokenized in source): `4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32`.

Key structural values:

| Element | Value |
| --- | --- |
| Content padding | `16px 12px 32px` (<640) / `20px 18px 40px` (≥640) / `24px 24px 48px` (≥1024) |
| Panel body | `14px 16px` |
| Panel header | `13px 16px`, min-height `58px` |
| Dialog body / header / actions | `18px` / `16px 18px` / `12px 18px` |
| Max content width | `1680px` centered |
| Register grid lines | `gap: 1px` over `--border-default` background |

## 4. Radii, borders, shadows

| Token | Value | Use |
| --- | --- | --- |
| `--radius-control` | `3px` | Buttons, inputs, icon buttons, badges, dialogs, dropdowns |
| Panel radius | `2px` (`.card`) / `0` (`.data-panel`) | Cards |
| Pill | `999px` | Filter chips, dialog header badges |
| Border width | `1px` (all); `2px` only for focus outline and active tab underline | — |
| Focus | `2px solid rgb(var(--accent))`, `outline-offset: 2px` | `:focus-visible` |
| Shadow — dropdown | `0 12px 32px rgb(var(--shadow-color) / .28)` | Filter/column dropdowns |
| Shadow — notice | `0 14px 36px rgb(var(--shadow-color) / .24)` | Notifications |
| Shadow — dialog | `0 24px 64px rgb(var(--shadow-color) / .32)` | Dialogs |
| Shadow — sidebar hover | `12px 0 32px rgb(var(--shadow-color) / .2)` | Collapsed sidebar hover |
| Backdrop — dialog | `rgb(var(--shadow-color) / .68)` | Dialog |
| Backdrop — scrim | `rgb(var(--shadow-color) / .58)` | Mobile sidebar |

All shadows, backdrops, and scrims use the `--shadow-color` token (`0 0 0`) with alpha — never a raw `rgb(0 0 0 / …)` literal.

## 5. Motion

| Token | Value | Use |
| --- | --- | --- |
| `--motion-fast` | `120ms` | Color/background/border transitions |
| `--motion-standard` | `180ms` | Sidebar/drawer layout transitions |
| Theme transition | `160ms` | Theme switch |
| Row hover | `100ms` | Table rows |
| Spinner | `0.7s linear infinite` | Loading spinner |
| Skeleton shimmer | `1.4s linear infinite` | Loading skeletons |
| Gauge | `600ms cubicOut` | Gauge animation |
| Page transitions | `150/250/400/600ms`, opt-in, default off | Route/section transitions |

`prefers-reduced-motion: reduce` collapses all animation/transition durations to `0.01ms`.

## 6. Z-index scale (confirmed)

| Layer | Value |
| --- | --- |
| Content | 0 |
| Sticky in-page header | 20 |
| Topbar | 30 |
| Mobile sidebar scrim | 40 |
| Sidebar | 50 (60 when collapsed+hover) |
| Dialog | 100 |
| Table dropdowns (filter/column) | 110 |
| Notifications | 120 |

New z-index values require a documented layer need.

## 7. Chart theming (token-driven)

All ECharts components use the `useChartTheme()` hook from `lib/chartTheme.ts` inside their reactive option builder. It reads root semantic tokens via `getComputedStyle` and maps them to ECharts colors; because it tracks the resolved-theme signal, mounted charts re-theme automatically on theme change. `lib/theme.ts` applies the DOM palette before notifying reactive consumers.

| ECharts role | Token |
| --- | --- |
| Tooltip text, gauge detail/split lines | `--text-primary` |
| Axis labels, legend, gauge axis labels/ticks, chart titles | `--text-muted` |
| Axis lines, tooltip border | `--border-default` |
| Grid lines | `--border-subtle` |
| Gauge track (progress/ring/multi) | `--bg-elevated` |
| Tooltip background, gauge speed-style detail background | `--bg-surface` |
| Default line/series color | `--accent` |
| Online/healthy series | `--success` |
| Warning / critical threshold lines | `--warning` / `--error` |

Series palette (`DEFAULT_PALETTE`) and gauge preset zone colors are intentionally hardcoded (user-configurable series colors / visual presets) — see `references/charts.md` §3.2.

## 8. Layout constants

| Element | Value |
| --- | --- |
| Sidebar width | `256px` (collapsed `64px`; mobile `min(88vw, 320px)`) |
| Topbar height | `58px` sticky |
| Button min-height | `34px` (44px mobile) |
| Input min-height | `36px` (44px mobile) |
| Icon button | `32px` (30px in tables, 44px mobile) |
| Nav link min-height | `36px` (48px mobile) |
| Table header height | `40px` |
| Dialog sizes | 420 / 560 / 880 / 1120px (side panel); max-height `min(760px, 100vh - 32px)` |
| Dropdown widths | filter `320px`, column visibility `220px` |
| Notice stack | `min(420px, 100vw - 32px)`, top-right 16px |
| Scrollbar | `8px`, thumb radius `2px` |
| Breakpoints | `640px` (mobile→small), `1024px` (→desktop), `1536px` (→wide) |
| Mobile touch target | `44px` |
