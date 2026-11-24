import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Database, Download, FileUp, Link2, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react'
import { api, ApiError, CreateSourceInput, Source } from '../api/client'
import { SourceImportDialog, type SourceImportState } from '../components/sources/SourceImportDialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Dialog } from '../components/ui/Dialog'
import { useFeedback } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, usePagedRows } from '../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'
import { formatInterval, formatTimestamp, healthBadge, healthLabel, sourceHealth } from '../lib/sourceStatus'

type SourceStatusFilter = 'all' | 'healthy' | 'attention' | 'disabled'

interface SourceFormValues {
  name: string
  url: string
  intervalHours: number
  historyDays: number
}

const EMPTY_FORM: SourceFormValues = { name: '', url: '', intervalHours: 6, historyDays: 7 }

function sameForm(a: SourceFormValues, b: SourceFormValues) {
  return a.name === b.name && a.url === b.url && a.intervalHours === b.intervalHours && a.historyDays === b.historyDays
}

function matchesStatus(source: Source, filter: SourceStatusFilter) {
  const health = sourceHealth(source)
  if (filter === 'all') return true
  if (filter === 'attention') return health === 'failed' || health === 'pending'
  return health === filter
}

export function Sources() {
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<SourceFormValues>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<SourceFormValues>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [sourceSearch, setSourceSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SourceStatusFilter>('all')
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<File | null>(null)
  const [importState, setImportState] = useState<SourceImportState>({ status: 'closed' })
  const [importApplyError, setImportApplyError] = useState<string | null>(null)

  const { data, isLoading, isError, error: sourcesError, refetch } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
    refetchInterval: 30_000,
  })
  const sources = data ?? []
  const editingSource = sources.find((source) => source.id === editingId)
  const { name, url, intervalHours, historyDays } = form
  const formDirty = formOpen && !sameForm(form, initialForm)
  const setField = <K extends keyof SourceFormValues>(key: K, value: SourceFormValues[K]) => setForm((current) => ({ ...current, [key]: value }))

  const invalidateGuideData = () => {
    queryClient.invalidateQueries({ queryKey: ['sources'] })
    queryClient.invalidateQueries({ queryKey: ['channels'] })
    queryClient.invalidateQueries({ queryKey: ['programmes'] })
  }

  const resetForm = () => {
    setFormOpen(false)
    setDiscardOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setInitialForm(EMPTY_FORM)
    setFormError(null)
  }

  const openForm = (values: SourceFormValues, id: number | null) => {
    setEditingId(id)
    setForm(values)
    setInitialForm(values)
    setFormError(null)
    setDiscardOpen(false)
    setFormOpen(true)
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

  const exportMutation = useMutation({
    mutationFn: () => api.exportSources(),
    onSuccess: ({ filename, blob }) => {
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(href), 0)
      const exported = sources.filter((source) => source.source_url).length
      notify({ tone: 'success', title: 'Sources exported', message: `${filename} contains the configuration of ${exported} URL source${exported === 1 ? '' : 's'}; channels and programmes are not included.` })
    },
    onError: (err: Error) => notify({ tone: 'error', title: 'Could not export sources', message: err.message }),
  })

  const previewImport = async (file: File) => {
    importFileRef.current = file
    setImportApplyError(null)
    setImportState({ status: 'previewing', fileName: file.name })
    try {
      const plan = await api.previewSourceImport(file)
      if (importFileRef.current === file) setImportState({ status: 'ready', fileName: file.name, plan })
    } catch (err) {
      if (importFileRef.current !== file) return
      setImportState({
        status: 'invalid',
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
        details: err instanceof ApiError ? err.details : [],
      })
    }
  }

  const closeImport = () => {
    importFileRef.current = null
    setImportApplyError(null)
    setImportState({ status: 'closed' })
  }

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importSources(file),
    onSuccess: (plan) => {
      const { create, update, unchanged } = plan.summary
      notify({
        tone: 'success',
        title: 'Sources imported',
        message: `${create} new, ${update} updated, ${unchanged} unchanged. New and changed sources download on the next scheduler run.`,
      })
      closeImport()
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.details.length > 0 && importFileRef.current) {
        setImportState({ status: 'invalid', fileName: importFileRef.current.name, message: err.message, details: err.details })
      } else {
        setImportApplyError(err.message)
      }
    },
  })

  const query = sourceSearch.trim().toLocaleLowerCase()
  const filteredSources = sources.filter((source) => {
    const matchesSearch = !query || source.name.toLocaleLowerCase().includes(query) || source.source_url.toLocaleLowerCase().includes(query)
    return matchesSearch && matchesStatus(source, statusFilter)
  })

  const { visible: visibleSources, paginationProps } = usePagedRows(filteredSources, 'xmltv-sources-page-size', `${query}|${statusFilter}`)

  const handleEdit = (source: Source) => openForm({
    name: source.name,
    url: source.source_url,
    intervalHours: source.refresh_interval_minutes / 60,
    historyDays: source.history_days,
  }, source.id)

  const intervalInvalid = !Number.isFinite(intervalHours) || intervalHours < 1 || intervalHours > 168
  const historyInvalid = !Number.isFinite(historyDays) || historyDays < 1 || historyDays > 3650
  const saving = addMutation.isPending || updateMutation.isPending

  /** Every way of closing the form (Escape, backdrop, ×, Cancel) asks first when there are unsaved edits. */
  const requestCloseForm = () => {
    if (saving) return
    if (formDirty) setDiscardOpen(true)
    else resetForm()
  }

  useEffect(() => {
    if (!formDirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [formDirty])

  return (
    <>
      <PageHeader
        title="Sources"
        description="XMLTV URLs imported on a schedule. Disabled sources keep their stored guide data but are not refreshed."
      >
        <input
          ref={importInputRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void previewImport(file)
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => importInputRef.current?.click()}
          disabled={importState.status !== 'closed'}
          title="Add or update sources from an XML configuration file"
        >
          <FileUp className="h-3.5 w-3.5" aria-hidden="true" /> Import
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending || sources.length === 0}
          title="Download the source configuration as XML"
        >
          {exportMutation.isPending ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
          {exportMutation.isPending ? 'Exporting…' : 'Export'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => openForm(EMPTY_FORM, null)}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add source
        </button>
      </PageHeader>

      <SourceImportDialog
        state={importState}
        applying={importMutation.isPending}
        applyError={importApplyError}
        onClose={closeImport}
        onConfirm={() => {
          if (!importFileRef.current) return
          setImportApplyError(null)
          importMutation.mutate(importFileRef.current)
        }}
      />

      <Dialog
        open={formOpen}
        size="medium"
        busy={saving}
        title={
          <span className="inline-flex items-center gap-2">
            {editingId !== null ? <><Pencil className="h-4 w-4" aria-hidden="true" /> Edit source</> : <><Link2 className="h-4 w-4" aria-hidden="true" /> Add XMLTV source</>}
          </span>
        }
        description={editingId !== null ? `Changes apply to ${editingSource?.name ?? 'this source'} from its next refresh.` : 'The first download starts right after saving.'}
        onClose={requestCloseForm}
        initialFocusRef={nameInputRef}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={requestCloseForm} disabled={saving}>Cancel</button>
            <button
              type="submit"
              form="source-form"
              className="btn btn-primary"
              disabled={!name.trim() || !url.trim() || intervalInvalid || historyInvalid || saving || (editingId !== null && !formDirty)}
            >
              {saving ? <span className="spinner spinner-sm" aria-hidden="true" /> : editingId !== null ? <Save className="h-3.5 w-3.5" aria-hidden="true" /> : <Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
              {saving ? 'Saving…' : editingId !== null ? 'Save changes' : 'Add source'}
            </button>
          </>
        }
      >
        <form
          id="source-form"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            setFormError(null)
            const source = { name: name.trim(), url: url.trim(), refresh_interval_minutes: intervalHours * 60, history_days: historyDays }
            if (editingId !== null) updateMutation.mutate({ id: editingId, source })
            else addMutation.mutate()
          }}
        >
          {formDirty && (
            <div className="form-dirty-banner" role="status">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Unsaved changes — save them or cancel to discard.
            </div>
          )}
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <label className="field sm:col-span-2">
              Source name
              <input
                id="source-name"
                ref={nameInputRef}
                required
                className="input"
                value={name}
                onChange={(event) => setField('name', event.target.value)}
                placeholder="e.g. Provider EPG – SK"
              />
            </label>
            <label className="field sm:col-span-2">
              XMLTV URL
              <input
                required
                type="url"
                className="input font-mono"
                value={url}
                onChange={(event) => setField('url', event.target.value)}
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
                  onChange={(event) => setField('intervalHours', Number(event.target.value))}
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
                  onChange={(event) => setField('historyDays', Number(event.target.value))}
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
        </form>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        title="Discard unsaved changes?"
        description={editingId !== null
          ? `Your edits to ${editingSource?.name ?? 'this source'} have not been saved and will be lost.`
          : 'The new source has not been saved; what you entered will be lost.'}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setDiscardOpen(false)}
        onConfirm={resetForm}
      />

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
            message="Add a source with its XMLTV URL. Channels and programmes become available in the EPG grid after the first import."
          >
            <button type="button" className="btn btn-primary" onClick={() => openForm(EMPTY_FORM, null)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add source
            </button>
          </EmptyState>
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
                {visibleSources.map((source) => {
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
        {!isLoading && !isError && filteredSources.length > 0 && <Pagination {...paginationProps} itemLabel="sources" />}
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
