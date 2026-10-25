import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, MapPin, Calendar, Film, RefreshCw, Tv } from 'lucide-react'
import { api } from '../api/client'
import { LoadingPanel } from '../components/ui/LoadingPanel'

export function ProgrammeDetail() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/epg'
  const programmeId = Number(id)
  const validProgrammeId = Number.isInteger(programmeId) && programmeId > 0

  const { data: programme, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['programme', programmeId],
    queryFn: () => api.programme(programmeId),
    enabled: validProgrammeId,
  })

  if (isLoading) {
    return <div className="p-6"><LoadingPanel label="Loading programme" /></div>
  }

  if (!validProgrammeId || isError || !programme) {
    return (
      <div className="space-y-4 p-6">
        <button type="button" onClick={() => navigate(backTo)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" /> Back to EPG
        </button>
        <div role={isError ? 'alert' : undefined} className="rounded-xl border border-dashed border-zinc-800 p-8 text-center">
          <p className="text-sm text-zinc-300">{isError ? `Could not load programme: ${(error as Error).message}` : 'Programme not found.'}</p>
          {isError && <button type="button" onClick={() => refetch()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"><RefreshCw className="h-4 w-4" /> Retry</button>}
        </div>
      </div>
    )
  }

  const primaryTitle = programme.titles?.[0]?.title || programme.subtitle || 'Untitled'

  return (
    <div className="p-6 space-y-6">
      {/* Back */}
      <button type="button" onClick={() => navigate(backTo)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:p-5">
        {programme.icon_url && (
          <img src={programme.icon_url} alt="" className="h-32 w-24 shrink-0 rounded-lg object-cover" />
        )}
        {!programme.icon_url && <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500"><Tv className="h-8 w-8" aria-hidden="true" /></div>}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-zinc-100">{primaryTitle}</h1>
          <div className="mt-3 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
            <span className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              {format(new Date(programme.start_time), 'EEE, MMM d · HH:mm')} – {format(new Date(programme.stop_time), 'HH:mm')}
            </span>
            {programme.country && (
              <span className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" /> {programme.country}
              </span>
            )}
            {programme.year && (
              <span className="flex items-center gap-2">
                <Film className="w-3.5 h-3.5" /> {programme.year}
              </span>
            )}
          </div>
          {programme.channel && <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><Tv className="h-3.5 w-3.5" /> {programme.channel.name} · source {programme.source_id}</p>}
          {programme.categories && programme.categories.length > 0 && (
            <div className="flex gap-2 mt-3">
              {programme.categories.map((c) => (
                <span key={c.id} className="px-2 py-0.5 text-xs bg-indigo-500/10 text-indigo-300 rounded-full">
                  {c.category}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {programme.description && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-zinc-300 mb-2">Description</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">{programme.description}</p>
        </div>
      )}

      {/* Credits */}
      {programme.credits && programme.credits.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Credits</h2>
          <div className="space-y-2">
            {programme.credits.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500 w-20 capitalize">{c.type}</span>
                <span className="text-zinc-300">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Titles */}
      {programme.titles && programme.titles.length > 1 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Titles</h2>
          <div className="space-y-1">
            {programme.titles.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500 w-8">{t.lang}</span>
                <span className="text-zinc-300">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
