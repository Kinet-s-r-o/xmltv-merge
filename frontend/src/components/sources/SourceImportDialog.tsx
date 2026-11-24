import { FileUp } from 'lucide-react'
import type { SourceImportAction, SourceImportPlan } from '../../api/client'
import { formatInterval } from '../../lib/sourceStatus'
import { Dialog } from '../ui/Dialog'
import { Pagination, usePagedRows } from '../ui/Pagination'
import { LoadingState } from '../ui/ResourceState'

export type SourceImportState =
  | { status: 'closed' }
  | { status: 'previewing'; fileName: string }
  | { status: 'invalid'; fileName: string; message: string; details: string[] }
  | { status: 'ready'; fileName: string; plan: SourceImportPlan }

const ACTION_LABEL: Record<SourceImportAction, string> = {
  create: 'New',
  update: 'Update',
  unchanged: 'Unchanged – skipped',
}

const ACTION_BADGE: Record<SourceImportAction, string> = {
  create: 'badge badge-success',
  update: 'badge badge-warning',
  unchanged: 'badge',
}

const CHANGE_LABEL: Record<string, string> = {
  name: 'name casing',
  url: 'URL',
  enabled: 'enabled state',
  refresh_interval: 'refresh interval',
  history_days: 'history',
}

interface SourceImportDialogProps {
  state: SourceImportState
  applying: boolean
  applyError: string | null
  onClose: () => void
  onConfirm: () => void
}

/**
 * Preview of a source configuration import. Sources are matched by name: new
 * names are created, matching sources are updated, identical ones are skipped
 * and sources missing from the file are kept. Nothing is deleted.
 */
export function SourceImportDialog({ state, applying, applyError, onClose, onConfirm }: SourceImportDialogProps) {
  const plan = state.status === 'ready' ? state.plan : null
  const items = plan?.items ?? []
  const { visible, paginationProps } = usePagedRows(items, 'xmltv-source-import-page-size', state.status === 'ready' ? state.fileName : null)
  const writes = plan ? plan.summary.create + plan.summary.update : 0
  const fileName = state.status === 'closed' ? '' : state.fileName

  return (
    <Dialog
      open={state.status !== 'closed'}
      size="large"
      busy={applying}
      title={<span className="inline-flex items-center gap-2"><FileUp className="h-4 w-4" aria-hidden="true" /> Import source configuration</span>}
      description={<>File <span className="font-mono">{fileName}</span>. Sources are matched by name; sources not listed in the file are kept, nothing is deleted.</>}
      onClose={() => { if (!applying) onClose() }}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={applying}>
            {plan && writes === 0 ? 'Close' : 'Cancel'}
          </button>
          {plan && writes > 0 && (
            <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={applying}>
              {applying ? <span className="spinner spinner-sm" aria-hidden="true" /> : <FileUp className="h-3.5 w-3.5" aria-hidden="true" />}
              {applying ? 'Importing…' : `Import ${writes} source${writes === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      }
    >
      {state.status === 'previewing' && <LoadingState title="Validating source configuration" compact />}

      {state.status === 'invalid' && (
        <div className="inline-alert is-error" role="alert">
          <div className="flex min-w-0 flex-col gap-2">
            <strong>The file cannot be imported: {state.message}</strong>
            {state.details.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-4 font-mono">
                {state.details.map((detail) => <li key={detail} className="break-words">{detail}</li>)}
              </ul>
            )}
            <span>Fix the file and choose Import again. Expected format: <span className="font-mono">&lt;xmltv-sources version="1"&gt;</span> with one <span className="font-mono">&lt;source&gt;</span> per entry.</span>
          </div>
        </div>
      )}

      {plan && (
        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-2 text-xs" role="status">
            <span className={ACTION_BADGE.create}>{plan.summary.create} new</span>
            <span className={ACTION_BADGE.update}>{plan.summary.update} updated</span>
            <span className={ACTION_BADGE.unchanged}>{plan.summary.unchanged} unchanged – skipped</span>
          </p>
          <p className="text-xs text-muted">
            Updated sources take the URL, schedule, history and enabled state from the file. A changed URL or schedule clears the
            source's import status, so it downloads again on the next scheduler run; stored channels and programmes are kept.
          </p>
          {writes === 0 && (
            <p className="inline-alert" role="status">Every source in the file already matches the current configuration. There is nothing to import.</p>
          )}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Result</th>
                  <th scope="col">Schedule</th>
                  <th scope="col">Refresh</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.name}>
                    <td className="min-w-[220px]">
                      <span className="table-text font-semibold">{item.name}</span>
                      <span className="cell-sub font-mono break-all">{item.url}</span>
                    </td>
                    <td>
                      <span className={ACTION_BADGE[item.action]}>{ACTION_LABEL[item.action]}</span>
                      {item.action === 'update' && (
                        <span className="cell-sub">Changes: {item.changes.map((change) => CHANGE_LABEL[change] ?? change).join(', ')}</span>
                      )}
                    </td>
                    <td>
                      <span className="table-text font-mono whitespace-nowrap">every {formatInterval(item.refresh_interval_minutes)}</span>
                      <span className="cell-sub font-mono">keep {item.history_days} d</span>
                    </td>
                    <td><span className="table-text">{item.enabled ? 'Enabled' : 'Disabled'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length > 0 && <Pagination {...paginationProps} itemLabel="sources" />}
          {applyError && <p className="inline-alert is-error" role="alert">Nothing was imported: {applyError}</p>}
        </div>
      )}
    </Dialog>
  )
}
