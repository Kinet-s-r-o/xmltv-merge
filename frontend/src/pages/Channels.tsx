import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarDays, ListVideo, Search } from 'lucide-react'
import { api, Channel } from '../api/client'
import { StationScheduleDialog } from '../components/channels/StationScheduleDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, usePagedRows } from '../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'
import { ColumnVisibilityCell, ColumnVisibilityHeader, TableCells, TableFilterSummary, TableHeaderCells, TableSearch, useTableControls, type TableColumn } from '../components/ui/TableControls'

const PAGE_SIZE_KEY = 'xmltv-channels-page-size'

export function Channels() {
  const [scheduleChannel, setScheduleChannel] = useState<Channel | null>(null)

  const { data: sourceData } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })
  const sources = useMemo(() => sourceData ?? [], [sourceData])
  const sourceNames = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources])

  // All channels are loaded once; search, column filters and sorting run client-side.
  const { data: channelData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.channels(),
  })
  const channels = useMemo(() => channelData ?? [], [channelData])
  const columns = useMemo<TableColumn<Channel>[]>(() => [
    {
      id: 'name',
      label: 'Channel',
      kind: 'text',
      value: (channel) => channel.name,
      cell: (channel) => (
        <span className="flex min-w-0 items-center gap-3">
          {channel.icon_url
            ? <img src={channel.icon_url} alt="" className="channel-logo" loading="lazy" />
            : <span className="channel-logo" aria-hidden="true">{channel.name.charAt(0).toUpperCase()}</span>}
          <button type="button" className="btn-link table-text font-medium" onClick={() => setScheduleChannel(channel)} title="Show this station's schedule">
            {channel.name}
          </button>
        </span>
      ),
    },
    {
      id: 'external_id',
      label: 'XMLTV ID',
      kind: 'text',
      value: (channel) => channel.external_id,
      cell: (channel) => <span className="table-text font-mono break-all">{channel.external_id}</span>,
    },
    {
      id: 'source',
      label: 'Source',
      kind: 'enum',
      value: (channel) => String(channel.source_id),
      options: sources.map((source) => ({ value: String(source.id), label: source.name })),
      cell: (channel) => <span className="table-text">{sourceNames.get(channel.source_id) ?? `Source #${channel.source_id}`}</span>,
    },
  ], [sources, sourceNames])
  const searchText = useMemo(
    () => (channel: Channel) => [channel.name, channel.external_id, sourceNames.get(channel.source_id) ?? ''].join(' '),
    [sourceNames],
  )
  const table = useTableControls(channels, columns, { searchText, storageKey: 'channels' })
  const { visible, paginationProps } = usePagedRows(table.rows, PAGE_SIZE_KEY, table.resetKey)

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
            <p className="font-mono">{table.isFiltered ? `${table.rows.length.toLocaleString()} of ${channels.length.toLocaleString()} shown` : `${channels.length.toLocaleString()} total`}</p>
          </div>
          {channels.length > 0 && (
            <TableSearch controls={table} label="Search channels by name, XMLTV ID or source" placeholder="Search name, XMLTV ID or source" />
          )}
        </div>
        {channels.length > 0 && <TableFilterSummary controls={table} />}

        {isLoading ? (
          <LoadingState title="Loading channels" compact />
        ) : isError ? (
          <ResourceError title="Channels could not be loaded" message={errorMessage(error)} onRetry={() => refetch()} />
        ) : channels.length === 0 ? (
          <EmptyState
            icon={ListVideo}
            title="No channels imported yet"
            message="Channels appear after a source finishes its first XMLTV import. Add a source or check its import status."
          >
            <Link to="/sources" className="btn btn-primary">Go to sources</Link>
          </EmptyState>
        ) : table.rows.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No channels match the current filters"
            message="Change the search or column filters, or clear them to list all channels. Names, XMLTV IDs and sources are searched."
          >
            <button type="button" className="btn btn-secondary" onClick={table.clearAll}>Clear filters</button>
          </EmptyState>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <TableHeaderCells controls={table} />
                    <th scope="col" className="text-right" data-column-fixed="actions">Schedule</th>
                    <ColumnVisibilityHeader controls={table} />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((channel) => (
                    <tr key={channel.id}>
                      <TableCells controls={table} row={channel} />
                      <td data-column-fixed="actions">
                        <div className="cell-actions">
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => setScheduleChannel(channel)}
                            aria-label={`Show schedule of ${channel.name}`}
                            title="Show schedule by day"
                          >
                            <CalendarDays className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                      <ColumnVisibilityCell />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...paginationProps} itemLabel="channels" />
          </>
        )}
      </section>

      <StationScheduleDialog
        channel={scheduleChannel}
        sourceName={scheduleChannel ? sourceNames.get(scheduleChannel.source_id) : undefined}
        onClose={() => setScheduleChannel(null)}
      />
    </>
  )
}
