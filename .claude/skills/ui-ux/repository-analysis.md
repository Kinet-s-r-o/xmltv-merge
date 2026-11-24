# Repository Analysis — Kinet UI/UX Skill

Source repository: `Kinet-s-r-o/ACS` (TR-069/CWMP control plane).
Analysis date: 2026-11-13. Scope: `frontend/` (primary), `docs/ui-ux-standard.md`, `scripts/check-ui-standards.mjs`.
Generated/minified/vendor files (`node_modules/`, `dist/`, `package-lock.json`) were excluded from primary analysis.

## 1. Frontend framework and versions

| Item | Value | Source |
| --- | --- | --- |
| UI framework | SolidJS `1.9.17` (signals, fine-grained reactivity, JSX) | `frontend/package.json` |
| Router | `@solidjs/router` `1.0.0` (lazy route registration) | `frontend/package.json`, `src/App.tsx` |
| Language | TypeScript `7.0.2` (strict, `tsc -b` project references) | `frontend/package.json`, `tsconfig*.json` |
| Build tool | Vite `8.3.5` + `vite-plugin-solid` `2.11.14` | `frontend/vite.config.ts` |
| Node engine | `>=24.0.0` | `frontend/package.json` |
| Dev server | `vite` (default port 5173); production bundle served by Nginx behind the Go API | `README.md` |

Component model: function components with `createSignal`/`createResource`/`createMemo`; no class components, no external component library. All shared UI is hand-rolled in `src/components/` and styled by a single global stylesheet.

## 2. CSS architecture and preprocessors

- **Tailwind CSS `4.3.3`** via `@tailwindcss/vite` (CSS-first configuration; there is no `tailwind.config.js`). `src/index.css` starts with `@import "tailwindcss";`.
- **One global stylesheet** — `frontend/src/index.css` (~719 lines) — holds every design token, base reset, and component class. There are no per-component CSS modules (exception: `components/OntLanVisualization.css`, a self-contained SVG visualization).
- **No preprocessor** (no Sass/Less/PostCSS pipeline beyond Tailwind's own).
- **Token strategy:** semantic CSS custom properties declared as **space-separated RGB triplets** (`--bg-base: 8 15 26;`) and consumed as `rgb(var(--bg-base))`. This enables alpha composition (`rgb(var(--accent) / .1)`) and per-theme overrides.
- **Theme switching:** `:root` defines the dark palette (default, `color-scheme: dark`); `[data-theme="light"]` overrides the same custom properties. `lib/theme.ts` sets `data-theme` on `<html>` and persists the preference in `localStorage['acs-theme']`.
- **Utility + component hybrid:** Tailwind utilities are used for layout (`flex`, `grid`, `gap-*`, `text-*`) while all *semantic* styling (colors, borders, control geometry) goes through the custom classes and tokens. The UI gate (`scripts/check-ui-standards.mjs`) forbids inline `style=` attributes (except `data-dynamic-style`), the Inter font, purple-family tokens, native `alert/confirm`, and click handlers on non-interactive elements.
- **Semantic Tailwind theme (since 2026-11-13, commit `08579dd`):** a Tailwind 4 `@theme inline` block maps semantic utilities (`text-success-text`, `bg-error/10`, `border-accent/30`, …) to CSS tokens so they work in both themes with opacity and state variants. The former light-only utility remaps (`.text-emerald-400`, `.bg-zinc-700`, …) were removed; palette-shade utilities are now rejected by the UI gate.

## 3. UI libraries and component frameworks

- **No component library** (no shadcn, Radix, MUI, Chakra, etc.). Every control is a custom component:
  - `Dialog.tsx` — accessible modal (focus trap, Escape, resize/move, portal).
  - `Feedback.tsx` — notification stack + promise-based confirmation dialog.
  - `ResourceState.tsx` — `EmptyState` / `ResourceError`.
  - `Pagination.tsx`, `SortableHeader.tsx`, `ColumnFilter.tsx`, `ColumnVisibility.tsx`, `TableFilterSummary.tsx` — table toolkit.
  - `SearchableSelect.tsx`, `BooleanIndicator.tsx`, `DeviceStatusBadge.tsx`, `PageHeader.tsx`, `SectionPage.tsx`, `ThemeSwitcher.tsx`.
- **Table behavior libraries** in `src/lib/`: `tableColumnReorder.ts` (pointer + keyboard column reorder), `tableSelection.ts` (range select, Ctrl+A, Delete), `pointerRowReorder.ts`, `dragAutoScroll.ts`, `useColumnVisibility.ts`, `usePageSize.ts`.

## 4. Icon library and typography

- **Icons:** `lucide-solid` `1.61.0` (Lucide). Consistent sizing: nav icons `17` @ `stroke-width 1.7`; topbar/menu `18–20`; button/notice icons `14–17`; table icon-buttons `15–16`. Icons are always paired with a text label or an `aria-label` (icon-only controls are named).
- **Typography:** self-hosted via `@fontsource`:
  - `IBM Plex Sans` (weights 400/500/600/700) — interface copy. Fallbacks: `"Segoe UI", Arial, sans-serif`.
  - `IBM Plex Mono` (weights 400/500/600) — serials, IPs, parameter paths, timestamps, code-like values. Fallbacks: `"Cascadia Code", Consolas, monospace`. `font-variant-numeric: tabular-nums` is applied to mono data.
  - Base: `font-size: 14px; line-height: 1.45; -webkit-font-smoothing: antialiased`.
  - The UI gate **prohibits the Inter font** and **purple/violet/indigo** visual tokens.

## 5. Build and development tooling

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `vite` | Dev server with HMR |
| `build` | `tsc -b && vite build` | Type-check then bundle |
| `preview` | `vite preview` | Serve production build |
| `check:ui` | `node ../scripts/check-ui-standards.mjs` | Objective UI/UX quality gate |
| `test` | `node --experimental-strip-types --test tests/*.test.mjs` | Node test runner (field defs, filters, health, metrics, pagination, visibility) |

CI additionally runs Staticcheck, govulncheck, gosec, `npm audit`, and PostgreSQL 14–18 compatibility tests (backend). Frontend build-time variables: `VITE_API_URL`, `VITE_APP_NAME` (brand name; default `SkydashNET`).

## 6. Existing design tokens and themes

- **Single source of truth:** `:root` custom properties in `src/index.css` (dark) + `[data-theme="light"]` overrides. Full extraction in `references/tokens.md` and `assets/tokens.json`.
- **Semantic color roles:** `bg-base/surface/elevated/hover/sidebar`, `nav-active-bg/border`, `text-primary/secondary/muted/table`, `border-subtle/default`, `accent`/`accent-hover`, `action-primary`/`action-primary-hover`, `success`/`success-text`, `error`/`error-text`, `warning`/`warning-text`, `scrollbar-track/thumb`.
- **Shape/motion tokens:** `--radius-control: 3px`, `--motion-fast: 120ms`, `--motion-standard: 180ms`.
- **Themes:** dark (default) and light; a `system` preference resolves via `prefers-color-scheme`. `meta[theme-color]` is updated per theme (`#080f1a` / `#ebf2f9`).
- **Chart theming (token-driven since 2026-11-13):** structural chart colors (text, labels, axes, grid, track, tooltip) come from the `useChartTheme()` hook in `lib/chartTheme.ts`, which reads root semantic tokens and re-themes mounted charts on resolved-theme changes. Series palette `DEFAULT_PALETTE = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#fb923c']` (`MetricChart.tsx`) and gauge preset zone colors (`HealthGauge.tsx`) remain intentionally hardcoded (user-configurable series colors / visual presets). See `references/charts.md` §3.

## 7. Shared component architecture

- **Layout shell** (`components/Layout.tsx`): fixed 256px sidebar (collapsible to 64px on desktop, off-canvas drawer below 1024px) + sticky 58px topbar + `main.content-area` (max-width 1680px). Navigation is data-driven (`navigation` array) and permission-filtered via `canVisit(section)`.
- **Providers:** `AuthProvider` (session, RBAC) and `FeedbackProvider` (notifications + confirmations) wrap the router.
- **Page pattern:** each route renders `SectionPage` (permission guard + section identity) around a page component; pages compose `PageHeader`, `data-panel`/`table-panel` regions, `data-table`, `Pagination`, and `Dialog`.
- **State:** server state via `createResource` + typed client `lib/api.ts`; UI state via signals; persistence via `lib/storage.ts` and namespaced `localStorage` keys (`acs-theme`, `acs_page_size`, `acs.dashboard.fleet-layout:<user>`, `acs.ui-transitions`, `sidebar-collapsed`).
- **Accessibility contract** (enforced by the gate + `docs/ui-ux-standard.md`): WCAG 2.2 AA contrast, visible `:focus-visible` outline, keyboard-complete flows, labelled inputs, named icon controls, focus-trapped dialogs, `prefers-reduced-motion`, 44px mobile touch targets.

## 8. Excluded from analysis

`frontend/node_modules/`, `frontend/dist/`, `frontend/.vite/`, `package-lock.json`, backend Go sources (out of design scope), and all `.env*`/credential material (never read or copied).
