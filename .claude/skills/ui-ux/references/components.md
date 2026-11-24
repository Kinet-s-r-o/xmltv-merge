# Component Catalog — Kinet UI/UX

Contracts for the shared components. Copy-paste implementations live in `examples/`. Class definitions live in `examples/components.css`.

## 1. App shell

- **Sidebar** (`.app-sidebar`): fixed left, 256px, `z-50`, `--bg-sidebar`, 1px right border. Brand row (72px) → nav (grouped, section labels 11px muted) → footer (operator card + version). Collapsible to 64px icon rail on desktop (hover-expands with blur); off-canvas drawer with scrim on mobile.
- **Topbar** (`.topbar`): 58px sticky, `z-30`, `--bg-base`, 1px bottom border. Left: mobile menu button + 9px mono kicker + 14px/600 title. Right: service-state pill + theme switcher.
- **Content area** (`.content-area`): max-width 1680px centered, theme-aware padding.

## 2. PageHeader

```
<header class="page-header">
  <div class="page-header-copy"><h1>{title}</h1><p>{description}</p></div>
  <div class="page-header-tools">{status}{actions}</div>
</header>
```
- `min-height: 66px`, `padding-bottom: 14px`, 1px `--border-default` bottom border.
- Title 20px/620 (`-.02em`); description 12px muted, max-width 680px.
- Tools right-aligned, `gap: 8px`, wrap. Mobile: stacks, title 18px.
- **Rules:** concrete domain titles; no vanity statistics; tools carry the page's primary actions.

## 3. Buttons

| Class | Style | Use |
| --- | --- | --- |
| `.btn` | 34px min-height, `6px 12px`, gap 7px, 12px/600, 3px radius | Base |
| `.btn-primary` | white on `--action-primary` | Main action |
| `.btn-secondary` | `--text-secondary` on `--bg-elevated/.6`, `--border-default` border | Secondary |
| `.btn-danger` | `--error-text` on `--error/.08`, `--error/.24` border | Destructive |
| `.btn:disabled` | opacity .48, not-allowed | — |
| `.btn-xs` | 28px min-height, 11px | Table row actions |
| `.icon-button` | 32px square, 1px `--border-subtle`, 3px radius | Icon-only — **always `aria-label`** |
| `.data-link` | `--accent-hover`, underline on hover | Inline links |

- Loading: replace label with `.spinner` (16px, white border variant) + "Working…".
- Destructive actions always go through the Feedback confirmation dialog.

## 4. Inputs and forms

- `.input`: 36px min-height, `7px 10px`, 12px, `--text-primary` on `--bg-base/.45`, 1px `--border-default`, 3px radius. Focus: accent border + `0 0 0 2px rgb(var(--accent)/.12)` ring.
- Labels: 11px/600 `--text-secondary`, 8px below the label, **always associated** (`for` or wrapping).
- `.field-error`: 11px `--error-text`, 5px below field. Set `aria-invalid` + `aria-describedby`.
- Selects: native `appearance: auto`, `color-scheme: inherit`, themed options.
- **Native checkboxes / radios / ranges:** `accent-color: rgb(var(--accent))` + `color-scheme: inherit` (native appearance, disabled states, and keyboard behavior preserved); shared `.checkbox` class (14×14px, `flex-shrink: 0`, `cursor: pointer`; `not-allowed` when disabled).
- Searchable select (combobox): button trigger styled as `.input`; listbox with search, arrow-key nav, Enter select, Escape close + focus restore, `aria-activedescendant`, 200-item cap.
- Dirty-form banner: `.form-dirty-banner` (warning tint, 11px).
- **Behavior:** preserve entered values after validation/network failure; disabled + spinner on submit; rate-limit feedback for auth.

## 5. Badges and status

- `.badge`: 20px min-height, `1px 7px`, 10px/600, `.015em`, 3px radius, 1px transparent border.
- Variants: `.badge-success` (success text/fill/border at .1/.22), `.badge-error`, `.badge-warning`.
- **DeviceStatusBadge pattern:** Online → success, Offline → error, Waiting → warning (title explains "awaiting first Inform").
- **BooleanIndicator:** badge-styled Yes/No (green/red); editors get a real button with `aria-pressed`; every toggle opens a confirmation naming the item and requested value; read-only users see the same colored text without the control.

## 6. Data panel and tables

- `.data-panel`: `--bg-surface`, 1px `--border-default`, no radius. Universal container.
- `.data-panel-header` / `.table-panel-toolbar`: 58px min-height, `13px 16px`, 13px/600 title, 10px muted sub, 1px `--border-subtle` bottom border.
- `.data-table`:
  - 12px, `--bg-surface`; header sticky (z-4), `--bg-elevated`, 40px tall, 10px/600 `--text-table`, `.025em`, inset bottom hairline.
  - Cells `10px 14px`, 1px `--border-subtle` top border, `--text-table`, lh 1.35; row hover `--bg-elevated/.42`.
  - **Value typography:** use the shared `table-text` class for cell values (IBM Plex Sans 12px, `--text-table`, 400, lh 1.35). Add `font-mono` for identifiers/addresses/timestamps/aligned numbers, `data-link` for navigable values, or semantic status colors where the value conveys status. Keep helper copy, badges, and form controls separate from value typography.
  - **Color scoping:** `--text-table` applies to direct data-table cells only (`.data-table > tbody > tr > td`), never globally to nested labels, controls, or helper text. Cells with explicit semantic text utilities (`.text-accent`, `.text-success-text`, `.text-error-text`, `.text-warning-text`, `.text-warning-strong`) keep their semantic color. Light mode forces pure black table text.
  - `.table-scroll`: `max-height: calc(100vh - 280px)`.
  - **Fixed columns:** first identifier sticky-left on mobile; trailing `data-column-fixed="visibility"` (40px) and `data-column-fixed="actions"` (40px, centered) sticky-right, excluded from reordering.
  - **Sorting:** button per sortable header with `aria-sort`; ArrowUp/Down/ArrowUpDown 12px icons.
  - **Column reorder:** pointer drag (grab cursor, dragging header opacity .45) + keyboard alternative; stable `data-column-order-id` on every reorderable cell.
  - **Column filter:** portal dropdown (z-110, 320px), rule rows (op + input), Apply (primary) / Clear (secondary); active toggle shows accent + count badge.
  - **Column visibility:** portal dropdown (z-110, 220px), 14px checkboxes `accent-color: --accent`.
  - **Filter summary:** pill chips (999px, `--bg-elevated`, 11px) with 16px remove buttons; clear-all button.
  - **Selection:** row checkboxes, header select-all (Ctrl/Cmd+A), Shift range select, Delete key → bulk-delete button (`aria-keyshortcuts="Delete"`).
  - **Row reorder:** grip button + pointer capture (not native HTML5 drag), edge autoscroll, Escape cancels, stable record IDs, keyboard alternative.
- **Pagination** (`.table-footer`): "Showing X - Y of Z" 11px muted; page-size select (10/15/20/50/100/200/500/1000, default 20, persisted); Previous/Next `.btn-secondary` with 14px chevrons.

## 7. Dialog

- Backdrop: fixed z-100, `rgb(0 0 0/.68)`, centered; mobile: bottom sheet (6px top radius, safe-area padding).
- Panel: `--bg-surface`, 1px `--border-default`, 3px radius, shadow `0 24px 64px/.32`, max-height `min(760px, 100vh-32px)`. Sizes: small 420 / medium 560 / large 880 / side-panel 1120.
- Header: 16px/620 title, 12px muted description, optional warning badge (pill), close icon-button; **draggable title bar** (grab cursor; arrow keys move, Shift = larger steps, Home resets).
- Body: 18px padding, independent scroll.
- Actions: right-aligned, gap 8px, 1px `--border-subtle` top border; Cancel `.btn-secondary`, confirm `.btn-primary`/`.btn-danger` with `autofocus`.
- Resize: bottom-right handle (32×24; 44px coarse pointer) — pointer drag, arrow keys (Shift = 40px), Home resets, click opens size sliders; clamped to viewport; per-dialog (not persisted).
- **A11y contract (gate-enforced):** `role="dialog"`, `aria-modal="true"`, focus trap (Tab/Shift+Tab), Escape closes innermost dialog, body scroll locked, sibling dialogs `inert`, focus restored to trigger on close.
- **Usage:** confirmations and short focused forms. Not for long workflows (parameter trees).

## 8. Feedback (notifications + confirmations)

- **Notice stack** (`.notice-stack`): fixed top-right z-120, `min(420px, 100vw-32px)`, gap 8px, `aria-live="polite"`.
- **Notice** (`.notice`): `--bg-surface`, 1px tone-tinted border (success .38 / error .42 / accent .38), 3px radius, shadow `0 14px 36px/.24`; 17px tone icon; 12px bold title; 11px `--text-secondary` message; optional `details` "Technical details" with mono `pre` (max-height 140px).
- **Behavior:** success/info auto-dismiss after 5s; errors persist until dismissed; `role="alert"` (error) / `role="status"` (others).
- **Confirmation:** promise-based `confirm({title, description, confirmLabel, cancelLabel, tone})` → small dialog; danger tone for destructive.
- **Rules:** never use a notification for information requiring a decision (use a dialog); never use native `alert/confirm`.

## 9. Resource states

- **EmptyState** (`.resource-state`): 180px min-height (120 compact), centered; 38px icon box (3px radius, `--text-muted`, `--border-default`); 13px bold title; 11px muted description (max-width 520px); optional action row.
- **ResourceError** (`.resource-state.is-error`): `role="alert"`, error-tinted icon box, "Retry request" `.btn-secondary` when retry is safe.
- **Rules:** specific copy (what is missing, why, what next); never generic "No data" / "Something went wrong".

## 10. Loading

- **App loader** (`.app-loader`): full-viewport centered 18px spinner + 12px `--text-secondary` label.
- **Spinner** (`.spinner`): 18px, 2px `--border-default` ring, `--accent` top arc, .7s linear infinite.
- **Skeleton** (`.skeleton`): 2px radius, `--bg-elevated → --bg-hover → --bg-elevated` gradient at 200%, shimmer 1.4s.
- Table loading: skeleton rows matching the column structure.

## 11. Tabs

- `.tab-bar`: flex, 1px `--border-default` bottom border.
- `.tab-btn`: `8px 16px`, 12px/600, `--text-muted`; hover `--text-secondary`; active `--accent` + 2px `--accent` bottom border.
- Mobile: horizontal scroll, 44px min-height.

## 12. Operational register (dashboard metric cards)

- `.ops-register`: grid, `gap: 1px` over `--border-default` background (1px grid lines); cells `--bg-surface`, `14px 16px`.
- Cell: 11px muted label; 24px mono 600 tabular-nums value; 10px muted footnote.
- Status variants tint the value: `is-online` (success), `is-offline` (error), `is-warning` (warning), `is-sent` (accent).
- **Filter cards** (`.fault-filter-card` / `.task-filter-card`): full-width buttons, hover `--bg-hover`, `aria-pressed` shows 6px accent dot; 24px mono count.
- **Rules:** only metrics tied to an operator decision; include data freshness; no vanity statistics.

## 13. Distribution list (progress rows)

- `.distribution-list`: rows of label (12px) + progress bar (12px tall, 2px radius, 1px `--border-subtle`) + value (12px mono right-aligned).
- Bar color via `--distribution-progress-color` (default `--accent`; semantic variants blue/green/amber/orange/red/gray).

## 14. Charts

See `references/charts.md`.

## 15. Icon conventions

- Library: Lucide (`lucide-solid`).
- Sizes: 12 (sort indicators), 13 (chevrons), 14 (pagination, service pill), 15–16 (table/notice/dialog), 17 (nav, notices), 18–20 (topbar/menu), 22 (empty-state icons).
- Nav icons: `stroke-width: 1.7`.
- Icon-only controls always carry `aria-label` + `title`.
- Icons in headings/section titles: `--accent` color.
