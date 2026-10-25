import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, isValid, parseISO } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import { Calendar, ChevronLeft, ChevronRight, Film, MapPin, Search, X } from 'lucide-react'
import { api, Programme } from '../api/client'
import { LoadingPanel } from '../components/ui/LoadingPanel'

const HOUR_WIDTH = 150
const STATION_WIDTH = 220
const HOURS_PER_DAY = 24
const CHANNELS_PER_PAGE = 40

export function EPGView() {
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
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | null>(null)
  const [now, setNow] = useState(() => new Date())
  const modalCloseRef = useRef<HTMLButtonElement>(null)
  const lastFocusedElement = useRef<HTMLElement | null>(null)

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

  const { data: sources = [] } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })

  const { data: channelData, isLoading: channelsLoading, isError: channelsError, error: channelsErrorValue, refetch: refetchChannels } = useQuery({
    queryKey: ['channels', selectedSource, search],
    queryFn: () => api.channels({
      source_id: selectedSource ?? undefined,
      search: search.trim() || undefined,
    }),
  })
  const allChannels = channelData ?? []

  const pageCount = Math.max(1, Math.ceil(allChannels.length / CHANNELS_PER_PAGE))
  const currentPage = Math.min(page, pageCount)
  const channels = useMemo(() => allChannels.slice((currentPage - 1) * CHANNELS_PER_PAGE, currentPage * CHANNELS_PER_PAGE), [allChannels, currentPage])
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
    if (selectedProgrammeId === null) {
      lastFocusedElement.current?.focus()
      lastFocusedElement.current = null
      return
    }
    modalCloseRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSelectedProgrammeId(null)
        return
      }
      if (event.key !== 'Tab') return
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedProgrammeId])

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

  return (
    <div className="p-6 space-y-4 h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">EPG</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedDate((date) => addDays(date, -1))} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" aria-label="Previous day">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setSelectedDate(new Date())} className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Today</button>
            <button onClick={() => setSelectedDate((date) => addDays(date, 1))} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" aria-label="Next day">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-zinc-400">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedSource ?? ''}
          onChange={(event) => { setSelectedSource(event.target.value ? Number(event.target.value) : null); setPage(1) }}
          className="px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300 focus:outline-none focus:border-indigo-500/50"
          aria-label="Filter by source"
        >
          <option value="">All sources</option>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
        <label className="relative block w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(event) => { setSearchInput(event.target.value); setPage(1) }}
            placeholder="Search stations..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50"
          />
        </label>
        <span className="text-xs text-zinc-500">{allChannels.length} stations</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
          <span>{allChannels.length === 0 ? '0' : `${(currentPage - 1) * CHANNELS_PER_PAGE + 1}–${Math.min(currentPage * CHANNELS_PER_PAGE, allChannels.length)} of ${allChannels.length}`}</span>
          <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="rounded p-1 hover:bg-zinc-800 disabled:opacity-40" aria-label="Previous stations"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount} className="rounded p-1 hover:bg-zinc-800 disabled:opacity-40" aria-label="Next stations"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-zinc-900/50 border border-zinc-800 rounded-xl">
        {channelsLoading || programmesLoading ? (
          <LoadingPanel label="Loading EPG" />
        ) : channelsError || programmesError ? (
          <div role="alert" className="flex flex-col items-center gap-3 p-8 text-center text-sm text-red-300">
            <p>{channelsError ? `Could not load stations: ${(channelsErrorValue as Error).message}` : `Could not load programmes: ${(programmesErrorValue as Error).message}`}</p>
            <button type="button" onClick={() => { if (channelsError) refetchChannels(); if (programmesError) refetchProgrammes() }} className="min-h-11 rounded-lg bg-zinc-800 px-3 py-2 text-zinc-200 hover:bg-zinc-700">Retry</button>
          </div>
        ) : channels.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No stations match this filter.</div>
        ) : (
          <div className="min-w-max">
            <div className="sticky top-0 z-20 flex h-11 border-b border-zinc-800 bg-zinc-900">
              <div className="sticky left-0 z-30 flex shrink-0 items-center border-r border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-400" style={{ width: STATION_WIDTH }}>
                Station
              </div>
              <div className="relative h-full" style={{ width: HOURS_PER_DAY * HOUR_WIDTH }}>
                {Array.from({ length: HOURS_PER_DAY }, (_, hour) => (
                  <div key={hour} className="absolute inset-y-0 flex items-center border-l border-zinc-800 pl-2 text-xs text-zinc-500" style={{ left: hour * HOUR_WIDTH, width: HOUR_WIDTH }}>
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
                {nowPosition !== null && <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-amber-400" style={{ left: nowPosition }}><span className="absolute left-1 top-1 rounded bg-amber-400 px-1 text-[10px] font-semibold text-zinc-950">Now</span></div>}
              </div>
            </div>

            {channels.map((channel) => (
              <div key={channel.id} className="flex min-h-[76px] border-b border-zinc-800/80">
                <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-zinc-800 bg-zinc-900 px-3" style={{ width: STATION_WIDTH }}>
                  <span className="truncate text-sm font-medium text-zinc-200">{channel.name}</span>
                  <span className="truncate text-xs text-zinc-500">{sourceNames.get(channel.source_id) ?? channel.external_id}</span>
                </div>
                <div className="relative h-[76px] shrink-0" style={{ width: HOURS_PER_DAY * HOUR_WIDTH }}>
                  {Array.from({ length: HOURS_PER_DAY }, (_, hour) => (
                    <div key={hour} className="absolute inset-y-0 border-l border-zinc-800/50" style={{ left: hour * HOUR_WIDTH }} />
                  ))}
                  {nowPosition !== null && <div className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-amber-400/70" style={{ left: nowPosition }} />}
                  {(programmesByChannel.get(channel.id) ?? []).map((programme) => {
                    const position = getProgrammePosition(programme)
                    if (position.left >= HOURS_PER_DAY * HOUR_WIDTH || position.left + position.width <= 0) return null
                    return (
                      <button
                        key={programme.id}
                        type="button"
                        onClick={() => {
                          lastFocusedElement.current = document.activeElement as HTMLElement
                          setSelectedProgrammeId(programme.id)
                        }}
                        className="absolute inset-y-1 overflow-hidden rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 hover:bg-indigo-500/20 transition-colors"
                        style={{ left: position.left + 2, width: position.width - 4 }}
                        title={`${programme.titles?.[0]?.title || programme.subtitle || 'Untitled'} · ${format(new Date(programme.start_time), 'HH:mm')}–${format(new Date(programme.stop_time), 'HH:mm')}`}
                      >
                        <span className="block truncate text-xs font-medium text-zinc-200">{programme.titles?.[0]?.title || programme.subtitle || 'Untitled'}</span>
                        <span className="block truncate text-[10px] text-zinc-500">
                          {format(new Date(programme.start_time), 'HH:mm')}–{format(new Date(programme.stop_time), 'HH:mm')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedProgrammeId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProgrammeId(null) }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="programme-modal-title" aria-describedby="programme-modal-description" aria-busy={programmeLoading} className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {selectedProgramme?.icon_url && <img src={selectedProgramme.icon_url} alt="" className="h-28 w-20 rounded-lg object-cover" />}
                <div>
                  <h2 id="programme-modal-title" className="text-xl font-bold text-zinc-100">
                    {programmeLoading ? 'Loading programme...' : selectedProgramme?.titles?.[0]?.title || selectedProgramme?.subtitle || 'Untitled'}
                  </h2>
                  {selectedProgramme && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                      <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{format(new Date(selectedProgramme.start_time), 'PPPP, HH:mm')}–{format(new Date(selectedProgramme.stop_time), 'HH:mm')}</span>
                      {selectedProgramme.country && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{selectedProgramme.country}</span>}
                      {selectedProgramme.year && <span className="flex items-center gap-1"><Film className="h-4 w-4" />{selectedProgramme.year}</span>}
                    </div>
                  )}
                </div>
              </div>
              <button ref={modalCloseRef} type="button" onClick={() => setSelectedProgrammeId(null)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close programme details"><X className="h-5 w-5" /></button>
            </div>
            <p id="programme-modal-description" className="sr-only">Programme metadata, description and credits</p>
            {selectedProgramme?.categories && selectedProgramme.categories.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedProgramme.categories.map((category) => <span key={category.id} className="rounded-full bg-indigo-500/10 px-2 py-1 text-xs text-indigo-300">{category.category}</span>)}
              </div>
            )}
            {selectedProgramme?.description && (
              <div className="mt-5 border-t border-zinc-800 pt-4">
                <h3 className="mb-2 text-sm font-medium text-zinc-300">Description</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{selectedProgramme.description}</p>
              </div>
            )}
            {selectedProgramme?.credits && selectedProgramme.credits.length > 0 && (
              <div className="mt-5 border-t border-zinc-800 pt-4">
                <h3 className="mb-2 text-sm font-medium text-zinc-300">Credits</h3>
                <div className="space-y-1 text-sm text-zinc-400">{selectedProgramme.credits.map((credit) => <p key={credit.id}><span className="mr-2 capitalize text-zinc-500">{credit.type}</span>{credit.name}</p>)}</div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
