import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2, Clock3, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { api } from '../api/client'

export function Sources() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [intervalHours, setIntervalHours] = useState(6)
  const [error, setError] = useState<string | null>(null)

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
    refetchInterval: 30_000,
  })

  const addMutation = useMutation({
    mutationFn: () => api.addSource({
      name: name.trim(),
      url: url.trim(),
      refresh_interval_minutes: intervalHours * 60,
    }),
    onSuccess: () => {
      setName('')
      setUrl('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Sources</h1>
        <p className="text-sm text-zinc-400 mt-1">Add XMLTV URLs and schedule automatic updates</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); addMutation.mutate() }}
        className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-zinc-400 space-y-2">
            Source name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My EPG"
              className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50"
            />
          </label>
          <label className="text-sm text-zinc-400 space-y-2 md:col-span-2">
            XMLTV URL
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/epg.xml"
              className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-zinc-400 space-y-2">
            Update every
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={168}
                value={intervalHours}
                onChange={(e) => setIntervalHours(Number(e.target.value))}
                className="w-24 px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-indigo-500/50"
              />
              hours
            </span>
          </label>
          <button
            type="submit"
            disabled={!name.trim() || !url.trim() || intervalHours < 1 || intervalHours > 168 || addMutation.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Link2 className="w-4 h-4" />
            {addMutation.isPending ? 'Adding...' : 'Add source'}
          </button>
          {addMutation.isSuccess && <span className="text-sm text-emerald-400">Source added; first download is scheduled.</span>}
        </div>
      </form>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <XCircle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-300">Existing Sources</h2>
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-zinc-500">Loading...</div>
        ) : sources && sources.length > 0 ? (
          <div className="divide-y divide-zinc-800">
            {sources.map((source) => (
              <div key={source.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{source.name}</p>
                  {source.source_url && (
                    <a href={source.source_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300 break-all">
                      {source.source_url}
                    </a>
                  )}
                  <p className="text-xs text-zinc-500 mt-1">
                    {source.channel_count} channels · {source.programme_count} programmes · every {source.refresh_interval_minutes / 60}h
                  </p>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  <p className="flex items-center justify-end gap-1">
                    <Clock3 className="w-3 h-3" /> Last update: {source.last_import_at ? new Date(source.last_import_at).toLocaleString() : 'Pending'}
                  </p>
                  {source.last_import_status && (
                    <span className={source.last_import_status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                      {source.last_import_status === 'success' ? <CheckCircle className="inline w-3 h-3 mr-1" /> : <RefreshCw className="inline w-3 h-3 mr-1" />}
                      {source.last_import_status}
                    </span>
                  )}
                  {source.last_import_error && <p className="text-red-400 max-w-md">{source.last_import_error}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-zinc-500">No sources yet.</div>
        )}
      </div>
    </div>
  )
}
