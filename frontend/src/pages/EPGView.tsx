import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, isValid, parseISO } from 'date-fns'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Search, Tv } from 'lucide-react'
import { api, Programme } from '../api/client'
import { Dialog } from '../components/ui/Dialog'
import { PAGE_SIZES, readStoredPageSize, storePageSize } from '../components/ui/Pagination'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'

const HOUR_WIDTH = 160
const HOURS_PER_DAY = 24
const PAGE_SIZE_KEY = 'xmltv-epg-page-size'

export function EPGView() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialDate = parseISO(searchParams.get('date') ?? '')
  const [selectedDate, setSelectedDate] = useState(isValid(initialDate) ? initialDate : new Date())
  const [selectedSource, setSelectedSource] = useState<number | null>(() => {
    const value = Number(searchParams.get('source'))
    return Number.isInteger(value) && value > 0 ? value : null
  })
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1))
  const [pageSize, setPageSize] = useState(() => readStoredPageSize(PAGE_SIZE_KEY, 50))
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const urlDate = parseISO(searchParams.get('date') ?? '')
    if (isValid(urlDate)) {
      setSelectedDate((current) => format(current, 'yyyy-MM-dd') === format(urlDate, 'yyyy-MM-dd') ? current : urlDate)
    }
    const sourceValue = Number(searchParams.get('source'))
    const urlSource = Number.isInteger(sourceValue) && sourceValue > 0 ? sourceValue : null
    setSelectedSource((current) => current === urlSource ? current : urlSource)
    const urlSearch = searchParams.get('q') ?? ''
    setSearchInput((current) => current === urlSearch ? current : urlSearch)
    setSearch((current) => current === urlSearch ? current : urlSearch)
    const urlPage = Math.max(1, Number(searchParams.get('page')) || 1)
    setPage((current) => current === urlPage ? current : urlPage)
  }, [searchParams])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('date', format(selectedDate, 'yyyy-MM-dd'))
    if (selectedSource !== null) params.set('source', String(selectedSource))
    if (search) params.set('q', search)
    if (page > 1) params.set('page', String(page))
    setSearchParams(params, { replace: true })
  }, [page, search, selectedDate, selectedSource, setSearchParams])

  const { data: sourceData } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })
  const sources = useMemo(() => sourceData ?? [], [sourceData])

  const { data: channelData, isLoading: channelsLoading, isError: channelsError, error: channelsErrorValue, refetch: refetchChannels } = useQuery({
    queryKey: ['channels', selectedSource, search],
    queryFn: () => api.channels({
      source_id: selectedSource ?? undefined,
      search: search.trim() || undefined,
    }),
  })
  const allChannels = channelData ?? []

  const pageCount = Math.max(1, Math.ceil(allChannels.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const channels = useMemo(() => allChannels.slice((currentPage - 1) * pageSize, currentPage * pageSize), [allChannels, currentPage, pageSize])
  const channelIds = channels.map((channel) => channel.id)

  const { data: programmes, isLoading: programmesLoading, isError: programmesError, error: programmesErrorValue, refetch: refetchProgrammes } = useQuery({
    queryKey: ['programmes', format(selectedDate, 'yyyy-MM-dd'), selectedSource, channelIds],
    queryFn: () => api.programmes({
      date: format(selectedDate, 'yyyy-MM-dd'),
      source_id: selectedSource ?? undefined,
      channel_ids: channelIds,
      limit: 5000,
    }),
    enabled: channelIds.length > 0,
  })

  const { data: selectedProgramme, isLoading: programmeLoading } = useQuery({
    queryKey: ['programme', selectedProgrammeId],
    queryFn: () => api.programme(selectedProgrammeId!),
    enabled: selectedProgrammeId !== null,
  })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const programmesByChannel = useMemo(() => {
    const grouped = new Map<number, Programme[]>()
    for (const programme of programmes?.data ?? []) {
      const channelProgrammes = grouped.get(programme.channel_id) ?? []
      channelProgrammes.push(programme)
      grouped.set(programme.channel_id, channelProgrammes)
    }
    return grouped
  }, [programmes])

  const sourceNames = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources])
  const dayStart = new Date(selectedDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const nowPosition = now >= dayStart && now < dayEnd
    ? ((now.getTime() - dayStart.getTime()) / 3_600_000) * HOUR_WIDTH
    : null

  const getProgrammePosition = (programme: Programme) => {
    const start = new Date(programme.start_time)
    const stop = new Date(programme.stop_time)
    const visibleStart = Math.max(start.getTime(), dayStart.getTime())
    const visibleStop = Math.min(stop.getTime(), dayEnd.getTime())
    const left = ((visibleStart - dayStart.getTime()) / 3_600_000) * HOUR_WIDTH
    const width = Math.max(((visibleStop - visibleStart) / 3_600_000) * HOUR_WIDTH, 24)
    return { left, width }
  }

  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const selectedDay = format(selectedDate, 'yyyy-MM-dd')

  /** Scroll the timeline so the current time sits one hour from its left edge (today only). */
  const scrollGridToNow = useCallback((element: HTMLDivElement | null) => {
    const current = new Date()
    if (!element || format(current, 'yyyy-MM-dd') !== selectedDay) return
    const midnight = new Date(current)
    midnight.setHours(0, 0, 0, 0)
    const nowX = ((current.getTime() - midnight.getTime()) / 3_600_000) * HOUR_WIDTH
    element.scrollLeft = Math.max(0, nowX - HOUR_WIDTH)
  }, [selectedDay])

  // Runs whenever the grid mounts (first load, day/page/filter change) and when the selected day changes.
  const gridScrollCallbackRef = useCallback((element: HTMLDivElement | null) => {
    gridScrollRef.current = element
    scrollGridToNow(element)
  }, [scrollGridToNow])

  const programmeTitle = (programme: Programme) => programme.titles?.[0]?.title || programme.subtitle || 'Untitled programme'
  const timeRange = (programme: Programme) => `${format(new Date(programme.start_time), 'HH:mm')}–${format(new Date(programme.stop_time), 'HH:mm')}`
  const firstShown = allChannels.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const lastShown = Math.min(currentPage * pageSize, allChannels.length)
  const filtered = Boolean(search) || selectedSource !== null
  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')

  return (
    <>
      <PageHeader
        title="EPG grid"
        description="24-hour programme timeline per station. Select a programme block for its description, credits and categories."
      >
        <button type="button" className="icon-button" onClick={() => setSelectedDate((date) => addDays(date, -1))} aria-label="Previous day" title="Previous day">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <label className="w-40">
          <span className="sr-only">Guide date</span>
          <input
            type="date"
            className="input font-mono"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={(event) => {
              const value = parseISO(event.target.value)
              if (isValid(value)) setSelectedDate(value)
            }}
          />
        </label>
        <button type="button" className="icon-button" onClick={() => setSelectedDate((date) => addDays(date, 1))} aria-label="Next day" title="Next day">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => { if (isToday) scrollGridToNow(gridScrollRef.current); else setSelectedDate(new Date()) }}
          title={isToday ? 'Scroll the grid to the current time' : 'Show today, scrolled to the current time'}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> {isToday ? 'Now' : 'Today'}
        </button>
      </PageHeader>

      <section className="data-panel epg-panel" aria-labelledby="epg-grid-title">
        <div className="table-panel-toolbar">
          <div>
            <h2 id="epg-grid-title">{format(selectedDate, 'EEEE, d MMMM yyyy')}</h2>
            <p className="font-mono">
              {allChannels.length === 0 ? '0 stations' : `Stations ${firstShown}–${lastShown} of ${allChannels.length}`}
            </p>
          </div>
          <div className="toolbar-filters">
            <label className="w-full sm:w-48">
              <span className="sr-only">Filter by source</span>
              <select
                className="input"
                value={selectedSource ?? ''}
                onChange={(event) => { setSelectedSource(event.target.value ? Number(event.target.value) : null); setPage(1) }}
              >
                <option value="">All sources</option>
                {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
              </select>
            </label>
            <label className="search-field w-full sm:w-52">
              <span className="sr-only">Search stations</span>
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <input
                type="search"
                className="input"
                value={searchInput}
                onChange={(event) => { setSearchInput(event.target.value); setPage(1) }}
                placeholder="Search stations"
              />
            </label>
            <label className="field-inline whitespace-nowrap" title="Stations per page">
              <span aria-hidden="true">Per page</span>
              <span className="sr-only">Stations per page</span>
              <select
                className="input w-auto"
                value={pageSize}
                onChange={(event) => { const size = Number(event.target.value); setPageSize(size); storePageSize(PAGE_SIZE_KEY, size); setPage(1) }}
              >
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button type="button" className="icon-button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Previous stations" title="Previous stations">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount} aria-label="Next stations" title="Next stations">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {channelsLoading || programmesLoading ? (
          <LoadingState title="Loading programme grid" message="Fetching stations and programmes for the selected day." />
        ) : channelsError || programmesError ? (
          <ResourceError
            title={channelsError ? 'Stations could not be loaded' : 'Programmes could not be loaded'}
            message={errorMessage(channelsError ? channelsErrorValue : programmesErrorValue)}
            onRetry={() => { if (channelsError) refetchChannels(); if (programmesError) refetchProgrammes() }}
          />
        ) : channels.length === 0 ? (
          filtered ? (
            <EmptyState icon={Search} title="No stations match the current filters" message="Clear the station search or choose All sources to see the full grid.">
              <button type="button" className="btn btn-secondary" onClick={() => { setSearchInput(''); setSearch(''); setSelectedSource(null); setPage(1) }}>Clear filters</button>
            </EmptyState>
          ) : (
            <EmptyState icon={Tv} title="No stations to show yet" message="The grid fills after a source finishes its first XMLTV import. Add a source or check its import status.">
              <Link to="/sources" className="btn btn-primary">Go to sources</Link>
            </EmptyState>
          )
        ) : (
          <div className="epg-scroll" ref={gridScrollCallbackRef}>
            <div className="epg-grid" aria-label={`Programme grid for ${format(selectedDate, 'd MMMM yyyy')}`}>
              <div className="epg-header-row">
                <div className="epg-station-head">Station</div>
                <div className="epg-timeline" aria-hidden="true" data-dynamic-style style={{ width: HOURS_PER_DAY * HOUR_WIDTH }}>
                  {Array.from({ length: HOURS_PER_DAY }, (_, hour) => (
                    <div key={hour} className="epg-hour" data-dynamic-style style={{ left: hour * HOUR_WIDTH, width: HOUR_WIDTH }}>
                      {String(hour).padStart(2, '0')}:00
                    </div>
                  ))}
                  {nowPosition !== null && (
                    <div className="epg-now-line" data-dynamic-style style={{ left: nowPosition }}>
                      <span className="epg-now-label">{format(now, 'HH:mm')}</span>
                    </div>
                  )}
                </div>
              </div>

              {channels.map((channel) => (
                <div key={channel.id} className="epg-row">
                  <div className="epg-station">
                    <strong title={channel.name}>{channel.name}</strong>
                    <span title={sourceNames.get(channel.source_id) ?? channel.external_id}>{sourceNames.get(channel.source_id) ?? channel.external_id}</span>
                  </div>
                  <div className="epg-row-track" data-dynamic-style style={{ width: HOURS_PER_DAY * HOUR_WIDTH }}>
                    {Array.from({ length: HOURS_PER_DAY }, (_, hour) => (
                      <div key={hour} className="epg-hour-line" aria-hidden="true" data-dynamic-style style={{ left: hour * HOUR_WIDTH }} />
                    ))}
                    {nowPosition !== null && <div className="epg-now-line" aria-hidden="true" data-dynamic-style style={{ left: nowPosition }} />}
                    {(programmesByChannel.get(channel.id) ?? []).map((programme) => {
                      const position = getProgrammePosition(programme)
                      if (position.left >= HOURS_PER_DAY * HOUR_WIDTH || position.left + position.width <= 0) return null
                      const start = new Date(programme.start_time)
                      const stop = new Date(programme.stop_time)
                      const live = now >= start && now < stop
                      const state = live ? ' is-live' : stop <= now ? ' is-past' : ''
                      const title = programmeTitle(programme)
                      return (
                        <button
                          key={programme.id}
                          type="button"
                          onClick={() => setSelectedProgrammeId(programme.id)}
                          className={`epg-programme${state}`}
                          data-dynamic-style
                          style={{ left: position.left + 2, width: position.width - 4 }}
                          title={`${title} · ${timeRange(programme)}`}
                          aria-label={`${title}, ${channel.name}, ${timeRange(programme)}${live ? ', on air now' : ''}`}
                        >
                          <span className="epg-programme-title">{title}</span>
                          <span className="epg-programme-time">{timeRange(programme)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="table-footer">
          <div className="epg-legend">
            <span><span className="epg-legend-swatch" aria-hidden="true" />Scheduled</span>
            <span><span className="epg-legend-swatch is-live" aria-hidden="true" />On air now</span>
            <span><span className="epg-legend-swatch is-now" aria-hidden="true" />Current time</span>
          </div>
          <span className="font-mono">Times in browser local time</span>
        </div>
      </section>

      <Dialog
        open={selectedProgrammeId !== null}
        size="large"
        busy={programmeLoading}
        onClose={() => setSelectedProgrammeId(null)}
        title={programmeLoading ? 'Loading programme' : selectedProgramme ? programmeTitle(selectedProgramme) : 'Programme details'}
        description={selectedProgramme ? <span className="font-mono">{format(new Date(selectedProgramme.start_time), 'yyyy-MM-dd HH:mm')}–{format(new Date(selectedProgramme.stop_time), 'HH:mm')}{selectedProgramme.channel?.name ? ` · ${selectedProgramme.channel.name}` : ''}</span> : undefined}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setSelectedProgrammeId(null)}>Close</button>
            {selectedProgramme && (
              <Link to={`/programmes/${selectedProgramme.id}`} state={{ from: `${location.pathname}${location.search}` }} className="btn btn-primary">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open full detail
              </Link>
            )}
          </>
        }
      >
        {programmeLoading ? (
          <LoadingState title="Loading programme details" compact />
        ) : selectedProgramme ? (
          <div className="flex flex-col gap-4 sm:flex-row">
            {selectedProgramme.icon_url && <img src={selectedProgramme.icon_url} alt="" className="poster" />}
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {selectedProgramme.categories && selectedProgramme.categories.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Categories">
                  {selectedProgramme.categories.map((category) => <li key={category.id} className="chip">{category.category}</li>)}
                </ul>
              )}
              <dl className="meta-list">
                {selectedProgramme.subtitle && <><dt>Episode title</dt><dd>{selectedProgramme.subtitle}</dd></>}
                {selectedProgramme.episode_num && <><dt>Episode</dt><dd className="font-mono">{selectedProgramme.episode_num}</dd></>}
                {selectedProgramme.country && <><dt>Country</dt><dd>{selectedProgramme.country}</dd></>}
                {selectedProgramme.year && <><dt>Year</dt><dd className="font-mono">{selectedProgramme.year}</dd></>}
              </dl>
              {selectedProgramme.description ? (
                <div>
                  <h3 className="mb-2 text-[12px] font-semibold">Description</h3>
                  <p className="prose-text">{selectedProgramme.description}</p>
                </div>
              ) : (
                <p className="text-[12px] text-muted">The XMLTV source provides no description for this programme.</p>
              )}
              {selectedProgramme.credits && selectedProgramme.credits.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[12px] font-semibold">Credits</h3>
                  <dl className="meta-list">
                    {selectedProgramme.credits.map((credit) => <div key={credit.id} className="contents"><dt className="capitalize">{credit.type}</dt><dd>{credit.name}</dd></div>)}
                  </dl>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-muted">This programme is no longer stored. It may have been removed by the source history cleanup.</p>
        )}
      </Dialog>
    </>
  )
}

