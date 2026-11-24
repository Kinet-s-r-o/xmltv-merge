/*
 * React reference implementation (from the XMLTV EPG app; the other examples
 * here are SolidJS). Port the hook to signals/memos for SolidJS apps and keep
 * the class names, operators, storage format, ARIA and keyboard behaviour
 * identical. Styles: examples/base.css "Column sorting, column filters ...".
 * Contract: references/components.md §6.1.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, Columns3, Filter, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'

/*
 * Kinet table toolkit, applied client-side to an in-memory row set:
 * - full-text search (`TableSearch`)
 * - column sorting (`aria-sort` header buttons)
 * - column filters (portal `.filter-dropdown`, operator + value rule rows)
 * - filter summary chips (`TableFilterSummary`)
 * - column reordering (pointer drag on headers, Alt+Arrow and the Columns menu)
 * - column visibility (portal `.column-dropdown` in the trailing fixed column)
 * - per-table persistence of all of the above in localStorage (`storageKey`)
 */

export type ColumnKind = 'text' | 'number' | 'enum' | 'date'
type CellValue = string | number | null | undefined

export interface TableColumn<T> {
  id: string
  label: string
  kind: ColumnKind
  value: (row: T) => CellValue
  /** Cell content; defaults to the plain value. */
  cell?: (row: T) => ReactNode
  /** Extra class on every body cell of this column (e.g. `min-w-[260px]`). */
  cellClassName?: string
  /** Enum columns: allowed values in their natural (sort) order. */
  options?: { value: string; label: string }[]
  align?: 'left' | 'right'
  /** Clarifies what the filter compares, e.g. "refresh interval in minutes". */
  filterHint?: string
  sortable?: boolean
  filterable?: boolean
}

export type FilterOp =
  | 'contains' | 'not_contains' | 'equals' | 'starts_with'
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is' | 'is_not'
  | 'on_or_after' | 'before'
  | 'empty' | 'not_empty'

export interface FilterRule { op: FilterOp; value: string }
export type SortDirection = 'asc' | 'desc'
export interface SortState { id: string; direction: SortDirection }

const OPERATORS: Record<ColumnKind, { op: FilterOp; label: string }[]> = {
  text: [
    { op: 'contains', label: 'Contains' },
    { op: 'not_contains', label: 'Does not contain' },
    { op: 'equals', label: 'Equals' },
    { op: 'starts_with', label: 'Starts with' },
    { op: 'empty', label: 'Is empty' },
    { op: 'not_empty', label: 'Is not empty' },
  ],
  number: [
    { op: 'eq', label: '=' },
    { op: 'ne', label: '≠' },
    { op: 'gt', label: '>' },
    { op: 'gte', label: '≥' },
    { op: 'lt', label: '<' },
    { op: 'lte', label: '≤' },
  ],
  enum: [
    { op: 'is', label: 'Is' },
    { op: 'is_not', label: 'Is not' },
  ],
  date: [
    { op: 'on_or_after', label: 'On or after' },
    { op: 'before', label: 'Before' },
    { op: 'empty', label: 'Never / empty' },
    { op: 'not_empty', label: 'Has a value' },
  ],
}

const VALUELESS: FilterOp[] = ['empty', 'not_empty']
const isEmpty = (value: CellValue) => value === null || value === undefined || value === ''

function opLabel(kind: ColumnKind, op: FilterOp) {
  return OPERATORS[kind].find((entry) => entry.op === op)?.label ?? op
}

function ruleIsComplete(rule: FilterRule) {
  return VALUELESS.includes(rule.op) || rule.value.trim() !== ''
}

function startOfLocalDay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1).getTime()
}

function matchesRule<T>(column: TableColumn<T>, row: T, rule: FilterRule): boolean {
  const value = column.value(row)
  if (rule.op === 'empty') return isEmpty(value)
  if (rule.op === 'not_empty') return !isEmpty(value)
  const needle = rule.value.trim()
  switch (column.kind) {
    case 'number': {
      if (isEmpty(value)) return false
      const actual = Number(value)
      const expected = Number(needle)
      if (Number.isNaN(expected)) return true
      return rule.op === 'eq' ? actual === expected
        : rule.op === 'ne' ? actual !== expected
        : rule.op === 'gt' ? actual > expected
        : rule.op === 'gte' ? actual >= expected
        : rule.op === 'lt' ? actual < expected
        : actual <= expected
    }
    case 'enum':
      return rule.op === 'is' ? String(value ?? '') === needle : String(value ?? '') !== needle
    case 'date': {
      if (isEmpty(value)) return false
      const actual = new Date(String(value)).getTime()
      const boundary = startOfLocalDay(needle)
      return rule.op === 'on_or_after' ? actual >= boundary : actual < boundary
    }
    default: {
      const haystack = String(value ?? '').toLocaleLowerCase()
      const term = needle.toLocaleLowerCase()
      return rule.op === 'contains' ? haystack.includes(term)
        : rule.op === 'not_contains' ? !haystack.includes(term)
        : rule.op === 'equals' ? haystack === term
        : haystack.startsWith(term)
    }
  }
}

function compareValues<T>(column: TableColumn<T>, a: CellValue, b: CellValue) {
  if (column.kind === 'enum' && column.options) {
    const order = (value: CellValue) => column.options!.findIndex((option) => option.value === value)
    return order(a) - order(b)
  }
  if (column.kind === 'number') return Number(a) - Number(b)
  if (column.kind === 'date') return new Date(String(a)).getTime() - new Date(String(b)).getTime()
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

// ---- Persistence ---------------------------------------------------------

const STORAGE_PREFIX = 'xmltv-table:'
const STORAGE_VERSION = 1

interface StoredTableState {
  v: number
  search: string
  sort: SortState | null
  filters: Record<string, FilterRule[]>
  order: string[]
  hidden: string[]
}

/** Reads a stored table state and drops anything that no longer matches the columns. */
function readStoredState<T>(storageKey: string | undefined, columns: TableColumn<T>[]): Partial<StoredTableState> {
  if (!storageKey) return {}
  let raw: unknown
  try {
    const text = window.localStorage.getItem(STORAGE_PREFIX + storageKey)
    raw = text ? JSON.parse(text) : null
  } catch {
    return {}
  }
  if (!raw || typeof raw !== 'object' || (raw as StoredTableState).v !== STORAGE_VERSION) return {}
  const stored = raw as StoredTableState
  const byId = new Map(columns.map((column) => [column.id, column]))
  const result: Partial<StoredTableState> = {}
  if (typeof stored.search === 'string') result.search = stored.search
  if (stored.sort && byId.has(stored.sort.id) && (stored.sort.direction === 'asc' || stored.sort.direction === 'desc')) {
    result.sort = { id: stored.sort.id, direction: stored.sort.direction }
  }
  if (stored.filters && typeof stored.filters === 'object') {
    const filters: Record<string, FilterRule[]> = {}
    for (const [id, rules] of Object.entries(stored.filters)) {
      const column = byId.get(id)
      if (!column || !Array.isArray(rules)) continue
      const allowed = OPERATORS[column.kind].map((entry) => entry.op)
      const valid = rules
        .filter((rule) => rule && allowed.includes(rule.op) && typeof rule.value === 'string')
        .map((rule) => ({ op: rule.op, value: rule.value }))
        .filter(ruleIsComplete)
      if (valid.length > 0) filters[id] = valid
    }
    result.filters = filters
  }
  if (Array.isArray(stored.order)) result.order = stored.order.filter((id) => typeof id === 'string' && byId.has(id))
  if (Array.isArray(stored.hidden)) {
    const hidden = stored.hidden.filter((id) => typeof id === 'string' && byId.has(id))
    // Never restore a state with every column hidden.
    if (hidden.length < columns.length) result.hidden = hidden
  }
  return result
}

function writeStoredState(storageKey: string, state: StoredTableState) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(state))
  } catch {
    // Storage full or blocked (private mode): the table still works, it just is not remembered.
  }
}

/** Column ids in display order: stored order first, columns added since then after them. */
function orderColumns<T>(columns: TableColumn<T>[], order: string[]) {
  const byId = new Map(columns.map((column) => [column.id, column]))
  const ordered = order.map((id) => byId.get(id)).filter((column): column is TableColumn<T> => column !== undefined)
  const seen = new Set(ordered.map((column) => column.id))
  return [...ordered, ...columns.filter((column) => !seen.has(column.id))]
}

// ---- Hook ------------------------------------------------------------------

interface TableControlsOptions<T> {
  /**
   * Text the full-text search matches against (case-insensitive). Omit when
   * the search runs on the server: `search` is then only held, not applied.
   */
  searchText?: (row: T) => string
  initialSort?: SortState | null
  /**
   * Editable tables: stable row identity. While only cell values change, the
   * visible order and membership stay frozen so an edited row does not jump
   * away (or vanish) under the cursor; they are recomputed when the search,
   * a filter, the sort or the set of rows changes.
   */
  rowKey?: (row: T) => string | number
  /**
   * Remembers search, filters, sort, column order and hidden columns in
   * localStorage under this key (one key per table) and restores them on the
   * next visit.
   */
  storageKey?: string
}

export type DropSide = 'before' | 'after'
interface ColumnDrag { id: string; overId: string | null; side: DropSide }

export function useTableControls<T>(
  rows: readonly T[],
  columns: TableColumn<T>[],
  { searchText, initialSort = null, rowKey, storageKey }: TableControlsOptions<T>,
) {
  const [stored] = useState(() => readStoredState(storageKey, columns))
  const [search, setSearch] = useState(stored.search ?? '')
  const [sort, setSort] = useState<SortState | null>(stored.sort !== undefined ? stored.sort : initialSort)
  const [filters, setFilters] = useState<Record<string, FilterRule[]>>(stored.filters ?? {})
  const [order, setOrder] = useState<string[]>(stored.order ?? [])
  const [hidden, setHidden] = useState<string[]>(stored.hidden ?? [])
  const [drag, setDrag] = useState<ColumnDrag | null>(null)
  const frozenOrder = useRef<{ signature: string; keys: (string | number)[] } | null>(null)

  useEffect(() => {
    if (!storageKey) return
    writeStoredState(storageKey, { v: STORAGE_VERSION, search, sort, filters, order, hidden })
  }, [storageKey, search, sort, filters, order, hidden])

  const orderedColumns = useMemo(() => orderColumns(columns, order), [columns, order])
  const visibleColumns = useMemo(() => {
    const visible = orderedColumns.filter((column) => !hidden.includes(column.id))
    return visible.length > 0 ? visible : orderedColumns.slice(0, 1)
  }, [orderedColumns, hidden])

  const computedRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    const active = columns
      .map((column) => ({ column, rules: (filters[column.id] ?? []).filter(ruleIsComplete) }))
      .filter((entry) => entry.rules.length > 0)
    const result = rows.filter((row) => {
      if (term && searchText && !searchText(row).toLocaleLowerCase().includes(term)) return false
      return active.every(({ column, rules }) => rules.every((rule) => matchesRule(column, row, rule)))
    })
    const sortColumn = sort && columns.find((column) => column.id === sort.id)
    if (!sortColumn) return result
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...result].sort((left, right) => {
      const a = sortColumn.value(left)
      const b = sortColumn.value(right)
      // Rows without a value always go last, whatever the direction.
      if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1
      return compareValues(sortColumn, a, b) * factor
    })
  }, [rows, columns, filters, search, searchText, sort])

  let visibleRows = computedRows
  if (rowKey) {
    const signature = JSON.stringify([search.trim(), filters, sort, rows.map(rowKey)])
    const frozen = frozenOrder.current
    if (frozen && frozen.signature === signature) {
      const byKey = new Map(rows.map((row) => [rowKey(row), row]))
      visibleRows = frozen.keys.map((key) => byKey.get(key)).filter((row): row is T => row !== undefined)
    } else {
      frozenOrder.current = { signature, keys: computedRows.map(rowKey) }
    }
  }

  const toggleSort = useCallback((id: string) => {
    setSort((current) => {
      if (!current || current.id !== id) return { id, direction: 'asc' }
      if (current.direction === 'asc') return { id, direction: 'desc' }
      return null
    })
  }, [])

  const setColumnFilter = useCallback((id: string, rules: FilterRule[]) => {
    setFilters((current) => {
      const next = { ...current }
      const complete = rules.filter(ruleIsComplete)
      if (complete.length > 0) next[id] = complete
      else delete next[id]
      return next
    })
  }, [])

  const removeRule = useCallback((id: string, index: number) => {
    setFilters((current) => {
      const rules = (current[id] ?? []).filter((_, ruleIndex) => ruleIndex !== index)
      const next = { ...current }
      if (rules.length > 0) next[id] = rules
      else delete next[id]
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setFilters({})
    setSearch('')
  }, [])

  const currentIds = orderedColumns.map((column) => column.id)

  /** Moves `id` next to `targetId` (before or after it). */
  const moveColumn = (id: string, targetId: string, side: DropSide) => {
    if (id === targetId) return
    const ids = currentIds.filter((entry) => entry !== id)
    const index = ids.indexOf(targetId)
    if (index < 0) return
    ids.splice(side === 'before' ? index : index + 1, 0, id)
    setOrder(ids)
  }

  /** Moves `id` one visible position left (-1) or right (+1). */
  const moveColumnBy = (id: string, delta: -1 | 1) => {
    const visibleIds = visibleColumns.map((column) => column.id)
    const index = visibleIds.indexOf(id)
    const target = visibleIds[index + delta]
    if (index < 0 || !target) return
    moveColumn(id, target, delta < 0 ? 'before' : 'after')
  }

  const toggleColumn = (id: string) => {
    setHidden((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id)
      // Keep at least one column visible.
      if (columns.length - current.length <= 1) return current
      return [...current, id]
    })
  }

  const resetColumns = () => {
    setOrder([])
    setHidden([])
  }

  const filterCount = Object.values(filters).reduce((sum, rules) => sum + rules.length, 0)
  const isFiltered = filterCount > 0 || search.trim() !== ''
  const columnsCustomized = hidden.length > 0 || currentIds.some((id, index) => columns[index]?.id !== id)

  return {
    rows: visibleRows,
    columns,
    orderedColumns,
    visibleColumns,
    hidden,
    search,
    setSearch,
    sort,
    toggleSort,
    filters,
    setColumnFilter,
    removeRule,
    clearAll,
    filterCount,
    isFiltered,
    moveColumn,
    moveColumnBy,
    toggleColumn,
    resetColumns,
    columnsCustomized,
    drag,
    setDrag,
    /** Changes whenever the visible row set is re-filtered or re-sorted (page reset key). */
    resetKey: JSON.stringify([search.trim(), filters, sort]),
  }
}

export type TableControls<T> = ReturnType<typeof useTableControls<T>>

// ---- Shared portal dropdown -----------------------------------------------

/**
 * Fixed-position dropdown portalled to <body> (z-110, above dialogs): aligned
 * to the toggle's right edge, clamped to the viewport, repositioned on
 * scroll/resize. Escape closes and returns focus to the toggle, Tab cycles
 * inside, a pointer-down outside closes. Works inside a Dialog focus trap.
 */
function usePortalDropdown(width: number, onOpen?: () => void) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) toggleRef.current?.focus()
  }, [])

  const place = useCallback(() => {
    const anchor = toggleRef.current?.getBoundingClientRect()
    if (!anchor) return
    const actual = Math.min(width, window.innerWidth - 16)
    const left = Math.min(Math.max(8, anchor.right - actual), window.innerWidth - actual - 8)
    setPosition({ top: anchor.bottom + 6, left })
  }, [width])

  const openDropdown = () => {
    onOpen?.()
    place()
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('select, input, button:not(.filter-dropdown-close)')?.focus()
  }, [open])

  // Coordinates are written as custom properties on the node (no inline style attribute).
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel || !position) return
    panel.style.setProperty('--dropdown-top', `${position.top}px`)
    panel.style.setProperty('--dropdown-left', `${position.left}px`)
  }, [open, position])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || toggleRef.current?.contains(target)) return
      close(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        return
      }
      // Keep Tab inside the dropdown (also stops an enclosing Dialog's focus trap from pulling focus out).
      const panel = panelRef.current
      if (event.key !== 'Tab' || !panel || !panel.contains(document.activeElement)) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'))
      if (focusable.length === 0) return
      event.stopPropagation()
      const index = focusable.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index === focusable.length - 1 ? 0 : index + 1)
      event.preventDefault()
      focusable[next].focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, close, place])

  const portal = (className: string, labelledBy: string, children: ReactNode) =>
    open && position
      ? createPortal(
        <div
          ref={panelRef}
          className={className}
          role="dialog"
          aria-labelledby={labelledBy}
          // React bubbles portal events through the component tree: keep keys (Delete, Ctrl+A, Enter),
          // clicks and drags from reaching table shortcuts, header drag handlers or an enclosing dialog form.
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {children}
        </div>,
        document.body,
      )
      : null

  return { open, openDropdown, close, toggleRef, portal }
}

// ---- Header and body cells --------------------------------------------------

/**
 * `<th>` with a sort button (`aria-sort`), a column filter toggle and pointer
 * drag to reorder (mouse/pen; Alt+ArrowLeft/Right on the sort button moves
 * the column with the keyboard).
 */
export function ColumnHeader<T>({ column, controls }: { column: TableColumn<T>; controls: TableControls<T> }) {
  const sortable = column.sortable !== false
  const filterable = column.filterable !== false
  const direction = controls.sort?.id === column.id ? controls.sort.direction : null
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : sortable ? 'none' : undefined
  const SortIcon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown
  const nextLabel = direction === 'asc' ? 'descending' : direction === 'desc' ? 'unsorted' : 'ascending'
  const suppressClick = useRef(false)
  const { drag, setDrag, moveColumn, moveColumnBy } = controls

  /*
   * Pointer drag (mouse/pen). Move/up are tracked on window so a fast drag
   * that leaves the header still lands; no pointer capture, so a plain click
   * still reaches the sort button. The drop target is kept locally because
   * pointerup can arrive before React re-renders.
   */
  const onPointerDown = (event: ReactPointerEvent<HTMLTableCellElement>) => {
    // Touch keeps native scrolling; reorder there through the Columns menu.
    if (event.button !== 0 || event.pointerType === 'touch') return
    if ((event.target as HTMLElement).closest('.filter-toggle')) return
    const row = event.currentTarget.parentElement
    const pointerId = event.pointerId
    const startX = event.clientX
    let active = false
    let overId: string | null = null
    let side: DropSide = 'before'

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return
      if (!active) {
        if (Math.abs(move.clientX - startX) < 5) return
        active = true
      }
      move.preventDefault()
      const headers = Array.from(row?.querySelectorAll<HTMLElement>('th[data-column-order-id]') ?? [])
      const over = headers.find((header) => {
        const rect = header.getBoundingClientRect()
        return move.clientX >= rect.left && move.clientX <= rect.right
      })
      overId = over?.dataset.columnOrderId ?? null
      if (over) {
        const rect = over.getBoundingClientRect()
        side = move.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
      }
      setDrag({ id: column.id, overId, side })
    }
    const finish = (commit: boolean) => (end: PointerEvent) => {
      if (end.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      if (!active) return
      // Swallow the click that follows the drag (only if it lands right away).
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
      if (commit && overId) moveColumn(column.id, overId, side)
      setDrag(null)
    }
    const onUp = finish(true)
    const onCancel = finish(false)
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== 'Escape' || !active) return
      key.stopPropagation()
      active = false
      overId = null
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
  }

  const onSortKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    event.preventDefault()
    moveColumnBy(column.id, event.key === 'ArrowLeft' ? -1 : 1)
    // Keep focus on this header after it moves.
    const target = event.currentTarget
    requestAnimationFrame(() => target.focus())
  }

  const dragging = drag?.id === column.id
  const dropSide = drag && drag.overId === column.id && drag.id !== column.id ? drag.side : undefined
  const classes = [
    column.align === 'right' ? 'text-right' : '',
    'is-reorderable',
    dragging ? 'is-dragging' : '',
    dropSide ? `is-drop-${dropSide}` : '',
  ].filter(Boolean).join(' ')

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={classes}
      data-column-order-id={column.id}
      onPointerDown={onPointerDown}
      onClickCapture={(event) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
      title="Drag to reorder columns"
    >
      <span className="th-inner">
        {sortable ? (
          <button
            type="button"
            className="sort-btn"
            data-sorted={direction ?? undefined}
            onClick={() => controls.toggleSort(column.id)}
            onKeyDown={onSortKeyDown}
            aria-label={`${column.label}: sort ${nextLabel}`}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          >
            {column.label}
            <SortIcon className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : column.label}
        {filterable && (
          <ColumnFilter
            column={column}
            rules={controls.filters[column.id] ?? []}
            onApply={(rules) => controls.setColumnFilter(column.id, rules)}
          />
        )}
      </span>
    </th>
  )
}

/** Header cells of every visible column, in the user's order. */
export function TableHeaderCells<T>({ controls }: { controls: TableControls<T> }) {
  return <>{controls.visibleColumns.map((column) => <ColumnHeader key={column.id} column={column} controls={controls} />)}</>
}

/** Body cells of every visible column for one row, in the user's order. */
export function TableCells<T>({ controls, row }: { controls: TableControls<T>; row: T }) {
  return (
    <>
      {controls.visibleColumns.map((column) => {
        const className = [column.align === 'right' ? 'text-right' : '', column.cellClassName ?? ''].filter(Boolean).join(' ')
        return (
          <td key={column.id} className={className || undefined} data-column-order-id={column.id}>
            {column.cell ? column.cell(row) : <span className="table-text">{String(column.value(row) ?? '')}</span>}
          </td>
        )
      })}
    </>
  )
}

/** Number of `<td>`s a full-width message row needs: visible columns plus fixed ones. */
export function tableColumnSpan<T>(controls: TableControls<T>, fixedColumns: number) {
  return controls.visibleColumns.length + fixedColumns
}

/** Trailing fixed header cell holding the column visibility / order menu. */
export function ColumnVisibilityHeader<T>({ controls }: { controls: TableControls<T> }) {
  return (
    <th scope="col" data-column-fixed="visibility">
      <ColumnMenu controls={controls} />
    </th>
  )
}

/** Matching empty body cell for the trailing visibility column. */
export function ColumnVisibilityCell() {
  return <td data-column-fixed="visibility" aria-hidden="true" />
}

function ColumnMenu<T>({ controls }: { controls: TableControls<T> }) {
  const titleId = useId()
  const { open, openDropdown, close, toggleRef, portal } = usePortalDropdown(220)
  const hiddenCount = controls.hidden.length
  const visibleCount = controls.visibleColumns.length

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className={`filter-toggle${hiddenCount > 0 ? ' is-active' : ''}`}
        onClick={() => (open ? close() : openDropdown())}
        aria-label={hiddenCount > 0 ? `Show, hide and reorder columns (${hiddenCount} hidden)` : 'Show, hide and reorder columns'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Columns"
      >
        <Columns3 className="h-3 w-3" aria-hidden="true" />
        {hiddenCount > 0 && <span className="filter-toggle-badge" aria-hidden="true">{hiddenCount}</span>}
      </button>
      {portal('column-dropdown', titleId, (
        <>
          <div className="filter-dropdown-header">
            <h3 id={titleId}>Columns</h3>
            <button type="button" className="filter-dropdown-close" onClick={() => close()} aria-label="Close columns menu">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <ul className="column-dropdown-list" aria-label="Columns in display order">
            {controls.orderedColumns.map((column, index) => {
              const shown = !controls.hidden.includes(column.id)
              const lastVisible = shown && visibleCount <= 1
              return (
                <li key={column.id} className="column-dropdown-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={shown}
                      disabled={lastVisible}
                      onChange={() => controls.toggleColumn(column.id)}
                      title={lastVisible ? 'At least one column stays visible' : undefined}
                    />
                    <span>{column.label}</span>
                  </label>
                  <button
                    type="button"
                    className="column-move"
                    onClick={() => {
                      const prev = controls.orderedColumns[index - 1]
                      if (prev) controls.moveColumn(column.id, prev.id, 'before')
                    }}
                    disabled={index === 0}
                    aria-label={`Move ${column.label} earlier (left)`}
                  >
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="column-move"
                    onClick={() => {
                      const next = controls.orderedColumns[index + 1]
                      if (next) controls.moveColumn(column.id, next.id, 'after')
                    }}
                    disabled={index === controls.orderedColumns.length - 1}
                    aria-label={`Move ${column.label} later (right)`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="filter-dropdown-footer">
            <button
              type="button"
              className="btn btn-secondary filter-btn-clear"
              onClick={controls.resetColumns}
              disabled={!controls.columnsCustomized}
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset columns
            </button>
          </div>
        </>
      ))}
    </>
  )
}

function defaultRule(column: TableColumn<unknown>): FilterRule {
  const op = OPERATORS[column.kind][0].op
  return { op, value: column.kind === 'enum' ? column.options?.[0]?.value ?? '' : '' }
}

interface ColumnFilterProps<T> {
  column: TableColumn<T>
  rules: FilterRule[]
  onApply: (rules: FilterRule[]) => void
}

/** Filter toggle (20px, accent + count badge when active) and its portal dropdown. */
export function ColumnFilter<T>({ column, rules, onApply }: ColumnFilterProps<T>) {
  const [draft, setDraft] = useState<FilterRule[]>([])
  const titleId = useId()
  const active = rules.length > 0
  const { open, openDropdown, close, toggleRef, portal } = usePortalDropdown(320, () =>
    setDraft(rules.length > 0 ? rules.map((rule) => ({ ...rule })) : [defaultRule(column as TableColumn<unknown>)]))

  const updateRule = (index: number, patch: Partial<FilterRule>) =>
    setDraft((current) => current.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)))

  const apply = () => {
    onApply(draft)
    close()
  }
  const clear = () => {
    onApply([])
    close()
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className={`filter-toggle${active ? ' is-active' : ''}`}
        onClick={() => (open ? close() : openDropdown())}
        aria-label={active ? `Filter ${column.label} (${rules.length} active)` : `Filter ${column.label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Filter className="h-3 w-3" aria-hidden="true" />
        {active && <span className="filter-toggle-badge" aria-hidden="true">{rules.length}</span>}
      </button>
      {portal('filter-dropdown', titleId, (
        <form onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); apply() }}>
          <div className="filter-dropdown-header">
            <h3 id={titleId}>Filter {column.label}</h3>
            <button type="button" className="filter-dropdown-close" onClick={() => close()} aria-label="Close filter">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="filter-dropdown-body">
            <span className="filter-dropdown-label">
              Show rows where {column.label}{column.filterHint ? ` (${column.filterHint})` : ''} matches all rules
            </span>
            {draft.map((rule, index) => (
              <div className="filter-rule" key={index}>
                <select
                  className="input"
                  value={rule.op}
                  onChange={(event) => updateRule(index, { op: event.target.value as FilterOp })}
                  aria-label={`Rule ${index + 1} condition`}
                >
                  {OPERATORS[column.kind].map((entry) => <option key={entry.op} value={entry.op}>{entry.label}</option>)}
                </select>
                {VALUELESS.includes(rule.op) ? (
                  <span className="filter-rule-novalue">No value needed</span>
                ) : column.kind === 'enum' ? (
                  <select
                    className="input"
                    value={rule.value}
                    onChange={(event) => updateRule(index, { value: event.target.value })}
                    aria-label={`Rule ${index + 1} value`}
                  >
                    {(column.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <input
                    className={`input${column.kind === 'text' ? '' : ' font-mono'}`}
                    type={column.kind === 'number' ? 'number' : column.kind === 'date' ? 'date' : 'text'}
                    value={rule.value}
                    onChange={(event) => updateRule(index, { value: event.target.value })}
                    aria-label={`Rule ${index + 1} value`}
                    placeholder={column.kind === 'text' ? 'Value' : undefined}
                  />
                )}
                <button
                  type="button"
                  className="filter-rule-remove"
                  onClick={() => setDraft((current) => current.filter((_, ruleIndex) => ruleIndex !== index))}
                  aria-label={`Remove rule ${index + 1}`}
                  disabled={draft.length === 1}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button type="button" className="filter-add-rule" onClick={() => setDraft((current) => [...current, defaultRule(column as TableColumn<unknown>)])}>
              <Plus className="h-3 w-3" aria-hidden="true" /> Add rule
            </button>
          </div>
          <div className="filter-dropdown-footer">
            <button type="button" className="btn btn-secondary filter-btn-clear" onClick={clear}>Clear</button>
            <button type="submit" className="btn btn-primary filter-btn-apply">Apply</button>
          </div>
        </form>
      ))}
    </>
  )
}

interface TableSearchProps<T> {
  controls: TableControls<T>
  /** Screen-reader label naming what is searched, e.g. "Search sources by name or URL". */
  label: string
  placeholder: string
  className?: string
}

/** Full-text search for the `.table-panel-toolbar` (right-aligned). */
export function TableSearch<T>({ controls, label, placeholder, className = 'w-full sm:w-72' }: TableSearchProps<T>) {
  return (
    <label className={`search-field ${className}`}>
      <span className="sr-only">{label}</span>
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      <input
        className="input"
        type="search"
        value={controls.search}
        onChange={(event) => controls.setSearch(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

/** Removable chips for every active column rule plus the search term, with Clear all. */
export function TableFilterSummary<T>({ controls }: { controls: TableControls<T> }) {
  if (!controls.isFiltered) return null
  const term = controls.search.trim()
  return (
    <div className="table-filter-summary" aria-label="Active filters">
      <span className="table-filter-summary-label">Filters</span>
      {term && (
        <span className="table-filter-chip">
          Search <strong>“{term}”</strong>
          <button type="button" onClick={() => controls.setSearch('')} aria-label="Remove search">
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      )}
      {controls.orderedColumns.flatMap((column) =>
        (controls.filters[column.id] ?? []).map((rule, index) => {
          const value = column.kind === 'enum'
            ? column.options?.find((option) => option.value === rule.value)?.label ?? rule.value
            : rule.value
          const text = `${column.label} ${opLabel(column.kind, rule.op).toLocaleLowerCase()}`
          return (
            <span className="table-filter-chip" key={`${column.id}-${index}`}>
              {text}{!VALUELESS.includes(rule.op) && <> <strong>{value}</strong></>}
              <button type="button" onClick={() => controls.removeRule(column.id, index)} aria-label={`Remove filter: ${text} ${VALUELESS.includes(rule.op) ? '' : value}`.trim()}>
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          )
        }),
      )}
      <button type="button" className="table-filter-clear" onClick={controls.clearAll}>Clear all</button>
    </div>
  )
}
