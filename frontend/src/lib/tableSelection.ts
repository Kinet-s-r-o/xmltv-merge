import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

export type PageSelectionState = 'none' | 'some' | 'all'

/**
 * Row selection for a paged data table (Kinet table contract): row checkboxes,
 * header select-all for the current page, Shift+click range select within the
 * page, Ctrl/Cmd+A selects the page and Delete triggers the bulk-delete action
 * while focus is inside the table.
 *
 * `rows` is the full filtered row set; selection outside it (filtered out or
 * deleted) is ignored, so bulk actions only ever touch rows the user can find.
 */
export function useTableSelection<T>(rows: readonly T[], pageRows: readonly T[], getId: (row: T) => number) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set())
  const anchorRef = useRef<number | null>(null)

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(getId(row))), [rows, selected, getId])
  const selectedIds = useMemo(() => new Set(selectedRows.map(getId)), [selectedRows, getId])
  const pageIds = pageRows.map(getId)
  const pageSelectedCount = pageIds.filter((id) => selectedIds.has(id)).length
  const pageState: PageSelectionState = pageSelectedCount === 0 ? 'none' : pageSelectedCount === pageIds.length ? 'all' : 'some'

  const update = (change: (next: Set<number>) => void) => setSelected((current) => {
    const next = new Set(current)
    change(next)
    return next
  })

  const toggleRow = (id: number, range = false) => {
    const anchor = anchorRef.current
    const anchorIndex = anchor === null ? -1 : pageIds.indexOf(anchor)
    const index = pageIds.indexOf(id)
    if (range && anchorIndex !== -1 && index !== -1) {
      const select = !selectedIds.has(id)
      const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex]
      update((next) => pageIds.slice(from, to + 1).forEach((rangeId) => (select ? next.add(rangeId) : next.delete(rangeId))))
    } else {
      update((next) => (next.has(id) ? next.delete(id) : next.add(id)))
    }
    anchorRef.current = id
  }

  const selectPage = () => update((next) => pageIds.forEach((id) => next.add(id)))
  const togglePage = () => {
    if (pageState === 'all') update((next) => pageIds.forEach((id) => next.delete(id)))
    else selectPage()
  }
  const selectAll = () => setSelected(new Set(rows.map(getId)))
  const clear = () => {
    anchorRef.current = null
    setSelected(new Set())
  }

  /** Attach to the table: Ctrl/Cmd+A selects the page, Delete runs `onDelete` when rows are selected. */
  const tableKeyDown = (onDelete?: () => void) => (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (target.matches('input:not([type="checkbox"]), textarea, select')) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      selectPage()
    } else if (event.key === 'Delete' && onDelete && selectedIds.size > 0) {
      event.preventDefault()
      onDelete()
    }
  }

  return {
    selectedIds,
    selectedRows,
    count: selectedRows.length,
    isSelected: (id: number) => selectedIds.has(id),
    pageState,
    toggleRow,
    togglePage,
    selectAll,
    clear,
    tableKeyDown,
  }
}
