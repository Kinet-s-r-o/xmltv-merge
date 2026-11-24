import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Database, Tv, Upload } from 'lucide-react'
import { api } from '../api/client'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'
import { formatTimestamp, healthBadge, healthLabel, sourceHealth } from '../lib/sourceStatus'

export function Dashboard() {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })
  const sources = data ?? []

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
      <PageHeader
        title="Feed health"
        description="Import state, freshness and guide coverage of every XMLTV source. Sources that failed or never imported need action on the Sources page."
      >
        <Link to="/epg" className="btn btn-secondary"><Tv className="h-3.5 w-3.5" aria-hidden="true" /> Open EPG grid</Link>
        <Link to="/sources" className="btn btn-primary"><Database className="h-3.5 w-3.5" aria-hidden="true" /> Manage sources</Link>
      </PageHeader>

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
          <Link to="/sources" className="btn btn-secondary btn-xs">Manage <ArrowRight className="h-3 w-3" aria-hidden="true" /></Link>
        </div>
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
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Channels</th>
                  <th scope="col" className="text-right">Programmes</th>
                  <th scope="col">Last import</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => {
                  const health = sourceHealth(source)
                  return (
                    <tr key={source.id}>
                      <td>
                        <span className="table-text font-semibold">{source.name}</span>
                        {source.last_import_error && <span className="cell-sub text-error-text">{source.last_import_error}</span>}
                      </td>
                      <td><span className={healthBadge[health]}>{healthLabel[health]}</span></td>
                      <td className="text-right"><span className="table-text font-mono">{(source.channel_count ?? 0).toLocaleString()}</span></td>
                      <td className="text-right"><span className="table-text font-mono">{(source.programme_count ?? 0).toLocaleString()}</span></td>
                      <td><span className="table-text font-mono whitespace-nowrap">{formatTimestamp(source.last_import_at) ?? 'Never'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
