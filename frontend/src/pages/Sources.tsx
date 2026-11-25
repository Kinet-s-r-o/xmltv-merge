import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Database, Download, Link2, Pencil, Plus, RefreshCw, Save, Search, Square, Trash2, Upload, X } from 'lucide-react'
import { api, CreateSourceInput, Source } from '../api/client'
import { SourceImportDialog } from '../components/sources/SourceImportDialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Dialog } from '../components/ui/Dialog'
import { useFeedback } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, usePagedRows } from '../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'
import { ColumnVisibilityCell, ColumnVisibilityHeader, TableCells, TableFilterSummary, TableHeaderCells, TableSearch, useTableControls, type TableColumn } from '../components/ui/TableControls'
import { HEALTH_OPTIONS, formatInterval, formatTimestamp, healthBadge, healthLabel, sourceHealth, sourceSearchText } from '../lib/sourceStatus'
import { useConfigTransfer } from '../lib/configTransfer'
import { useTableSelection } from '../lib/tableSelection'
import { useAuth } from '../lib/auth'

const SOURCE_COLUMNS: TableColumn<Source>[] = [
  {
    id: 'name',
    label: 'Source',
    kind: 'text',
    value: (source) => source.name,
    cellClassName: 'min-w-[260px]',
    cell: (source) => (
      <>
        <span className="table-text font-semibold">{source.name}</span>
        {source.source_url && (
          <a href={source.source_url} target="_blank" rel="noreferrer" className="cell-sub data-link font-mono break-all">
            {source.source_url}
          </a>
        )}
      </>
    ),
  },
  {
    id: 'status',
    label: 'Status',
    kind: 'enum',
    value: (source) => sourceHealth(source),
    options: HEALTH_OPTIONS,
    cell: (source) => (
      <>
        <span className={healthBadge[sourceHealth(source)]}>{healthLabel[sourceHealth(source)]}</span>
        {source.refreshing && <span className="cell-sub font-mono">Refreshing…</span>}
        {!source.refreshing && source.last_import_error && <span className="cell-sub text-error-text max-w-[320px]">{source.last_import_error}</span>}
      </>
    ),
  },
  {
    id: 'last_import',
    label: 'Last import',
    kind: 'date',
    value: (source) => source.last_import_at,
    cell: (source) => <span className="table-text font-mono whitespace-nowrap">{formatTimestamp(source.last_import_at) ?? 'Never'}</span>,
  },
  {
    id: 'channels',
    label: 'Channels',
    kind: 'number',
    align: 'right',
    value: (source) => source.channel_count ?? 0,
    cell: (source) => <span className="table-text font-mono">{(source.channel_count ?? 0).toLocaleString()}</span>,
  },
  {
    id: 'programmes',
    label: 'Programmes',
    kind: 'number',
    align: 'right',
    value: (source) => source.programme_count ?? 0,
    cell: (source) => <span className="table-text font-mono">{(source.programme_count ?? 0).toLocaleString()}</span>,
  },
  {
    id: 'schedule',
    label: 'Schedule',
    kind: 'number',
    filterHint: 'refresh interval in minutes',
    value: (source) => source.refresh_interval_minutes,
    cell: (source) => (
      <>
        <span className="table-text font-mono whitespace-nowrap">every {formatInterval(source.refresh_interval_minutes)}</span>
        <span className="cell-sub font-mono">keep {source.history_days} d</span>
      </>
    ),
  },
  {
    id: 'refresh',
    label: 'Refresh',
    kind: 'enum',
    value: (source) => (source.enabled ? 'enabled' : 'disabled'),
    options: [{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }],
  },
]



interface BulkRun {
  kind: 'delete' | 'refresh'
  total: number
  done: number
  current: string
  stopping: boolean
}

const sourceId = (source: Source) => source.id

function nameList(sources: Source[], limit = 5) {
  const names = sources.slice(0, limit).map((source) => source.name).join(', ')
  return sources.length > limit ? `${names} and ${sources.length - limit} more` : names
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

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


export function Sources() {
  const { can } = useAuth()
  const canEdit = can('sources', 'edit')
  const canDelete = can('sources', 'delete')
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<SourceFormValues>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<SourceFormValues>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkRun, setBulkRun] = useState<BulkRun | null>(null)
  const bulkStopRef = useRef(false)

  const { data, isLoading, isError, error: sourcesError, refetch } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
    // Poll faster while background imports run so their result shows promptly.
    refetchInterval: (query) => (query.state.data?.some((source) => source.refreshing) ? 5_000 : 30_000),
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

  // Announce manual background imports that finished since the previous poll;
  // scheduled imports only refresh the guide data without a notice.
  const refreshingIds = useRef<Set<number>>(new Set())
  const requestedIds = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!data) return
    const finished = data.filter((source) => !source.refreshing && refreshingIds.current.has(source.id))
    refreshingIds.current = new Set(data.filter((source) => source.refreshing).map((source) => source.id))
    if (finished.length === 0) return
    queryClient.invalidateQueries({ queryKey: ['channels'] })
    queryClient.invalidateQueries({ queryKey: ['programmes'] })
    for (const source of finished) {
      if (!requestedIds.current.delete(source.id)) continue
      if (source.last_import_status === 'error') {
        notify({ tone: 'error', title: `Import of ${source.name} failed`, message: source.last_import_error || 'See the source status for details.' })
      } else {
        notify({ tone: 'success', title: `${source.name} imported`, message: 'Channels and programmes are up to date in the EPG grid.' })
      }
    }
  }, [data, notify, queryClient])

  const refreshMutation = useMutation({
    mutationFn: (source: Source) => api.refreshSource(source.id),
    onSuccess: (_, source) => {
      refreshingIds.current.add(source.id)
      requestedIds.current.add(source.id)
      notify({ tone: 'info', title: 'Refresh started', message: `${source.name} is downloading and importing its XMLTV feed in the background.` })
      queryClient.invalidateQueries({ queryKey: ['sources'] })
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

  const transfer = useConfigTransfer({
    exportFile: api.exportSources,
    preview: api.previewSourceImport,
    apply: api.importSources,
    onExported: (filename) => {
      const exported = sources.filter((source) => source.source_url).length
      notify({ tone: 'success', title: 'Sources exported', message: `${filename} contains the configuration of ${exported} URL source${exported === 1 ? '' : 's'}; channels and programmes are not included.` })
    },
    onExportError: (err) => notify({ tone: 'error', title: 'Could not export sources', message: err.message }),
    onImported: (plan) => {
      const { create, update, unchanged } = plan.summary
      notify({
        tone: 'success',
        title: 'Sources imported',
        message: `${create} new, ${update} updated, ${unchanged} unchanged. New and changed sources download on the next scheduler run.`,
      })
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
  })

  // The Refresh switch needs the activation mutation, so its cell is attached here.
  const columns = SOURCE_COLUMNS.map((column) => (column.id !== 'refresh' ? column : {
    ...column,
    cell: (source: Source) => {
      const toggling = activationMutation.isPending && activationMutation.variables?.source.id === source.id
      return (
        <span className="switch-control">
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={source.enabled}
            aria-label={`Scheduled refresh for ${source.name}`}
            title={source.enabled ? 'Disable scheduled refresh' : 'Enable scheduled refresh'}
            onClick={() => activationMutation.mutate({ source, enabled: !source.enabled })}
            disabled={toggling || !canEdit}
          />
          <span className="table-text">{source.enabled ? 'Enabled' : 'Disabled'}</span>
        </span>
      )
    },
  }))
  const table = useTableControls(sources, columns, { searchText: sourceSearchText, storageKey: 'sources' })
  const filteredSources = table.rows

  const { visible: visibleSources, paginationProps } = usePagedRows(filteredSources, 'xmltv-sources-page-size', table.resetKey)
  const selection = useTableSelection(filteredSources, visibleSources, sourceId)
  const selectedSources = selection.selectedRows
  const selectedRefreshable = selectedSources.filter((source) => source.enabled && source.source_url)
  const bulkBusy = bulkRun !== null

  /** Runs one request per source in sequence so imports do not compete; Stop ends after the current source. */
  const runBulk = async (kind: BulkRun['kind'], targets: Source[], action: (source: Source) => Promise<unknown>) => {
    bulkStopRef.current = false
    const failed: { source: Source; message: string }[] = []
    let done = 0
    for (const source of targets) {
      if (bulkStopRef.current) break
      setBulkRun({ kind, total: targets.length, done, current: source.name, stopping: false })
      try {
        await action(source)
        if (kind === 'refresh') refreshingIds.current.add(source.id)
      } catch (err) {
        failed.push({ source, message: err instanceof Error ? err.message : String(err) })
      }
      done += 1
      if (kind === 'refresh') queryClient.invalidateQueries({ queryKey: ['sources'] })
    }
    setBulkRun(null)
    invalidateGuideData()
    return { done, failed, stopped: done < targets.length }
  }

  const bulkDelete = async () => {
    const targets = selectedSources
    setBulkDeleteOpen(false)
    if (editingId !== null && targets.some((source) => source.id === editingId)) resetForm()
    const { done, failed, stopped } = await runBulk('delete', targets, (source) => api.deleteSource(source.id))
    const deleted = done - failed.length
    notify({
      tone: failed.length > 0 ? 'error' : 'success',
      title: failed.length > 0 ? `${plural(failed.length, 'source')} could not be deleted` : `${plural(deleted, 'source')} deleted`,
      message: [
        deleted > 0 ? `${plural(deleted, 'source')} and their channels and programmes were removed.` : '',
        failed.length > 0 ? `Failed: ${failed.map(({ source, message }) => `${source.name} (${message})`).join('; ')}.` : '',
        stopped ? `Stopped; ${plural(targets.length - done, 'source')} were not deleted.` : '',
      ].filter(Boolean).join(' '),
    })
  }

  const bulkRefresh = async () => {
    const targets = selectedRefreshable
    const skipped = selectedSources.length - targets.length
    const { done, failed, stopped } = await runBulk('refresh', targets, (source) => api.refreshSource(source.id))
    const queued = done - failed.length
    notify({
      tone: failed.length > 0 ? 'error' : 'info',
      title: failed.length > 0 ? `${plural(failed.length, 'source')} could not be refreshed` : `${plural(queued, 'source')} queued for refresh`,
      message: [
        queued > 0 && failed.length > 0 ? `${plural(queued, 'source')} queued.` : '',
        failed.length > 0 ? `Failed: ${failed.map(({ source, message }) => `${source.name} (${message})`).join('; ')}.` : '',
        skipped > 0 ? `${plural(skipped, 'disabled source')} skipped.` : '',
        stopped ? `Stopped; ${plural(targets.length - done, 'source')} were not refreshed.` : '',
      ].filter(Boolean).join(' ') || 'Imports run in the background; each source status updates when it finishes.',
    })
  }

  useEffect(() => {
    if (!bulkBusy) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [bulkBusy])

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
        <input {...transfer.inputProps} />
        {can('sources', 'import') && (
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={transfer.openPicker}
            disabled={transfer.state.status !== 'closed'}
            aria-label="Import sources from XML"
            title="Import sources from XML — add or update sources from a configuration file"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {can('sources', 'export') && (
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={transfer.exportNow}
            disabled={transfer.exporting || sources.length === 0}
            aria-label={transfer.exporting ? 'Exporting sources…' : 'Export sources to XML'}
            title="Export sources to XML — download the source configuration"
          >
            {transfer.exporting ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => openForm(EMPTY_FORM, null)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add source
          </button>
        )}
      </PageHeader>

      <SourceImportDialog
        state={transfer.state}
        applying={transfer.applying}
        applyError={transfer.applyError}
        onClose={transfer.close}
        onConfirm={transfer.confirm}
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
          {sources.length > 0 && (
            <TableSearch controls={table} label="Search sources by name, URL, status or import error" placeholder="Search name, URL, status or error" />
          )}
        </div>
        {sources.length > 0 && <TableFilterSummary controls={table} />}

        {(selection.count > 0 || bulkRun) && (
          <div className="bulk-bar" role="region" aria-label="Bulk actions for selected sources">
            {bulkRun ? (
              <p className="bulk-bar-status" role="status" aria-live="polite">
                <span className="spinner spinner-sm" aria-hidden="true" />
                {bulkRun.kind === 'delete' ? 'Deleting' : 'Queueing refresh'} {bulkRun.done + 1} of {bulkRun.total}: <strong>{bulkRun.current}</strong>
                {bulkRun.stopping && <span className="text-muted"> · stopping after this source</span>}
              </p>
            ) : (
              <p className="bulk-bar-status" role="status" aria-live="polite">
                <strong className="font-mono">{selection.count}</strong> of {filteredSources.length} selected
                {selection.count < filteredSources.length && (
                  <button type="button" className="btn-link" onClick={selection.selectAll}>Select all {filteredSources.length}</button>
                )}
              </p>
            )}
            <div className="bulk-bar-actions">
              {bulkRun ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  disabled={bulkRun.stopping || bulkRun.done + 1 >= bulkRun.total}
                  onClick={() => { bulkStopRef.current = true; setBulkRun((run) => run && { ...run, stopping: true }) }}
                >
                  <Square className="h-3 w-3" aria-hidden="true" /> Stop
                </button>
              ) : (
                <>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => void bulkRefresh()}
                      disabled={selectedRefreshable.length === 0}
                      title={selectedRefreshable.length < selection.count ? 'Disabled sources in the selection are skipped' : 'Download and import every selected source now, one after another'}
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" /> Download &amp; import ({selectedRefreshable.length})
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={() => setBulkDeleteOpen(true)}
                      aria-keyshortcuts="Delete"
                      title="Delete the selected sources with their channels and programmes (Delete)"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" /> Delete ({selection.count})
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary btn-xs" onClick={selection.clear}>
                    <X className="h-3 w-3" aria-hidden="true" /> Clear selection
                  </button>
                </>
              )}
            </div>
          </div>
        )}

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
            {canEdit && (
              <button type="button" className="btn btn-primary" onClick={() => openForm(EMPTY_FORM, null)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add source
              </button>
            )}
          </EmptyState>
        ) : filteredSources.length === 0 ? (
          <EmptyState icon={Search} title="No sources match the current filters" message="Change the search or column filters, or clear them to list all sources.">
            <button type="button" className="btn btn-secondary" onClick={table.clearAll}>Clear filters</button>
          </EmptyState>
        ) : (
          <div className="table-scroll" onKeyDown={bulkBusy ? undefined : selection.tableKeyDown(() => { if (canDelete) setBulkDeleteOpen(true) })}>
            <table className="data-table" aria-describedby="sources-selection-hint">
              <thead>
                <tr>
                  <th scope="col" className="cell-select">
                    <input
                      type="checkbox"
                      className="checkbox"
                      data-table-select-all
                      ref={(element) => { if (element) element.indeterminate = selection.pageState === 'some' }}
                      checked={selection.pageState === 'all'}
                      onChange={selection.togglePage}
                      disabled={bulkBusy}
                      aria-label="Select all sources on this page"
                      title="Select all on this page (Ctrl+A)"
                      aria-keyshortcuts="Control+A Meta+A"
                    />
                  </th>
                  <TableHeaderCells controls={table} />
                  <th scope="col" className="text-right" data-column-fixed="actions">Actions</th>
                  <ColumnVisibilityHeader controls={table} />
                </tr>
              </thead>
              <tbody>
                {visibleSources.map((source) => {
                  const refreshing = Boolean(source.refreshing) || (refreshMutation.isPending && refreshMutation.variables?.id === source.id)
                  return (
                    <tr key={source.id} className={selection.isSelected(source.id) ? 'is-selected' : undefined}>
                      <td className="cell-select">
                        <input
                          type="checkbox"
                          className="checkbox"
                          data-table-select-row
                          checked={selection.isSelected(source.id)}
                          onChange={() => undefined}
                          onClick={(event) => selection.toggleRow(source.id, event.shiftKey)}
                          disabled={bulkBusy}
                          aria-label={`Select ${source.name}`}
                        />
                      </td>
                      <TableCells controls={table} row={source} />
                      <td data-column-fixed="actions">
                        <div className="cell-actions">
                          {canEdit && (
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => refreshMutation.mutate(source)}
                              disabled={refreshing || bulkBusy}
                              aria-label={`Refresh ${source.name} now`}
                              title="Download and import now"
                            >
                              <RefreshCw className={`h-4 w-4${refreshing ? ' animate-spin' : ''}`} aria-hidden="true" />
                            </button>
                          )}
                          {canEdit && (
                            <button type="button" className="icon-button" onClick={() => handleEdit(source)} aria-label={`Edit ${source.name}`} title="Edit source">
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="icon-button is-danger"
                              onClick={() => setDeleteTarget(source)}
                              disabled={deleteMutation.isPending || bulkBusy}
                              aria-label={`Delete ${source.name}`}
                              title="Delete source with its channels and programmes"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                      <ColumnVisibilityCell />
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p id="sources-selection-hint" className="sr-only">
              Use the checkboxes to select sources for bulk actions. Shift+click selects a range, Ctrl+A selects the page, Delete deletes the selection.
            </p>
          </div>
        )}
        {!isLoading && !isError && filteredSources.length > 0 && <Pagination {...paginationProps} itemLabel="sources" />}
      </section>

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={`Delete ${plural(selection.count, 'source')}?`}
        description={`Deleting ${nameList(selectedSources)} also removes all of their channels and programmes and drops them from outputs. This cannot be undone.`}
        confirmLabel={`Delete ${plural(selection.count, 'source')}`}
        destructive
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => void bulkDelete()}
      />

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
