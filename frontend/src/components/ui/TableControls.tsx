import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Plus, Search, Trash2, X } from 'lucide-react'

/*
 * Kinet table toolkit: column sorting (`aria-sort` header buttons), column
 * filters (portal `.filter-dropdown` with operator + value rule rows, Apply /
 * Clear), a filter summary of removable chips and a full-text search, all
 * applied client-side to an in-memory row set.
 */

export type ColumnKind = 'text' | 'number' | 'enum' | 'date'
type CellValue = string | number | null | undefined

export interface TableColumn<T> {
  id: string
  label: string
  kind: ColumnKind
  value: (row: T) => CellValue
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
}

export function useTableControls<T>(rows: readonly T[], columns: TableColumn<T>[], { searchText, initialSort = null, rowKey }: TableControlsOptions<T>) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState | null>(initialSort)
  const [filters, setFilters] = useState<Record<string, FilterRule[]>>({})
  const frozenOrder = useRef<{ signature: string; keys: (string | number)[] } | null>(null)

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

  const filterCount = Object.values(filters).reduce((sum, rules) => sum + rules.length, 0)
  const isFiltered = filterCount > 0 || search.trim() !== ''

  return {
    rows: visibleRows,
    columns,
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
    /** Changes whenever the visible row set is re-filtered or re-sorted (page reset key). */
    resetKey: JSON.stringify([search.trim(), filters, sort]),
  }
}

export type TableControls<T> = ReturnType<typeof useTableControls<T>>

/** `<th>` with a sort button (`aria-sort`) and a column filter toggle. */
export function ColumnHeader<T>({ column, controls }: { column: TableColumn<T>; controls: TableControls<T> }) {
  const sortable = column.sortable !== false
  const filterable = column.filterable !== false
  const direction = controls.sort?.id === column.id ? controls.sort.direction : null
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : sortable ? 'none' : undefined
  const SortIcon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown
  const nextLabel = direction === 'asc' ? 'descending' : direction === 'desc' ? 'unsorted' : 'ascending'

  return (
    <th scope="col" aria-sort={ariaSort} className={column.align === 'right' ? 'text-right' : undefined}>
      <span className="th-inner">
        {sortable ? (
          <button
            type="button"
            className="sort-btn"
            data-sorted={direction ?? undefined}
            onClick={() => controls.toggleSort(column.id)}
            aria-label={`${column.label}: sort ${nextLabel}`}
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
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FilterRule[]>([])
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const active = rules.length > 0

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) toggleRef.current?.focus()
  }, [])

  const place = useCallback(() => {
    const anchor = toggleRef.current?.getBoundingClientRect()
    if (!anchor) return
    const width = Math.min(320, window.innerWidth - 16)
    const left = Math.min(Math.max(8, anchor.right - width), window.innerWidth - width - 8)
    setPosition({ top: anchor.bottom + 6, left })
  }, [])

  const openDropdown = () => {
    setDraft(rules.length > 0 ? rules.map((rule) => ({ ...rule })) : [defaultRule(column as TableColumn<unknown>)])
    place()
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('select, input')?.focus()
  }, [open])

  // Fixed-position portal: coordinates come from the toggle, set on the node (no inline style attribute).
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
      {open && position && createPortal(
        <div
          ref={panelRef}
          className="filter-dropdown"
          role="dialog"
          aria-labelledby={titleId}
          // React bubbles portal events through the component tree: keep keys (Delete, Ctrl+A, Enter)
          // and clicks from reaching the table's selection shortcuts or an enclosing dialog form.
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
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
        </div>,
        document.body,
      )}
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
      {controls.columns.flatMap((column) =>
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
