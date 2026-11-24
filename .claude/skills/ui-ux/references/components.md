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
  - **Fixed columns:** first identifier sticky-left on mobile; trailing `data-column-fixed="visibility"` (40px) and `data-column-fixed="actions"` sticky-right, excluded from reordering. Full contract in §6.1.
  - **Sorting:** button per sortable header with `aria-sort`; ArrowUp/Down/ArrowUpDown 12px icons. Full contract in §6.1.
  - **Column reorder:** pointer drag (grab cursor, dragging header opacity .45) + keyboard alternative; stable `data-column-order-id` on every reorderable cell. Full contract in §6.1.
  - **Column filter:** portal dropdown (z-110, 320px), rule rows (op + input), Apply (primary) / Clear (secondary); active toggle shows accent + count badge. Full contract (operators, behaviour, sizes) in §6.1.
  - **Column visibility:** portal dropdown (z-110, 220px), 14px checkboxes `accent-color: --accent`. Full contract in §6.1.
  - **Filter summary:** pill chips (999px, `--bg-elevated`, 11px) with 16px remove buttons; clear-all button.
  - **Selection:** row checkboxes, header select-all (Ctrl/Cmd+A), Shift range select, Delete key → bulk-delete button (`aria-keyshortcuts="Delete"`).
  - **Row reorder:** grip button + pointer capture (not native HTML5 drag), edge autoscroll, Escape cancels, stable record IDs, keyboard alternative.
### 6.1 Table toolkit: search, sorting, column filters, column order, column visibility, persistence

Every data table that lists records has all of them. Reference implementation: `examples/components/TableControls.tsx` (`useTableControls`, `ColumnHeader`, `ColumnFilter`, `TableFilterSummary`); styles in `examples/base.css` ("Column sorting, column filters, filter summary").

- **Full-text search** sits in the `.table-panel-toolbar`, right-aligned, where navigation buttons such as "Manage" would otherwise go: `.search-field` (14px Lucide `Search` icon, `input.input[type=search]`, sr-only label naming what it searches, placeholder listing the fields, e.g. "Search name, URL, status or error"), `w-full sm:w-72`. Case-insensitive substring over every visible text value of the row (including secondary lines such as errors and status labels). Hidden when the table has no records at all.
- **Scope:** every table that lists records (pages and record tables inside dialogs) gets search + sorting + column filters. Not covered: permission matrices and other fixed grids whose rows are a static schema, and read-only import previews.
- **Column definition:** each column declares `id`, `label`, `kind` (`text` | `number` | `enum` | `date`), a `value(row)` accessor, `align` (`right` for numbers), optional `options` for `enum` (in natural order; dynamic sets such as source names come from the data), optional `filterHint` when the compared value is not obvious from the cell (e.g. Schedule → "refresh interval in minutes", Access → "sections with full access"), and `sortable` / `filterable` (default true; selection, action, preview and visibility columns are plain `<th>`). Replace standalone toolbar selects (status, type, source) with the matching enum column filter.
- **Header cell** (`<th scope="col" aria-sort>`): `.th-inner` inline-flex row, gap 4px: the `.sort-btn` (label + 12px icon) then the `.filter-toggle`. Right-aligned columns keep the row right-aligned.
- **Sorting:** clicking `.sort-btn` cycles ascending → descending → unsorted. Icons: `ArrowUpDown` (unsorted, `--text-muted`), `ArrowUp` / `ArrowDown` (sorted, `--accent`); hover turns the icon accent. `aria-sort` is `ascending` / `descending` / `none`; the button's `aria-label` names the next state ("Programmes: sort descending"). One sort column at a time. Text sorts with `localeCompare(…, { numeric: true, sensitivity: 'base' })`, numbers numerically, dates chronologically, enums by their `options` order (put states that need action first, e.g. Import failed → Awaiting import → Imported → Disabled). Empty values always sort last in both directions.
- **Filter toggle** (`.filter-toggle`): 20px square, 3px radius, 12px Lucide `Filter` icon, `--text-muted`; hover `--bg-hover`. Active: accent icon, `--accent/.1` fill, `--accent/.4` border, plus `.filter-toggle-badge` (12px pill, `--accent` fill, `--text-on-action`, 8px/600) at top-right with the rule count. `aria-expanded`, `aria-haspopup="dialog"`, `aria-label` "Filter Status" / "Filter Status (1 active)".
- **Filter dropdown** (`.filter-dropdown`): portal to `<body>`, `position: fixed`, z-110, 320px (max `100vw - 16px`), right edge aligned to the toggle, 6px below it, clamped 8px inside the viewport, repositioned on scroll/resize. `role="dialog"` labelled by its title. Chrome: `--bg-surface`, 1px `--border-default`, 3px radius, shadow `0 12px 32px rgb(var(--shadow-color)/.28)`.
  - Header (`.filter-dropdown-header`, 8px 10px, bottom hairline): "Filter <Column>" 11px/600 + 20px `.filter-dropdown-close` (X 14px).
  - Body (`.filter-dropdown-body`, 10px padding, gap 8px, max-height 320px scroll): 10px/600 muted `.filter-dropdown-label` "Show rows where <Column> matches all rules"; one `.filter-rule` per rule — grid `124px | 1fr | 28px`: operator `select.input`, value control, `.filter-rule-remove` (Trash2 14px; disabled when only one rule). Inputs inside the dropdown are 28px / 11px. Below the rules a dashed `.filter-add-rule` button ("+ Add rule", accent text, `1px dashed --accent/.4`).
  - Operators by kind — text: Contains, Does not contain, Equals, Starts with, Is empty, Is not empty · number: = ≠ > ≥ < ≤ (`input[type=number]`, mono) · enum: Is, Is not (value is a `select` of the options) · date: On or after, Before (`input[type=date]`, local day boundary), Never / empty, Has a value. "Is empty"-type operators replace the value control with muted "No value needed".
  - Footer (`.filter-dropdown-footer`, 8px 10px, top hairline, right-aligned, gap 6px): Clear (`.btn-secondary.filter-btn-clear`) then Apply (`.btn-primary.filter-btn-apply`, `type=submit`), both 26px, 10px/600.
  - Rules of one column combine with AND; columns combine with AND; search combines with AND. Incomplete rules (empty value) are dropped on Apply. Clear removes the column's rules.
  - Behaviour: opening copies the applied rules into a draft (or one default rule) and focuses the first control; Enter applies; Escape or the close button discards the draft and returns focus to the toggle; a pointer-down outside closes without applying.
- **Filter summary** (`.table-filter-summary`, between toolbar and table, 8px 16px, bottom hairline), shown only while a search or rule is active: 10px/600 muted "Filters" label, one `.table-filter-chip` per rule and one for the search ("Search “term”"), then `.table-filter-clear` "Clear all" (clears rules and search; hover accent). Chip: 999px pill, `--bg-elevated`, 1px `--border-default`, 11px `--text-secondary`, value in `<strong>` `--text-primary`; 16px round remove button (`aria-label` "Remove filter: Status is Import failed").
- **Filtered-empty state:** when filters hide every row show `EmptyState` with the `Search` icon, "No <records> match the current filters", a sentence naming the search and column filters, and a "Clear filters" secondary button — distinct from the truly-empty copy.
- **Editable tables:** pass `rowKey` so visible order and membership are frozen while only cell values change (an edited row never jumps away or disappears under the cursor); they are recomputed when search, a rule, the sort or the set of rows changes. Bulk actions that target "shown" rows act on the toolkit's filtered rows.
- **Inside a Dialog:** the dropdown is portalled to `<body>` above the dialog (z-110 > z-100). It handles Escape and Tab itself in a capture-phase document listener (Tab cycles inside the dropdown; Escape closes only the dropdown), and stops React synthetic `keydown`, `click`, `mousedown` and `submit` from bubbling through the portal to the table (selection shortcuts such as Delete / Ctrl+A) or to an enclosing dialog form (Enter would otherwise submit it).
- **Server-side search:** omit `searchText`; the hook then only holds `search` for the caller to send to the API.
- **Paging interplay:** pagination runs on the filtered + sorted rows; the page resets to 1 whenever search, rules or sort change. "Showing X - Y of Z" counts filtered rows.
- **Column definition drives the body too:** each column carries `cell(row)` (falls back to the plain value) and optional `cellClassName`; render headers with `TableHeaderCells` and each row with `TableCells`, so reordering and hiding apply to header and body alike. Every reorderable `th`/`td` carries `data-column-order-id`. Columns whose cells need component state (mutations for switches, the signed-in user, editor inputs) attach their `cell` inside the component; value-only columns stay module-level.
- **Fixed columns:** selection checkbox first (`.cell-select`), then the user-ordered columns, then `th/td[data-column-fixed="actions"]` (sticky `right: 40px`, z-2, 1px left hairline as `box-shadow`) and last `th/td[data-column-fixed="visibility"]` (sticky `right: 0`, 40px, z-3; header cells z-5/6 on `--bg-elevated`). Sticky body cells are opaque `--bg-surface`; row hover and selection tints are painted on them with an inset `box-shadow` overlay. Fixed columns never move or hide.
- **Column reorder:**
  - Pointer drag on a header (mouse/pen only; touch keeps native scrolling): `cursor: grab`, starts after 5px horizontal movement, dragged header `opacity: .45`, drop target shows a 2px `--accent` inset bar on its left (`.is-drop-before`) or right (`.is-drop-after`) edge depending on which half the pointer is over. Move/up are tracked on `window` (no pointer capture, so a plain click still reaches the sort button); the click that ends a drag is swallowed; Escape cancels.
  - Keyboard: Alt+ArrowLeft / Alt+ArrowRight on a header's sort button moves that column one visible position (`aria-keyshortcuts`); focus stays on it.
  - Columns menu rows have move earlier / later buttons (chevrons, 24px; 44px on mobile).
- **Column visibility** (`.column-dropdown`, opened by the 20px `Columns3` toggle in the visibility header cell; accent + count badge while columns are hidden): same chrome as the filter dropdown but 220px; header "Columns" + close; every column in display order — 14px checkbox (`accent-color: --accent`), 11px `--text-secondary` label, hover `--bg-elevated`, move earlier / later buttons; footer "Reset columns" (secondary, disabled while order and visibility are default) restores definition order and shows all. The last visible column cannot be hidden.
- **Persistence (`storageKey`):** each table passes a unique key; search, sort, column filters, column order and hidden columns are stored as JSON `{ v: 1, search, sort, filters, order, hidden }` under `localStorage["xmltv-table:<key>"]` on every change and restored on the next visit. Restoring drops unknown columns, invalid operators and incomplete rules, appends columns added since, and never restores an all-hidden state; storage errors (private mode, quota) are ignored. Page size stays in its own per-table key (Pagination). Keys in use: `dashboard-sources`, `sources`, `channels`, `multicast-outputs`, `multicast-stations`, `users`, `roles`, `radius-servers`, `programme-credits`, `programme-titles`.
- **Mobile (<640px):** filter toggle 32px, dropdown inputs and remove/close buttons 44px, rule grid `1fr | 1fr | 44px`, chip remove buttons 32px, Clear all 44px tall.
- **No inline `style=`:** the dropdown position is written as `--dropdown-top` / `--dropdown-left` custom properties on the node.

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
