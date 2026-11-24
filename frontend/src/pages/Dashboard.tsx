import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Database, Search, Upload } from 'lucide-react'
import { api, type Source } from '../api/client'
import { Pagination, usePagedRows } from '../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'
import { ColumnVisibilityCell, ColumnVisibilityHeader, TableCells, TableFilterSummary, TableHeaderCells, TableSearch, useTableControls, type TableColumn } from '../components/ui/TableControls'
import { HEALTH_OPTIONS, formatTimestamp, healthBadge, healthLabel, sourceHealth, sourceSearchText } from '../lib/sourceStatus'

const SOURCE_COLUMNS: TableColumn<Source>[] = [
  {
    id: 'name',
    label: 'Source',
    kind: 'text',
    value: (source) => source.name,
    cell: (source) => (
      <>
        <span className="table-text font-semibold">{source.name}</span>
        {source.last_import_error && <span className="cell-sub text-error-text">{source.last_import_error}</span>}
      </>
    ),
  },
  {
    id: 'status',
    label: 'Status',
    kind: 'enum',
    value: (source) => sourceHealth(source),
    options: HEALTH_OPTIONS,
    cell: (source) => <span className={healthBadge[sourceHealth(source)]}>{healthLabel[sourceHealth(source)]}</span>,
  },
  {
    id: 'channels',
    label: 'Channels',
    kind: 'number',
    align: 'right',
    value: (source) => source.channel_count ?? 0,
    cell: (source) => <span className="table-text font-mono">{(source.channel_count ?? 0).toLocaleString()}</span>,
  },
  {
    id: 'programmes',
    label: 'Programmes',
    kind: 'number',
    align: 'right',
    value: (source) => source.programme_count ?? 0,
    cell: (source) => <span className="table-text font-mono">{(source.programme_count ?? 0).toLocaleString()}</span>,
  },
  {
    id: 'last_import',
    label: 'Last import',
    kind: 'date',
    value: (source) => source.last_import_at,
    cell: (source) => <span className="table-text font-mono whitespace-nowrap">{formatTimestamp(source.last_import_at) ?? 'Never'}</span>,
  },
]


export function Dashboard() {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })
  const sources = data ?? []
  const table = useTableControls(sources, SOURCE_COLUMNS, { searchText: sourceSearchText, storageKey: 'dashboard-sources' })
  const { visible: visibleSources, paginationProps } = usePagedRows(table.rows, 'xmltv-dashboard-sources-page-size', table.resetKey)

  const totalChannels = sources.reduce((sum, s) => sum + (s.channel_count ?? 0), 0)
  const totalProgrammes = sources.reduce((sum, s) => sum + (s.programme_count ?? 0), 0)
  const healthy = sources.filter((source) => sourceHealth(source) === 'healthy').length
  const failed = sources.filter((source) => sourceHealth(source) === 'failed').length
  const pending = sources.filter((source) => sourceHealth(source) === 'pending').length
  const disabled = sources.filter((source) => sourceHealth(source) === 'disabled').length
  const latestImport = sources
    .map((source) => source.last_import_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  const checkedAt = dataUpdatedAt ? formatTimestamp(new Date(dataUpdatedAt).toISOString()) : null

  return (
    <>
      <h1 className="sr-only">Dashboard</h1>

      {!isLoading && !isError && (
        <dl className="ops-register" aria-label="Source and guide totals">
          <div className="ops-register-cell">
            <dt>Sources</dt>
            <dd>{sources.length.toLocaleString()}</dd>
            <small>{checkedAt ? <>Checked <span className="font-mono">{checkedAt}</span></> : 'Not checked yet'}</small>
          </div>
          <div className={`ops-register-cell${healthy > 0 ? ' is-online' : ''}`}>
            <dt>Imported</dt>
            <dd>{healthy.toLocaleString()}</dd>
            <small>{latestImport ? <>Latest <span className="font-mono">{formatTimestamp(latestImport)}</span></> : 'No import finished yet'}</small>
          </div>
          <div className={`ops-register-cell${failed > 0 ? ' is-offline' : ''}`}>
            <dt>Import failed</dt>
            <dd>{failed.toLocaleString()}</dd>
            <small>{failed > 0 ? 'Check the error on Sources' : 'No failing source'}</small>
          </div>
          <div className={`ops-register-cell${pending > 0 ? ' is-warning' : ''}`}>
            <dt>Awaiting import</dt>
            <dd>{pending.toLocaleString()}</dd>
            <small>{disabled > 0 ? `${disabled} disabled, not refreshed` : 'Enabled, first run queued'}</small>
          </div>
          <div className="ops-register-cell">
            <dt>Channels</dt>
            <dd>{totalChannels.toLocaleString()}</dd>
            <small>Across all sources</small>
          </div>
          <div className="ops-register-cell">
            <dt>Programmes</dt>
            <dd>{totalProgrammes.toLocaleString()}</dd>
            <small>Stored within history windows</small>
          </div>
        </dl>
      )}

      <section className="data-panel" aria-labelledby="dashboard-sources-title">
        <div className="table-panel-toolbar">
          <div>
            <h2 id="dashboard-sources-title">Source import status</h2>
            <p>Last import result and stored guide data per source</p>
          </div>
          {sources.length > 0 && (
            <TableSearch controls={table} label="Search sources by name, URL, status or import error" placeholder="Search name, URL, status or error" />
          )}
        </div>
        {sources.length > 0 && <TableFilterSummary controls={table} />}
        {isLoading ? (
          <LoadingState title="Loading source status" compact />
        ) : isError ? (
          <ResourceError title="Source status could not be loaded" message={errorMessage(error)} onRetry={() => refetch()} />
        ) : sources.length === 0 ? (
          <EmptyState
            icon={Upload}
            title="No XMLTV sources configured"
            message="Add an XMLTV URL on the Sources page. The first import starts right away; channel and programme totals appear here once it finishes."
          >
            <Link to="/sources" className="btn btn-primary"><Database className="h-3.5 w-3.5" aria-hidden="true" /> Add a source</Link>
          </EmptyState>
        ) : table.rows.length === 0 ? (
          <EmptyState icon={Search} title="No sources match the current filters" message="Change the search or column filters, or clear them to list all sources.">
            <button type="button" className="btn btn-secondary" onClick={table.clearAll}>Clear filters</button>
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <TableHeaderCells controls={table} />
                  <ColumnVisibilityHeader controls={table} />
                </tr>
              </thead>
              <tbody>
                {visibleSources.map((source) => (
                  <tr key={source.id}>
                    <TableCells controls={table} row={source} />
                    <ColumnVisibilityCell />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && !isError && table.rows.length > 0 && <Pagination {...paginationProps} itemLabel="sources" />}
      </section>
    </>
  )
}
