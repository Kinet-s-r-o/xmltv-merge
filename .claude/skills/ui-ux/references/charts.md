# Charts and Data Visualization — Kinet UI/UX

## 1. Library and setup

- **ECharts 6.x**, tree-shaken: import from `echarts/core`, register only the needed modules (Line, Bar, Scatter, Gauge, Grid, Tooltip, MarkLine, Legend, CanvasRenderer).
- Initialize per element; `ResizeObserver` for resize; dispose on unmount.
- **Theme adaptation (required pattern):** use the `useChartTheme()` hook from `lib/chartTheme.ts` inside the reactive option builder. It reads root semantic tokens via `getComputedStyle(document.documentElement)` and maps them to ECharts colors (`text`, `label`, `border`, `grid`, `track`, `surface`, `accent`, `success`, `warning`, `error`, `tooltip`). Because the hook tracks the resolved theme signal, mounted charts re-theme automatically when the theme changes — no MutationObserver needed. `lib/theme.ts` applies the DOM palette before notifying reactive consumers, so the computed styles are already current when the effect runs. All reference charts (`MetricChart`, `HealthGauge`, `DeviceGrowthChart`, `InterfaceMetricChart`, `IperfResult`) use this pattern.

## 2. Typography in charts

- Axis labels and tooltips: `"IBM Plex Mono", monospace`, 10–11px.
- Time axes formatted with the global date/time preference (`formatDateTime`), `hideOverlap: true`.
- Missing values render as an em dash (`—`).

## 3. Palette

### 3.1 Structural colors — token-driven (confirmed)

All structural chart colors come from `useChartTheme()` and adapt to the resolved theme automatically:

| Role | Token |
| --- | --- |
| Tooltip text, gauge detail/split lines | `--text-primary` |
| Axis labels, legend, gauge axis labels/ticks, chart titles | `--text-muted` |
| Axis lines, tooltip border | `--border-default` |
| Grid lines | `--border-subtle` |
| Gauge track (progress/ring/multi) | `--bg-elevated` |
| Tooltip background, gauge speed-style detail background | `--bg-surface` |
| Default line/series color | `--accent` |
| Online/healthy series | `--success` |
| Warning threshold lines | `--warning` |
| Critical threshold lines | `--error` |

Tooltip: 11px, `"IBM Plex Mono", monospace`, axis-triggered.

### 3.2 Series and gauge-zone colors — intentionally hardcoded (probable)

| Role | Value |
| --- | --- |
| Default series | `#38bdf8` |
| Series rotation (`DEFAULT_PALETTE`, `MetricChart.tsx`) | `#38bdf8, #a78bfa, #34d399, #fbbf24, #f472b6, #fb923c` |
| Gauge default zones | `--success` / `--warning` / `--error` tokens |
| Gauge preset zones (grade/barometer/stage/speed/temperature) | hardcoded hex per style (`HealthGauge.tsx`) |
| `thresholdLines()` defaults (`lib/health.ts`) | warn `#f59e0b`, critical `#f43f5e` |

- Per-metric user colors override the palette (stored with the metric definition).
- These are **intentionally hardcoded**: they are user-configurable series colors and visual presets, not theme-dependent structural colors. Do not tokenize them.
- Note: `#a78bfa` is violet-family but chart-internal only; the UI gate bans purple *tokens* in UI CSS, not chart series colors.

## 4. Chart types in use

- **Line** (metric time series, device growth) — with min/max aggregate bands where available.
- **Bar** (iperf results, distributions) — `barMaxWidth: 32`, right-side value labels.
- **Gauge** (health) — style presets: basic, simple, speed, barometer, stage, grade, temperature, ring, progress, multi; arc 180/220/360; width 12–22px; 600ms cubicOut; zone colors from thresholds or presets.
- **Scatter / EffectScatter / Candlestick / Boxplot / Heatmap** — registered for advanced metric views.

## 5. Interactions

- Axis-triggered tooltips listing series values with markers; values formatted with `toLocaleString()`.
- Bucket/interval selectors (1h/6h/24h/7d/30d/365d) persisted per device in `localStorage`.
- Threshold mark lines with semantic colors.
- Unit scaling: auto (K/M/G/T), bytes (KB/MB/GB/TB), bits (Kb/Mb/Gb/Tb), pps (Kpps/Mpps/Gpps).

## 6. Rules

- Charts answer an operational question; no decorative charts.
- Color never carries status alone — pair with labels/legends.
- Respect `prefers-reduced-motion` (disable chart animation).
- Keep chart text readable in both themes (token-driven colors).
