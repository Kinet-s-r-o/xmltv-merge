import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ListVideo, Search } from 'lucide-react'
import { api } from '../api/client'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, readStoredPageSize, storePageSize } from '../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'

const PAGE_SIZE_KEY = 'xmltv-channels-page-size'

export function Channels() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<number | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => readStoredPageSize(PAGE_SIZE_KEY, 50))

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => setPage(1), [search, sourceFilter, pageSize])

  const { data: sourceData } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })
  const sources = useMemo(() => sourceData ?? [], [sourceData])
  const sourceNames = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources])

  const { data: channelData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['channels', sourceFilter, search],
    queryFn: () => api.channels({ source_id: sourceFilter, search: search || undefined }),
  })
  const channels = channelData ?? []
  const pageCount = Math.max(1, Math.ceil(channels.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = channels.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const filtered = Boolean(search) || sourceFilter !== undefined

  return (
    <>
      <PageHeader
        title="Channels"
        description="Stations imported from every XMLTV source, with the XMLTV channel ID used in feeds and outputs."
      />

      <section className="data-panel" aria-labelledby="channels-table-title">
        <div className="table-panel-toolbar">
          <div>
            <h2 id="channels-table-title">Imported channels</h2>
            <p className="font-mono">{channels.length.toLocaleString()} {filtered ? 'matching' : 'total'}</p>
          </div>
          <div className="toolbar-filters">
            <label className="search-field w-full sm:w-72">
              <span className="sr-only">Search channels by name or XMLTV ID</span>
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <input
                type="search"
                className="input"
                placeholder="Search name or XMLTV ID"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </label>
            <label className="w-full sm:w-56">
              <span className="sr-only">Filter by source</span>
              <select
                className="input"
                value={sourceFilter ?? ''}
                onChange={(event) => setSourceFilter(event.target.value ? Number(event.target.value) : undefined)}
              >
                <option value="">All sources</option>
                {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
              </select>
            </label>
          </div>
        </div>

        {isLoading ? (
          <LoadingState title="Loading channels" compact />
        ) : isError ? (
          <ResourceError title="Channels could not be loaded" message={errorMessage(error)} onRetry={() => refetch()} />
        ) : channels.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title="No channels match the current filters"
              message="Clear the search or choose All sources. Channel names and XMLTV IDs are matched."
            >
              <button type="button" className="btn btn-secondary" onClick={() => { setSearchInput(''); setSearch(''); setSourceFilter(undefined) }}>Clear filters</button>
            </EmptyState>
          ) : (
            <EmptyState
              icon={ListVideo}
              title="No channels imported yet"
              message="Channels appear after a source finishes its first XMLTV import. Add a source or check its import status."
            >
              <Link to="/sources" className="btn btn-primary">Go to sources</Link>
            </EmptyState>
          )
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Channel</th>
                    <th scope="col">XMLTV ID</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((channel) => (
                    <tr key={channel.id}>
                      <td>
                        <span className="flex min-w-0 items-center gap-3">
                          {channel.icon_url
                            ? <img src={channel.icon_url} alt="" className="channel-logo" loading="lazy" />
                            : <span className="channel-logo" aria-hidden="true">{channel.name.charAt(0).toUpperCase()}</span>}
                          <span className="table-text font-medium">{channel.name}</span>
                        </span>
                      </td>
                      <td><span className="table-text font-mono break-all">{channel.external_id}</span></td>
                      <td><span className="table-text">{sourceNames.get(channel.source_id) ?? `Source #${channel.source_id}`}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              total={channels.length}
              itemLabel="channels"
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); storePageSize(PAGE_SIZE_KEY, size) }}
            />
          </>
        )}
      </section>
    </>
  )
}
