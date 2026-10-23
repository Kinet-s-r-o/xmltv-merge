import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format, addDays } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api, Programme } from '../api/client'

const HOUR_HEIGHT = 60

export function EPGView() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null)

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.channels(),
  })

  const { data: programmes, isLoading } = useQuery({
    queryKey: ['programmes', selectedDate.toISOString().split('T')[0], selectedChannel],
    queryFn: () =>
      api.programmes({
        date: format(selectedDate, 'yyyy-MM-dd'),
        channel_id: selectedChannel ?? undefined,
        limit: 500,
      }),
  })
  const programmeData = programmes?.data ?? []

  const handleDateChange = (days: number) => {
    setSelectedDate((d) => addDays(d, days))
  }

  const getProgrammeHeight = (p: Programme) => {
    const start = new Date(p.start_time)
    const end = new Date(p.stop_time)
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    return Math.max(hours * HOUR_HEIGHT, 30)
  }

  const getProgrammeTop = (p: Programme) => {
    const start = new Date(p.start_time)
    const dayStart = new Date(selectedDate)
    dayStart.setHours(0, 0, 0, 0)
    const hours = (start.getTime() - dayStart.getTime()) / (1000 * 60 * 60)
    return hours * HOUR_HEIGHT
  }

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">EPG</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleDateChange(-1)} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setSelectedDate(new Date())} className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
            Today
          </button>
          <button onClick={() => handleDateChange(1)} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedChannel(null)}
          className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
            selectedChannel === null
              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All Channels
        </button>
        {channels?.map((ch) => (
          <button
            key={ch.id}
            onClick={() => setSelectedChannel(ch.id)}
            className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${
              selectedChannel === ch.id
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {ch.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto bg-zinc-900/50 border border-zinc-800 rounded-xl">
        {isLoading ? (
          <div className="p-8 text-center text-zinc-500">Loading programmes...</div>
        ) : programmeData.length > 0 ? (
          <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
            <div className="absolute left-0 top-0 w-16 h-full border-r border-zinc-800 bg-zinc-900/80">
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className="absolute left-0 w-full text-[10px] text-zinc-500 pl-2" style={{ top: i * HOUR_HEIGHT }}>
                  {String(i).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            <div className="absolute left-16 right-0 top-0 h-full">
              {programmeData.map((p) => (
                <Link
                  key={p.id}
                  to={`/programmes/${p.id}`}
                  state={{ from: '/epg' }}
                  className="absolute left-1 right-1 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 rounded-lg p-2 overflow-hidden transition-colors"
                  style={{ top: getProgrammeTop(p), height: getProgrammeHeight(p) }}
                >
                  <p className="text-xs font-medium text-zinc-200 truncate">
                    {p.titles?.[0]?.title || p.subtitle || 'Untitled'}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {format(new Date(p.start_time), 'HH:mm')} – {format(new Date(p.stop_time), 'HH:mm')}
                  </p>
                  {p.categories && p.categories.length > 0 && (
                    <span className="text-[10px] text-indigo-400">{p.categories[0].category}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-zinc-500">No programmes found for this date.</div>
        )}
      </div>
    </div>
  )
}
