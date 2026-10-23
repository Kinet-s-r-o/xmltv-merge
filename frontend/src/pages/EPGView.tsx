import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format, addDays } from 'date-fns'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { api, Programme } from '../api/client'

const HOUR_WIDTH = 150
const STATION_WIDTH = 220
const HOURS_PER_DAY = 24

export function EPGView() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedSource, setSelectedSource] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const { data: sources = [] } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['channels', selectedSource, search],
    queryFn: () => api.channels({
      source_id: selectedSource ?? undefined,
      search: search.trim() || undefined,
    }),
  })

  const { data: programmes, isLoading: programmesLoading } = useQuery({
    queryKey: ['programmes', format(selectedDate, 'yyyy-MM-dd'), selectedSource],
    queryFn: () => api.programmes({
      date: format(selectedDate, 'yyyy-MM-dd'),
      source_id: selectedSource ?? undefined,
      limit: 20000,
    }),
  })

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
          <p className="text-sm text-zinc-400 mt-1">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedDate((date) => addDays(date, -1))} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" aria-label="Previous day">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setSelectedDate(new Date())} className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Today</button>
          <button onClick={() => setSelectedDate((date) => addDays(date, 1))} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" aria-label="Next day">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedSource ?? ''}
          onChange={(event) => setSelectedSource(event.target.value ? Number(event.target.value) : null)}
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
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search stations..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50"
          />
        </label>
        <span className="text-xs text-zinc-500">{channels.length} stations</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-zinc-900/50 border border-zinc-800 rounded-xl">
        {channelsLoading || programmesLoading ? (
          <div className="p-8 text-center text-zinc-500">Loading EPG...</div>
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
                  {(programmesByChannel.get(channel.id) ?? []).map((programme) => {
                    const position = getProgrammePosition(programme)
                    if (position.left >= HOURS_PER_DAY * HOUR_WIDTH || position.left + position.width <= 0) return null
                    return (
                      <Link
                        key={programme.id}
                        to={`/programmes/${programme.id}`}
                        state={{ from: '/epg' }}
                        className="absolute inset-y-1 overflow-hidden rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 hover:bg-indigo-500/20 transition-colors"
                        style={{ left: position.left + 2, width: position.width - 4 }}
                        title={`${programme.titles?.[0]?.title || programme.subtitle || 'Untitled'} · ${format(new Date(programme.start_time), 'HH:mm')}–${format(new Date(programme.stop_time), 'HH:mm')}`}
                      >
                        <span className="block truncate text-xs font-medium text-zinc-200">{programme.titles?.[0]?.title || programme.subtitle || 'Untitled'}</span>
                        <span className="block truncate text-[10px] text-zinc-500">
                          {format(new Date(programme.start_time), 'HH:mm')}–{format(new Date(programme.stop_time), 'HH:mm')}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
