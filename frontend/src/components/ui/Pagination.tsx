import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const PAGE_SIZES = [10, 15, 20, 25, 50, 100]
export const DEFAULT_PAGE_SIZE = 20

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  itemLabel: string
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
}

/** Table footer: "Showing X - Y of Z", page size, Previous / Next. */
export function Pagination({ page, pageSize, total, itemLabel, onPageChange, onPageSizeChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="table-footer">
      <span className="font-mono" aria-live="polite">
        Showing {first.toLocaleString()} - {last.toLocaleString()} of {total.toLocaleString()} {itemLabel}
      </span>
      <div className="table-footer-controls">
        {onPageSizeChange && (
          <label className="field-inline">
            Rows per page
            <select className="input" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
          Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/**
 * Client-side paging for a table: remembered page size per table, page reset
 * when the row set's identity (`resetKey`) or the page size changes, and the
 * current page clamped to the available pages.
 */
export function usePagedRows<T>(rows: readonly T[], storageKey: string, resetKey: unknown = null, fallback = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(() => readStoredPageSize(storageKey, fallback))

  useEffect(() => setPage(1), [resetKey, pageSize])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const setPageSize = (size: number) => {
    setPageSizeState(size)
    storePageSize(storageKey, size)
  }

  return {
    visible,
    paginationProps: {
      page: currentPage,
      pageSize,
      total: rows.length,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    },
  }
}

export function readStoredPageSize(key: string, fallback = DEFAULT_PAGE_SIZE) {
  try {
    const value = Number(localStorage.getItem(key))
    return PAGE_SIZES.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function storePageSize(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Storage can be unavailable (private mode); the in-memory value still applies.
  }
}
