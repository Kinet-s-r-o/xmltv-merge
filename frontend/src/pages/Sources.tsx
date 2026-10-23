import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2, Clock3, CheckCircle, XCircle, RefreshCw, Trash2, Pencil, Save, X } from 'lucide-react'
import { api, CreateSourceInput, Source } from '../api/client'

export function Sources() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [intervalHours, setIntervalHours] = useState(6)
  const [historyDays, setHistoryDays] = useState(7)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { data: sources, isLoading, isError, error: sourcesError, refetch } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
    refetchInterval: 30_000,
  })

  const addMutation = useMutation({
    mutationFn: () => api.addSource({
      name: name.trim(),
      url: url.trim(),
      refresh_interval_minutes: intervalHours * 60,
      history_days: historyDays,
    }),
    onSuccess: () => {
      setName('')
      setUrl('')
      setError(null)
      setSuccess(true)
      window.setTimeout(() => setSuccess(false), 5000)
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteSource(id),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      queryClient.invalidateQueries({ queryKey: ['programmes'] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, source }: { id: number; source: CreateSourceInput }) =>
      api.updateSource(id, source),
    onSuccess: () => {
      setEditingId(null)
      setName('')
      setUrl('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const refreshMutation = useMutation({
    mutationFn: (id: number) => api.refreshSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      queryClient.invalidateQueries({ queryKey: ['programmes'] })
    },
    onError: (err: Error) => setError(err.message),
  })

  const handleDelete = (id: number, sourceName: string) => {
    if (window.confirm(`Delete source "${sourceName}" and all its channels and programmes? This cannot be undone.`)) {
      setError(null)
      deleteMutation.mutate(id)
    }
  }

  const handleEdit = (source: Source) => {
    setEditingId(source.id)
    setName(source.name)
    setUrl(source.source_url)
    setIntervalHours(source.refresh_interval_minutes / 60)
    setHistoryDays(source.history_days)
    setError(null)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Sources</h1>
        <p className="text-sm text-zinc-400 mt-1">Add XMLTV URLs and schedule automatic updates</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (editingId !== null) {
            updateMutation.mutate({
              id: editingId,
              source: { name: name.trim(), url: url.trim(), refresh_interval_minutes: intervalHours * 60, history_days: historyDays },
            })
          } else {
            addMutation.mutate()
          }
        }}
        className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-zinc-400 space-y-2">
            Source name
            <input
              required
              value={name}
              onChange={(e) => { setName(e.target.value); setSuccess(false) }}
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
              onChange={(e) => { setUrl(e.target.value); setSuccess(false) }}
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
          <label className="text-sm text-zinc-400 space-y-2">
            Keep history
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={3650}
                value={historyDays}
                onChange={(e) => setHistoryDays(Number(e.target.value))}
                className="w-24 px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-indigo-500/50"
              />
              days
            </span>
          </label>
          <button
            type="submit"
            disabled={!name.trim() || !url.trim() || intervalHours < 1 || intervalHours > 168 || historyDays < 1 || historyDays > 3650 || addMutation.isPending || updateMutation.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {editingId !== null ? <Save className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            {updateMutation.isPending ? 'Saving...' : addMutation.isPending ? 'Adding...' : editingId !== null ? 'Save changes' : 'Add source'}
          </button>
          {editingId !== null && (
            <button type="button" onClick={() => { setEditingId(null); setName(''); setUrl(''); setHistoryDays(7) }} className="px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 rounded-lg flex items-center gap-1">
              <X className="w-4 h-4" /> Cancel
            </button>
          )}
          {success && <span className="text-sm text-emerald-400">Source added; first download is scheduled.</span>}
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
        ) : isError ? (
          <div className="p-6 flex flex-wrap items-center justify-center gap-3 text-sm text-red-400">
            <span>Could not load sources: {(sourcesError as Error).message}</span>
            <button onClick={() => refetch()} className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200">
              Retry
            </button>
          </div>
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
                    {source.channel_count ?? 0} channels · {source.programme_count ?? 0} programmes · every {source.refresh_interval_minutes / 60}h · keep {source.history_days} days
                  </p>
                </div>
                <div className="flex items-center gap-4">
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
                  <button
                    type="button"
                    onClick={() => { setError(null); refreshMutation.mutate(source.id) }}
                    disabled={refreshMutation.isPending}
                    aria-label={`Refresh ${source.name} now`}
                    title="Update this source now"
                    className="p-2 rounded-lg text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending && refreshMutation.variables === source.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(source)}
                    aria-label={`Edit ${source.name}`}
                    title="Edit source"
                    className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(source.id, source.name)}
                    disabled={deleteMutation.isPending}
                    aria-label={`Delete ${source.name}`}
                    title="Delete source and its channels and programmes"
                    className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
