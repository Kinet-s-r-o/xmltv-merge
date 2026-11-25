import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { api, type Source, type SourceImportLog } from '../../api/client'
import { Dialog } from '../ui/Dialog'
import { Pagination, usePagedRows } from '../ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../ui/ResourceState'
import { formatTimestamp } from '../../lib/sourceStatus'

const STATUS_LABEL: Record<string, string> = {
  running: 'Running',
  success: 'Imported',
  partial: 'Partially imported',
  error: 'Failed',
}

const STATUS_BADGE: Record<string, string> = {
  running: 'badge badge-accent',
  success: 'badge badge-success',
  partial: 'badge badge-warning',
  error: 'badge badge-error',
}

const TRIGGER_LABEL: Record<string, string> = {
  manual: 'Manual refresh',
  scheduled: 'Scheduled',
  upload: 'File upload',
}

const STAGE_LABEL: Record<string, string> = {
  download: 'Download',
  parse: 'Parse XML',
  channels: 'Store channels',
  programmes: 'Store programmes',
  done: 'Completed',
}

function formatDuration(entry: SourceImportLog) {
  if (!entry.finished_at) return '—'
  const ms = new Date(entry.finished_at).getTime() - new Date(entry.started_at).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  const seconds = Math.round(ms / 100) / 10
  if (seconds < 60) return `${seconds} s`
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`
}

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const n = (value: number) => value.toLocaleString()

/** Audit log of a source's import attempts with the reasons data was not imported. */
export function SourceImportLogDialog({ source, onClose }: { source: Source | null; onClose: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const sourceId = source?.id
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['source-imports', sourceId],
    queryFn: () => api.sourceImports(sourceId as number),
    enabled: sourceId !== undefined,
    refetchInterval: (query) => (query.state.data?.some((entry) => entry.status === 'running') ? 5_000 : 30_000),
  })
  const entries = data ?? []
  const { visible, paginationProps } = usePagedRows(entries, 'xmltv-page-size:source-imports', sourceId)

  return (
    <Dialog
      open={source !== null}
      size="wide"
      title={`Import log: ${source?.name ?? ''}`}
      description="Every download and import attempt of this source, newest first, kept for 90 days. Expand an attempt to see why data was not imported."
      onClose={onClose}
      actions={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}
    >
      {isLoading ? (
        <LoadingState compact title="Loading import log" />
      ) : isError ? (
        <ResourceError compact title="Import log could not be loaded" message={errorMessage(error)} onRetry={() => refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState compact icon={History} title="No imports recorded yet" message="Attempts appear here after the next scheduled or manual refresh." />
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col" className="w-8"><span className="sr-only">Details</span></th>
                  <th scope="col">Started</th>
                  <th scope="col">Trigger</th>
                  <th scope="col">Status</th>
                  <th scope="col">Stage</th>
                  <th scope="col" className="text-right">Duration</th>
                  <th scope="col" className="text-right">Size</th>
                  <th scope="col" className="text-right">Channels</th>
                  <th scope="col" className="text-right">Programmes</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => {
                  const open = expanded === entry.id
                  const Chevron = open ? ChevronDown : ChevronRight
                  return (
                    <Fragment key={entry.id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="icon-button"
                            aria-expanded={open}
                            aria-label={`${open ? 'Hide' : 'Show'} details of the import started ${formatTimestamp(entry.started_at) ?? ''}`}
                            onClick={() => setExpanded(open ? null : entry.id)}
                          >
                            <Chevron className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                        <td><span className="table-text font-mono whitespace-nowrap">{formatTimestamp(entry.started_at) ?? '—'}</span></td>
                        <td>
                          <span className="table-text whitespace-nowrap">{TRIGGER_LABEL[entry.trigger] ?? entry.trigger}</span>
                          {entry.triggered_by && <span className="cell-sub font-mono">{entry.triggered_by}</span>}
                        </td>
                        <td>
                          <span className={STATUS_BADGE[entry.status] ?? 'badge'}>{STATUS_LABEL[entry.status] ?? entry.status}</span>
                          {entry.error && <span className="cell-sub text-error-text max-w-[360px]">{entry.error}</span>}
                          {!entry.error && entry.issue_count > 0 && <span className="cell-sub">{n(entry.issue_count)} {entry.issue_count === 1 ? 'issue' : 'issues'}</span>}
                        </td>
                        <td><span className="table-text whitespace-nowrap">{STAGE_LABEL[entry.stage] ?? entry.stage}</span></td>
                        <td className="text-right"><span className="table-text font-mono whitespace-nowrap">{formatDuration(entry)}</span></td>
                        <td className="text-right"><span className="table-text font-mono whitespace-nowrap">{formatBytes(entry.bytes)}</span></td>
                        <td className="text-right"><span className="table-text font-mono whitespace-nowrap">{n(entry.channels_imported)} / {n(entry.channels_total)}</span></td>
                        <td className="text-right"><span className="table-text font-mono whitespace-nowrap">{n(entry.programmes_imported)} / {n(entry.programmes_total)}</span></td>
                      </tr>
                      {open && (
                        <tr>
                          <td />
                          <td colSpan={8}>
                            <ImportDetails entry={entry} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...paginationProps} itemLabel="imports" />
        </>
      )}
    </Dialog>
  )
}

function ImportDetails({ entry }: { entry: SourceImportLog }) {
  const counts: [string, number][] = [
    ['Programmes in file', entry.programmes_total],
    ['Imported (today and later)', entry.programmes_imported],
    ['Skipped: before today', entry.programmes_past],
    ['Skipped: invalid time', entry.programmes_invalid],
    ['Skipped: undeclared channel', entry.programmes_unknown_channel],
    ['Failed to store', entry.programmes_failed],
    ['Details not stored (titles, credits, categories)', entry.detail_errors],
  ]
  return (
    <div className="flex flex-col gap-3 py-2">
      {entry.error && (
        <p className="table-text text-error-text">
          <strong>Failed in stage {STAGE_LABEL[entry.stage] ?? entry.stage}:</strong> {entry.error}
        </p>
      )}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {counts.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="table-text">{label}</dt>
            <dd className="table-text font-mono">{n(value)}</dd>
          </div>
        ))}
      </dl>
      {entry.issues.length > 0 && (
        <div>
          <p className="table-text font-semibold">
            Issues{entry.issue_count > entry.issues.length ? ` (first ${n(entry.issues.length)} of ${n(entry.issue_count)})` : ''}
          </p>
          <ul className="mt-1 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {entry.issues.map((issue, index) => (
              <li key={index} className="table-text font-mono break-all">{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {!entry.error && entry.issues.length === 0 && entry.status !== 'running' && (
        <p className="table-text">Every programme from today on was imported.</p>
      )}
    </div>
  )
}
