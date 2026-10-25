import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api } from '../api/client'
import { LoadingPanel } from '../components/ui/LoadingPanel'

export function Channels() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<number | undefined>()

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels', sourceFilter, search],
    queryFn: () => api.channels({ source_id: sourceFilter, search: search || undefined }),
  })

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Channels</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {channels?.length ?? 0} channels
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search channels..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50"
          />
        </div>
        <select
          value={sourceFilter ?? ''}
          onChange={(e) => setSourceFilter(e.target.value ? Number(e.target.value) : undefined)}
          className="px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300 focus:outline-none focus:border-indigo-500/50"
        >
          <option value="">All Sources</option>
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Channel List */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {isLoading ? (
          <LoadingPanel label="Loading channels" compact />
        ) : channels && channels.length > 0 ? (
          channels.map((ch) => (
            <div key={ch.id} className="p-4 flex items-center gap-3">
              {ch.icon_url ? (
                <img src={ch.icon_url} alt="" className="w-8 h-8 rounded object-contain" />
              ) : (
                <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">
                  {ch.name.charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-200">{ch.name}</p>
                <p className="text-xs text-zinc-500">{ch.external_id}</p>
              </div>
              <span className="text-xs text-zinc-500">
                {sources?.find((s) => s.id === ch.source_id)?.name}
              </span>
            </div>
          ))
        ) : (
          <div className="p-6 text-center text-zinc-500">No channels found.</div>
        )}
      </div>
    </div>
  )
}
