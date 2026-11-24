import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Database, Link2, Pencil, RefreshCw, Save, Search, Trash2, X } from 'lucide-react'
import { api, CreateSourceInput, Source } from '../api/client'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useFeedback } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'
import { formatInterval, formatTimestamp, healthBadge, healthLabel, sourceHealth } from '../lib/sourceStatus'

type SourceStatusFilter = 'all' | 'healthy' | 'attention' | 'disabled'

function matchesStatus(source: Source, filter: SourceStatusFilter) {
  const health = sourceHealth(source)
  if (filter === 'all') return true
  if (filter === 'attention') return health === 'failed' || health === 'pending'
  return health === filter
}

export function Sources() {
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [intervalHours, setIntervalHours] = useState(6)
  const [historyDays, setHistoryDays] = useState(7)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [sourceSearch, setSourceSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SourceStatusFilter>('all')
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null)

  const { data, isLoading, isError, error: sourcesError, refetch } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
    refetchInterval: 30_000,
  })
  const sources = data ?? []
  const editingSource = sources.find((source) => source.id === editingId)

  const invalidateGuideData = () => {
    queryClient.invalidateQueries({ queryKey: ['sources'] })
    queryClient.invalidateQueries({ queryKey: ['channels'] })
    queryClient.invalidateQueries({ queryKey: ['programmes'] })
  }

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setUrl('')
    setIntervalHours(6)
    setHistoryDays(7)
    setFormError(null)
  }

  const addMutation = useMutation({
    mutationFn: () => api.addSource({
      name: name.trim(),
      url: url.trim(),
      refresh_interval_minutes: intervalHours * 60,
      history_days: historyDays,
    }),
    onSuccess: () => {
      notify({ tone: 'success', title: 'Source added', message: `${name.trim()} was saved; its first XMLTV download is scheduled.` })
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, source }: { id: number; source: CreateSourceInput }) => api.updateSource(id, source),
    onSuccess: (_, { source }) => {
      notify({ tone: 'success', title: 'Source updated', message: `${source.name} uses the new URL and schedule from the next refresh.` })
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (err: Error) => setFormError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (source: Source) => api.deleteSource(source.id),
    onSuccess: (_, source) => {
      notify({ tone: 'success', title: 'Source deleted', message: `${source.name} and its channels and programmes were removed.` })
      if (editingId === source.id) resetForm()
      invalidateGuideData()
    },
    onError: (err: Error, source) => notify({ tone: 'error', title: `Could not delete ${source.name}`, message: err.message }),
  })

  const refreshMutation = useMutation({
    mutationFn: (source: Source) => api.refreshSource(source.id),
    onSuccess: (_, source) => {
      notify({ tone: 'info', title: 'Refresh started', message: `${source.name} is downloading and importing its XMLTV feed.` })
      invalidateGuideData()
    },
    onError: (err: Error, source) => notify({ tone: 'error', title: `Could not refresh ${source.name}`, message: err.message }),
  })

  const activationMutation = useMutation({
    mutationFn: ({ source, enabled }: { source: Source; enabled: boolean }) => api.setSourceEnabled(source.id, enabled),
    onSuccess: (_, { source, enabled }) => {
      notify({
        tone: 'success',
        title: enabled ? 'Source enabled' : 'Source disabled',
        message: enabled ? `${source.name} is refreshed on its schedule again.` : `${source.name} keeps its stored data but is no longer refreshed.`,
      })
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (err: Error, { source }) => notify({ tone: 'error', title: `Could not change ${source.name}`, message: err.message }),
  })

  const query = sourceSearch.trim().toLocaleLowerCase()
  const filteredSources = sources.filter((source) => {
    const matchesSearch = !query || source.name.toLocaleLowerCase().includes(query) || source.source_url.toLocaleLowerCase().includes(query)
    return matchesSearch && matchesStatus(source, statusFilter)
  })

  const handleEdit = (source: Source) => {
    setEditingId(source.id)
    setName(source.name)
    setUrl(source.source_url)
    setIntervalHours(source.refresh_interval_minutes / 60)
    setHistoryDays(source.history_days)
    setFormError(null)
    document.getElementById('source-form')?.scrollIntoView({ block: 'nearest' })
    document.getElementById('source-name')?.focus()
  }

  const intervalInvalid = !Number.isFinite(intervalHours) || intervalHours < 1 || intervalHours > 168
  const historyInvalid = !Number.isFinite(historyDays) || historyDays < 1 || historyDays > 3650
  const saving = addMutation.isPending || updateMutation.isPending

  return (
    <>
      <PageHeader
        title="Sources"
        description="XMLTV URLs imported on a schedule. Disabled sources keep their stored guide data but are not refreshed."
      />

      <section id="source-form" className="data-panel" aria-labelledby="source-form-title">
        <div className="data-panel-header">
          <div>
            <h2 id="source-form-title">{editingId !== null ? <><Pencil className="h-4 w-4" aria-hidden="true" /> Edit source</> : <><Link2 className="h-4 w-4" aria-hidden="true" /> Add XMLTV source</>}</h2>
            <p>{editingId !== null ? `Changes apply to ${editingSource?.name ?? 'this source'} from its next refresh.` : 'The first download starts right after saving.'}</p>
          </div>
        </div>
        <form
          className="data-panel-body flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            setFormError(null)
            const source = { name: name.trim(), url: url.trim(), refresh_interval_minutes: intervalHours * 60, history_days: historyDays }
            if (editingId !== null) updateMutation.mutate({ id: editingId, source })
            else addMutation.mutate()
          }}
        >
          {editingId !== null && (
            <div className="form-dirty-banner" role="status">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editing {editingSource?.name ?? 'source'} — save the changes or cancel to discard them.
            </div>
          )}
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(160px,2fr)_minmax(260px,5fr)_auto_auto]">
            <label className="field">
              Source name
              <input
                id="source-name"
                required
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Provider EPG – SK"
              />
            </label>
            <label className="field">
              XMLTV URL
              <input
                required
                type="url"
                className="input font-mono"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://provider.example/epg.xml.gz"
              />
            </label>
            <label className="field">
              Refresh interval
              <span className="field-inline">
                <input
                  type="number"
                  min={1}
                  max={168}
                  className="input input-number font-mono"
                  value={intervalHours}
                  aria-invalid={intervalInvalid || undefined}
                  aria-describedby="interval-hint"
                  onChange={(event) => setIntervalHours(Number(event.target.value))}
                />
                hours
              </span>
              <span id="interval-hint" className={intervalInvalid ? 'field-error' : 'field-hint'}>1–168 hours</span>
            </label>
            <label className="field">
              Keep history
              <span className="field-inline">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  className="input input-number font-mono"
                  value={historyDays}
                  aria-invalid={historyInvalid || undefined}
                  aria-describedby="history-hint"
                  onChange={(event) => setHistoryDays(Number(event.target.value))}
                />
                days
              </span>
              <span id="history-hint" className={historyInvalid ? 'field-error' : 'field-hint'}>1–3650 days of past programmes</span>
            </label>
          </div>
          {formError && (
            <p className="inline-alert is-error" role="alert">
              {editingId !== null ? 'Changes were not saved: ' : 'Source was not added: '}{formError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {editingId !== null && (
              <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={saving}>
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!name.trim() || !url.trim() || intervalInvalid || historyInvalid || saving}
            >
              {saving ? <span className="spinner spinner-sm" aria-hidden="true" /> : editingId !== null ? <Save className="h-3.5 w-3.5" aria-hidden="true" /> : <Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
              {saving ? 'Working…' : editingId !== null ? 'Save changes' : 'Add source'}
            </button>
          </div>
        </form>
      </section>

      <section className="data-panel" aria-labelledby="sources-table-title">
        <div className="table-panel-toolbar">
          <div>
            <h2 id="sources-table-title">Configured sources</h2>
            <p className="font-mono">{filteredSources.length} of {sources.length} shown · status refreshes every 30 s</p>
          </div>
          <div className="toolbar-filters">
            <label className="search-field w-full sm:w-64">
              <span className="sr-only">Search sources by name or URL</span>
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <input
                type="search"
                className="input"
                value={sourceSearch}
                onChange={(event) => setSourceSearch(event.target.value)}
                placeholder="Search name or URL"
              />
            </label>
            <label className="w-full sm:w-48">
              <span className="sr-only">Filter sources by status</span>
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as SourceStatusFilter)}>
                <option value="all">All statuses</option>
                <option value="healthy">Imported</option>
                <option value="attention">Failed or awaiting import</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
          </div>
        </div>

        {isLoading ? (
          <LoadingState title="Loading sources" compact />
        ) : isError ? (
          <ResourceError title="Sources could not be loaded" message={errorMessage(sourcesError)} onRetry={() => refetch()} />
        ) : sources.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No XMLTV sources configured"
            message="Add a source above with its XMLTV URL. Channels and programmes become available in the EPG grid after the first import."
          />
        ) : filteredSources.length === 0 ? (
          <EmptyState icon={Search} title="No sources match the current filters" message="Clear the search or choose All statuses.">
            <button type="button" className="btn btn-secondary" onClick={() => { setSourceSearch(''); setStatusFilter('all') }}>Clear filters</button>
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last import</th>
                  <th scope="col" className="text-right">Channels</th>
                  <th scope="col" className="text-right">Programmes</th>
                  <th scope="col">Schedule</th>
                  <th scope="col">Refresh</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSources.map((source) => {
                  const health = sourceHealth(source)
                  const toggling = activationMutation.isPending && activationMutation.variables?.source.id === source.id
                  const refreshing = refreshMutation.isPending && refreshMutation.variables?.id === source.id
                  return (
                    <tr key={source.id}>
                      <td className="min-w-[260px]">
                        <span className="table-text font-semibold">{source.name}</span>
                        {source.source_url && (
                          <a href={source.source_url} target="_blank" rel="noreferrer" className="cell-sub data-link font-mono break-all">
                            {source.source_url}
                          </a>
                        )}
                      </td>
                      <td>
                        <span className={healthBadge[health]}>{healthLabel[health]}</span>
                        {source.last_import_error && <span className="cell-sub text-error-text max-w-[320px]">{source.last_import_error}</span>}
                      </td>
                      <td><span className="table-text font-mono whitespace-nowrap">{formatTimestamp(source.last_import_at) ?? 'Never'}</span></td>
                      <td className="text-right"><span className="table-text font-mono">{(source.channel_count ?? 0).toLocaleString()}</span></td>
                      <td className="text-right"><span className="table-text font-mono">{(source.programme_count ?? 0).toLocaleString()}</span></td>
                      <td>
                        <span className="table-text font-mono whitespace-nowrap">every {formatInterval(source.refresh_interval_minutes)}</span>
                        <span className="cell-sub font-mono">keep {source.history_days} d</span>
                      </td>
                      <td>
                        <span className="switch-control">
                          <button
                            type="button"
                            role="switch"
                            className="switch"
                            aria-checked={source.enabled}
                            aria-label={`Scheduled refresh for ${source.name}`}
                            title={source.enabled ? 'Disable scheduled refresh' : 'Enable scheduled refresh'}
                            onClick={() => activationMutation.mutate({ source, enabled: !source.enabled })}
                            disabled={toggling}
                          />
                          <span className="table-text">{source.enabled ? 'Enabled' : 'Disabled'}</span>
                        </span>
                      </td>
                      <td>
                        <div className="cell-actions">
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => refreshMutation.mutate(source)}
                            disabled={refreshing}
                            aria-label={`Refresh ${source.name} now`}
                            title="Download and import now"
                          >
                            <RefreshCw className={`h-4 w-4${refreshing ? ' animate-spin' : ''}`} aria-hidden="true" />
                          </button>
                          <button type="button" className="icon-button" onClick={() => handleEdit(source)} aria-label={`Edit ${source.name}`} title="Edit source">
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="icon-button is-danger"
                            onClick={() => setDeleteTarget(source)}
                            disabled={deleteMutation.isPending}
                            aria-label={`Delete ${source.name}`}
                            title="Delete source with its channels and programmes"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete source?"
        description={`Deleting ${deleteTarget?.name ?? 'this source'} also removes all of its channels and programmes and drops them from outputs. This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete source'}
        destructive
        busy={deleteMutation.isPending}
        onCancel={() => { if (!deleteMutation.isPending) setDeleteTarget(null) }}
        onConfirm={() => {
          if (!deleteTarget) return
          deleteMutation.mutate(deleteTarget, { onSettled: () => setDeleteTarget(null) })
        }}
      />
    </>
  )
}
