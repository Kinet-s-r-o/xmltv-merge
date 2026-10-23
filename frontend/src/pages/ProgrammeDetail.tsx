import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, MapPin, Calendar, Film } from 'lucide-react'
import { api } from '../api/client'

export function ProgrammeDetail() {
  const { id } = useParams<{ id: string }>()
  const programmeId = Number(id)

  const { data: programme, isLoading } = useQuery({
    queryKey: ['programme', programmeId],
    queryFn: () => api.programme(programmeId),
  })

  if (isLoading) {
    return <div className="p-6 text-zinc-500">Loading...</div>
  }

  if (!programme) {
    return <div className="p-6 text-zinc-500">Programme not found.</div>
  }

  const primaryTitle = programme.titles?.[0]?.title || programme.subtitle || 'Untitled'

  return (
    <div className="p-6 space-y-6">
      {/* Back */}
      <button className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        {programme.icon_url && (
          <img src={programme.icon_url} alt="" className="w-24 h-32 object-cover rounded-lg" />
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-zinc-100">{primaryTitle}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {format(new Date(programme.start_time), 'HH:mm')} – {format(new Date(programme.stop_time), 'HH:mm')}
            </span>
            {programme.country && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {programme.country}
              </span>
            )}
            {programme.year && (
              <span className="flex items-center gap-1">
                <Film className="w-3.5 h-3.5" /> {programme.year}
              </span>
            )}
          </div>
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
