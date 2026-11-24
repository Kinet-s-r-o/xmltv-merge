import { ChevronLeft, ChevronRight } from 'lucide-react'

export const PAGE_SIZES = [10, 15, 20, 50, 100, 200, 500, 1000]

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

export function readStoredPageSize(key: string, fallback = 20) {
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
