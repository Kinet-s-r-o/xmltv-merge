import type { ReactNode } from 'react'
import { FileUp } from 'lucide-react'
import type { ConfigImportAction } from '../../api/client'
import type { ConfigImportState } from '../../lib/configTransfer'
import { Dialog } from './Dialog'
import { Pagination, usePagedRows } from './Pagination'
import { LoadingState } from './ResourceState'

export const IMPORT_ACTION_BADGE: Record<ConfigImportAction, string> = {
  create: 'badge badge-success',
  update: 'badge badge-warning',
  unchanged: 'badge',
}

export const IMPORT_ACTION_LABEL: Record<ConfigImportAction, string> = {
  create: 'New',
  update: 'Update',
  unchanged: 'Unchanged – skipped',
}

interface PlanShape<I> {
  items: I[]
  summary: { create: number; update: number; unchanged: number }
}

interface ImportPreviewDialogProps<I, P extends PlanShape<I>> {
  state: ConfigImportState<P>
  /** Dialog title, e.g. "Import source configuration". */
  title: string
  /** Singular / plural noun for rows, e.g. ["source", "sources"]. */
  noun: [string, string]
  /** What matching means and what is never touched (shown under the title). */
  matchingNote: ReactNode
  /** Explanation of what an update does, shown above the table. */
  updateNote: ReactNode
  /** Expected root element hint for invalid files, e.g. `<xmltv-sources version="1">`. */
  formatHint: string
  /** Extra summary content (badges) appended after new / updated / unchanged. */
  extraSummary?: (plan: P) => ReactNode
  /** Notice shown between the summary and the table (e.g. missing channels). */
  planNotice?: (plan: P) => ReactNode
  columns: string[]
  rowKey: (item: I) => string
  renderRow: (item: I) => ReactNode
  pageSizeKey: string
  applying: boolean
  applyError: string | null
  onClose: () => void
  onConfirm: () => void
}

/**
 * Preview/confirm dialog for configuration imports. The server validates the
 * file and returns a plan; nothing is written until the user confirms.
 */
export function ImportPreviewDialog<I, P extends PlanShape<I>>({
  state, title, noun, matchingNote, updateNote, formatHint, extraSummary, planNotice,
  columns, rowKey, renderRow, pageSizeKey, applying, applyError, onClose, onConfirm,
}: ImportPreviewDialogProps<I, P>) {
  const plan = state.status === 'ready' ? state.plan : null
  const items = plan?.items ?? []
  const { visible, paginationProps } = usePagedRows(items, pageSizeKey, state.status === 'ready' ? state.fileName : null)
  const writes = plan ? plan.summary.create + plan.summary.update : 0
  const fileName = state.status === 'closed' ? '' : state.fileName

  return (
    <Dialog
      open={state.status !== 'closed'}
      size="large"
      busy={applying}
      title={<span className="inline-flex items-center gap-2"><FileUp className="h-4 w-4" aria-hidden="true" /> {title}</span>}
      description={<>File <span className="font-mono">{fileName}</span>. {matchingNote}</>}
      onClose={() => { if (!applying) onClose() }}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={applying}>
            {plan && writes === 0 ? 'Close' : 'Cancel'}
          </button>
          {plan && writes > 0 && (
            <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={applying}>
              {applying ? <span className="spinner spinner-sm" aria-hidden="true" /> : <FileUp className="h-3.5 w-3.5" aria-hidden="true" />}
              {applying ? 'Importing…' : `Import ${writes} ${writes === 1 ? noun[0] : noun[1]}`}
            </button>
          )}
        </>
      }
    >
      {state.status === 'previewing' && <LoadingState title="Validating configuration file" compact />}

      {state.status === 'invalid' && (
        <div className="inline-alert is-error" role="alert">
          <div className="flex min-w-0 flex-col gap-2">
            <strong>The file cannot be imported: {state.message}</strong>
            {state.details.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-4 font-mono">
                {state.details.map((detail) => <li key={detail} className="break-words">{detail}</li>)}
              </ul>
            )}
            <span>Fix the file and choose Import again. Expected format: <span className="font-mono">{formatHint}</span>.</span>
          </div>
        </div>
      )}

      {plan && (
        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-2 text-xs" role="status">
            <span className={IMPORT_ACTION_BADGE.create}>{plan.summary.create} new</span>
            <span className={IMPORT_ACTION_BADGE.update}>{plan.summary.update} updated</span>
            <span className={IMPORT_ACTION_BADGE.unchanged}>{plan.summary.unchanged} unchanged – skipped</span>
            {extraSummary?.(plan)}
          </p>
          <p className="text-xs text-muted">{updateNote}</p>
          {planNotice?.(plan)}
          {writes === 0 && (
            <p className="inline-alert" role="status">Every {noun[0]} in the file already matches the current configuration. There is nothing to import.</p>
          )}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
              </thead>
              <tbody>
                {visible.map((item) => <tr key={rowKey(item)}>{renderRow(item)}</tr>)}
              </tbody>
            </table>
          </div>
          {items.length > 0 && <Pagination {...paginationProps} itemLabel={noun[1]} />}
          {applyError && <p className="inline-alert is-error" role="alert">Nothing was imported: {applyError}</p>}
        </div>
      )}
    </Dialog>
  )
}
