import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { addDays, format, isSameDay, startOfDay } from 'date-fns'
import { CalendarDays, Tv } from 'lucide-react'
import { api, Channel, Programme } from '../../api/client'
import { Dialog } from '../ui/Dialog'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../ui/ResourceState'

const HOUR_WIDTH = 120
const HOURS_PER_DAY = 24
const TRACK_WIDTH = HOURS_PER_DAY * HOUR_WIDTH
/** Upper bound for one station's stored programmes; the API allows up to 20 000. */
const PROGRAMME_LIMIT = 5000

interface DaySegment {
  programme: Programme
  left: number
  width: number
}

interface StationScheduleDialogProps {
  channel: Channel | null
  sourceName?: string
  onClose: () => void
}

const programmeTitle = (programme: Programme) => programme.titles?.[0]?.title || programme.subtitle || 'Untitled programme'
const timeRange = (programme: Programme) => `${format(new Date(programme.start_time), 'HH:mm')}–${format(new Date(programme.stop_time), 'HH:mm')}`

/** Splits programmes into per-day segments (a programme crossing midnight appears on both days). */
function groupByDay(programmes: Programme[]) {
  const days = new Map<number, DaySegment[]>()
  for (const programme of programmes) {
    const start = new Date(programme.start_time)
    const stop = new Date(programme.stop_time)
    if (!(stop > start)) continue
    for (let day = startOfDay(start); day < stop; day = addDays(day, 1)) {
      const dayStart = day.getTime()
      const dayEnd = addDays(day, 1).getTime()
      const from = Math.max(start.getTime(), dayStart)
      const to = Math.min(stop.getTime(), dayEnd)
      if (to <= from) continue
      const segments = days.get(dayStart) ?? []
      segments.push({
        programme,
        left: ((from - dayStart) / 3_600_000) * HOUR_WIDTH,
        width: Math.max(((to - from) / 3_600_000) * HOUR_WIDTH, 18),
      })
      days.set(dayStart, segments)
    }
  }
  if (days.size === 0) return []
  // Show every day between the first and last one with programmes, so gaps in the guide stay visible.
  const keys = [...days.keys()].sort((a, b) => a - b)
  const result: { day: Date; segments: DaySegment[] }[] = []
  for (let day = new Date(keys[0]); day.getTime() <= keys[keys.length - 1]; day = addDays(day, 1)) {
    result.push({ day, segments: days.get(day.getTime()) ?? [] })
  }
  return result
}

/**
 * One station's schedule: days on the vertical axis, 24 hours on the horizontal
 * axis. Opens scrolled to the current time on today's row.
 */
export function StationScheduleDialog({ channel, sourceName, onClose }: StationScheduleDialogProps) {
  const [now, setNow] = useState(() => new Date())
  const channelId = channel?.id

  useEffect(() => {
    if (channelId === undefined) return
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [channelId])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['programmes', 'station', channelId],
    queryFn: () => api.programmes({ channel_id: channelId, limit: PROGRAMME_LIMIT }),
    enabled: channelId !== undefined,
  })
  const programmes = useMemo(() => data?.data ?? [], [data])
  const days = useMemo(() => groupByDay(programmes), [programmes])
  const truncated = (data?.total ?? 0) > programmes.length

  const nowX = ((now.getTime() - startOfDay(now).getTime()) / 3_600_000) * HOUR_WIDTH

  /** On mount: scroll horizontally so "now" sits one hour from the day column and bring today's row into view. */
  const scrollRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const current = new Date()
    const x = ((current.getTime() - startOfDay(current).getTime()) / 3_600_000) * HOUR_WIDTH
    element.scrollLeft = Math.max(0, x - HOUR_WIDTH)
    const todayRow = element.querySelector<HTMLElement>('[data-today="true"]')
    const header = element.querySelector<HTMLElement>('.epg-header-row')
    if (todayRow) element.scrollTop = Math.max(0, todayRow.offsetTop - (header?.offsetHeight ?? 0))
  }, [])

  const firstDay = days[0]?.day
  const lastDay = days[days.length - 1]?.day

  return (
    <Dialog
      open={channel !== null}
      size="wide"
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4" aria-hidden="true" /> {channel?.name ?? 'Station'} schedule
        </span>
      }
      description={[
        sourceName,
        channel?.external_id,
        firstDay && lastDay ? `${format(firstDay, 'd MMM')} – ${format(lastDay, 'd MMM yyyy')}` : null,
      ].filter(Boolean).join(' · ')}
    >
      {isLoading ? (
        <LoadingState title="Loading schedule" message="Fetching every stored programme of this station." compact />
      ) : isError ? (
        <ResourceError title="Schedule could not be loaded" message={errorMessage(error)} onRetry={() => refetch()} />
      ) : days.length === 0 ? (
        <EmptyState icon={Tv} title="No programmes for this station" message="Its source has no programmes stored for this channel. Check the source's last import on the Sources page." compact />
      ) : (
        <div className="station-schedule">
          {truncated && (
            <p className="inline-alert is-warning" role="status">
              Showing the first {programmes.length.toLocaleString()} of {data?.total.toLocaleString()} programmes.
            </p>
          )}
          <div className="epg-scroll station-schedule-scroll" ref={scrollRef}>
            <div className="epg-grid station-schedule-grid" aria-label={`Schedule of ${channel?.name ?? 'station'} by day`}>
              <div className="epg-header-row">
                <div className="epg-station-head">Day</div>
                <div className="epg-timeline" aria-hidden="true" data-dynamic-style style={{ width: TRACK_WIDTH }}>
                  {Array.from({ length: HOURS_PER_DAY }, (_, hour) => (
                    <div key={hour} className="epg-hour" data-dynamic-style style={{ left: hour * HOUR_WIDTH, width: HOUR_WIDTH }}>
                      {String(hour).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>
              </div>

              {days.map(({ day, segments }) => {
                const today = isSameDay(day, now)
                return (
                  <div key={day.getTime()} className={`epg-row${today ? ' is-today' : ''}`} data-today={today || undefined}>
                    <div className="epg-station">
                      <strong>{format(day, 'EEEE')}{today && <span className="badge badge-warning station-schedule-today">Today</span>}</strong>
                      <span className="font-mono">{format(day, 'd MMM yyyy')}</span>
                    </div>
                    <div className="epg-row-track" data-dynamic-style style={{ width: TRACK_WIDTH }}>
                      {Array.from({ length: HOURS_PER_DAY }, (_, hour) => (
                        <div key={hour} className="epg-hour-line" aria-hidden="true" data-dynamic-style style={{ left: hour * HOUR_WIDTH }} />
                      ))}
                      {today && (
                        <div className="epg-now-line" aria-hidden="true" data-dynamic-style style={{ left: nowX }}>
                          <span className="epg-now-label">{format(now, 'HH:mm')}</span>
                        </div>
                      )}
                      {segments.length === 0 && <span className="station-schedule-gap">No programmes stored for this day</span>}
                      {segments.map(({ programme, left, width }) => {
                        const start = new Date(programme.start_time)
                        const stop = new Date(programme.stop_time)
                        const live = now >= start && now < stop
                        const state = live ? ' is-live' : stop <= now ? ' is-past' : ''
                        const title = programmeTitle(programme)
                        return (
                          <Link
                            key={`${programme.id}-${day.getTime()}`}
                            to={`/programmes/${programme.id}`}
                            state={{ from: '/channels' }}
                            className={`epg-programme${state}`}
                            data-dynamic-style
                            style={{ left: left + 2, width: width - 4 }}
                            title={`${title} · ${format(start, 'EEE d MMM')} ${timeRange(programme)}`}
                            aria-label={`${title}, ${format(start, 'EEEE d MMMM')}, ${timeRange(programme)}${live ? ', on air now' : ''}`}
                          >
                            <span className="epg-programme-title">{title}</span>
                            <span className="epg-programme-time">{timeRange(programme)}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="epg-legend">
            <span><span className="epg-legend-swatch" aria-hidden="true" />Scheduled</span>
            <span><span className="epg-legend-swatch is-live" aria-hidden="true" />On air now</span>
            <span><span className="epg-legend-swatch is-now" aria-hidden="true" />Current time</span>
            <span className="font-mono">Times in browser local time · select a programme for full detail</span>
          </div>
        </div>
      )}
    </Dialog>
  )
}
