import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileVideo, Pencil, Plus, RadioTower, Search, Trash2, Upload, X } from 'lucide-react'
import {
  api,
  type MulticastOutput,
  type MulticastOutputInput,
  type MulticastStatus,
  type MulticastStreamState,
} from '../api/client'
import { MulticastImportDialog } from '../components/multicast/MulticastImportDialog'
import { EMPTY_MULTICAST_OUTPUT, MulticastOutputDialog, toFormInput } from '../components/multicast/MulticastOutputDialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useFeedback } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, usePagedRows } from '../components/ui/Pagination'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'
import { saveBlob, useConfigTransfer } from '../lib/configTransfer'
import { formatTimestamp } from '../lib/sourceStatus'
import { useTableSelection } from '../lib/tableSelection'

const STATE_LABEL: Record<MulticastStreamState, string> = {
  running: 'Streaming',
  starting: 'Starting',
  error: 'Stream error',
  stopped: 'Off',
  disabled_on_server: 'Streaming disabled on server',
}

const STATE_BADGE: Record<MulticastStreamState, string> = {
  running: 'badge badge-success',
  starting: 'badge badge-warning',
  error: 'badge badge-error',
  stopped: 'badge',
  disabled_on_server: 'badge badge-warning',
}

const outputId = (o: MulticastOutput) => o.id

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function kbps(value?: number) {
  return value && value > 0 ? value.toFixed(2) : '—'
}

export function MulticastOutputs() {
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ output: MulticastOutput | null; initial: MulticastOutputInput } | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [loadingEditId, setLoadingEditId] = useState<number | null>(null)
  const [deleteTargets, setDeleteTargets] = useState<MulticastOutput[] | null>(null)
  const [dumpingId, setDumpingId] = useState<number | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['multicast-outputs'],
    queryFn: () => api.multicastOutputs(),
  })
  const { data: statusList } = useQuery({
    queryKey: ['multicast-status'],
    queryFn: () => api.multicastStatus(),
    refetchInterval: 5_000,
  })
  const outputs = data ?? []
  const statusById = useMemo(() => {
    const map = new Map<number, MulticastStatus>()
    for (const s of statusList?.outputs ?? []) map.set(s.output_id, s)
    return map
  }, [statusList])
  const statusOf = (o: MulticastOutput) => statusById.get(o.id) ?? o.status

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['multicast-outputs'] })
    queryClient.invalidateQueries({ queryKey: ['multicast-status'] })
    queryClient.invalidateQueries({ queryKey: ['multicast-preview'] })
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: MulticastOutputInput }) =>
      id === null ? api.addMulticastOutput(input).then(() => undefined) : api.updateMulticastOutput(id, input),
    onSuccess: (_, { id, input }) => {
      notify({
        tone: 'success',
        title: id === null ? 'Multicast output added' : 'Multicast output saved',
        message: id === null
          ? `${input.name} is switched off. Download a TS dump to check it, then switch it on.`
          : `${input.name} uses the new settings${input.enabled ? '; its stream restarted' : ''}.`,
      })
      setEditor(null)
      invalidate()
    },
    onError: (err: Error) => setEditorError(err.message),
  })

  const activationMutation = useMutation({
    mutationFn: ({ output, enabled }: { output: MulticastOutput; enabled: boolean }) => api.setMulticastOutputEnabled(output.id, enabled),
    onSuccess: (_, { output, enabled }) => {
      notify({
        tone: 'success',
        title: enabled ? 'Multicast output switched on' : 'Multicast output switched off',
        message: enabled
          ? `${output.name} streams EIT to ${output.multicast_address}:${output.multicast_port}${statusList && !statusList.streaming_enabled ? ' once streaming is enabled on the server' : ''}.`
          : `${output.name} stopped sending to ${output.multicast_address}:${output.multicast_port}.`,
      })
      invalidate()
    },
    onError: (err: Error, { output }) => notify({ tone: 'error', title: `Could not switch ${output.name}`, message: err.message }),
  })

  const transfer = useConfigTransfer({
    exportFile: api.exportMulticastOutputs,
    preview: api.previewMulticastImport,
    apply: api.importMulticastOutputs,
    onExported: (filename) => notify({ tone: 'success', title: 'Multicast outputs exported', message: `${filename} contains ${plural(outputs.length, 'output')} with their stations; on/off state is not included.` }),
    onExportError: (err) => notify({ tone: 'error', title: 'Could not export multicast outputs', message: err.message }),
    onImported: (plan) => {
      const { create, update, unchanged } = plan.summary
      notify({ tone: 'success', title: 'Multicast outputs imported', message: `${create} new (switched off), ${update} updated, ${unchanged} unchanged.` })
      invalidate()
    },
  })

  const query = search.trim().toLocaleLowerCase()
  const filtered = outputs.filter((o) =>
    !query || o.name.toLocaleLowerCase().includes(query) || o.description.toLocaleLowerCase().includes(query) || o.multicast_address.includes(query))
  const { visible, paginationProps } = usePagedRows(filtered, 'xmltv-multicast-page-size', query)
  const selection = useTableSelection(filtered, visible, outputId)

  const openEdit = async (output: MulticastOutput) => {
    setLoadingEditId(output.id)
    try {
      const full = await api.multicastOutput(output.id)
      setEditorError(null)
      setEditor({ output: full, initial: toFormInput(full) })
    } catch (err) {
      notify({ tone: 'error', title: `Could not open ${output.name}`, message: errorMessage(err) })
    } finally {
      setLoadingEditId(null)
    }
  }

  const openCreate = () => {
    setEditorError(null)
    setEditor({ output: null, initial: EMPTY_MULTICAST_OUTPUT })
  }

  const downloadDump = async (output: MulticastOutput) => {
    setDumpingId(output.id)
    try {
      const { filename, blob } = await api.downloadMulticastDump(output.id)
      saveBlob(blob, filename)
      notify({ tone: 'success', title: 'TS dump downloaded', message: `${filename} holds one ${output.chunk_seconds} s EIT cycle of ${output.name} for analysis with TSDuck or dvbsnoop.` })
    } catch (err) {
      notify({ tone: 'error', title: `Could not build the TS dump of ${output.name}`, message: errorMessage(err) })
    } finally {
      setDumpingId(null)
    }
  }

  const [deleting, setDeleting] = useState(false)
  const runDelete = async () => {
    const targets = deleteTargets ?? []
    setDeleting(true)
    const failed: string[] = []
    for (const o of targets) {
      try {
        await api.deleteMulticastOutput(o.id)
      } catch (err) {
        failed.push(`${o.name} (${errorMessage(err)})`)
      }
    }
    setDeleting(false)
    setDeleteTargets(null)
    selection.clear()
    invalidate()
    const deleted = targets.length - failed.length
    notify({
      tone: failed.length ? 'error' : 'success',
      title: failed.length ? `${plural(failed.length, 'multicast output')} could not be deleted` : `${plural(deleted, 'multicast output')} deleted`,
      message: [deleted ? `${plural(deleted, 'stream')} stopped and removed with their stations.` : '', failed.length ? `Failed: ${failed.join('; ')}.` : ''].filter(Boolean).join(' '),
    })
  }

  useEffect(() => {
    if (editor === null) setEditorError(null)
  }, [editor])

  return (
    <>
      <PageHeader
        title="Multicast outputs"
        description="DVB EIT streams for DVB-C modulators. Each output sends present/following and schedule tables of its stations to a UDP multicast group."
      >
        <input {...transfer.inputProps} />
        <button type="button" className="btn btn-secondary btn-icon" onClick={transfer.openPicker} disabled={transfer.state.status !== 'closed'}
          aria-label="Import multicast outputs from XML" title="Import multicast outputs from XML — add or update outputs and stations from a configuration file">
          <Upload className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-secondary btn-icon" onClick={transfer.exportNow} disabled={transfer.exporting || outputs.length === 0}
          aria-label={transfer.exporting ? 'Exporting multicast outputs…' : 'Export multicast outputs to XML'} title="Export multicast outputs to XML — download outputs with their stations">
          {transfer.exporting ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add multicast output
        </button>
      </PageHeader>

      {statusList && !statusList.streaming_enabled && (
        <p className="inline-alert is-warning" role="status">
          Streaming is disabled on this server (MULTICAST_ENABLED is not set). Outputs can be configured and checked with a TS dump, but no multicast is sent.
        </p>
      )}

      <MulticastImportDialog state={transfer.state} applying={transfer.applying} applyError={transfer.applyError} onClose={transfer.close} onConfirm={transfer.confirm} />

      <MulticastOutputDialog
        open={editor !== null}
        output={editor?.output ?? null}
        initial={editor?.initial ?? EMPTY_MULTICAST_OUTPUT}
        saving={saveMutation.isPending}
        error={editorError}
        onClose={() => setEditor(null)}
        onSave={(input) => {
          setEditorError(null)
          saveMutation.mutate({ id: editor?.output?.id ?? null, input })
        }}
      />

      <section className="data-panel" aria-labelledby="multicast-table-title">
        <div className="table-panel-toolbar">
          <div>
            <h2 id="multicast-table-title">Configured multicast outputs</h2>
            <p className="font-mono">{filtered.length} of {outputs.length} shown · stream status refreshes every 5 s</p>
          </div>
          <div className="toolbar-filters">
            <label className="search-field w-full sm:w-64">
              <span className="sr-only">Search multicast outputs by name, description or address</span>
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <input type="search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or address" />
            </label>
          </div>
        </div>

        {selection.count > 0 && (
          <div className="bulk-bar" role="region" aria-label="Bulk actions for selected multicast outputs">
            <p className="bulk-bar-status" role="status" aria-live="polite">
              <strong className="font-mono">{selection.count}</strong> of {filtered.length} selected
              {selection.count < filtered.length && <button type="button" className="btn-link" onClick={selection.selectAll}>Select all {filtered.length}</button>}
            </p>
            <div className="bulk-bar-actions">
              <button type="button" className="btn btn-danger btn-xs" aria-keyshortcuts="Delete" onClick={() => setDeleteTargets(selection.selectedRows)}
                title="Delete the selected outputs and stop their streams (Delete)">
                <Trash2 className="h-3 w-3" aria-hidden="true" /> Delete ({selection.count})
              </button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={selection.clear}>
                <X className="h-3 w-3" aria-hidden="true" /> Clear selection
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingState title="Loading multicast outputs" compact />
        ) : isError ? (
          <ResourceError title="Multicast outputs could not be loaded" message={errorMessage(error)} onRetry={() => refetch()} />
        ) : outputs.length === 0 ? (
          <EmptyState icon={RadioTower} title="No multicast outputs configured"
            message="Add an output with the multicast group of your DVB-C modulator, then map imported channels to their transport stream, network and service IDs.">
            <button type="button" className="btn btn-primary" onClick={openCreate}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add multicast output</button>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="No multicast output matches the search" message="Clear the search to see all outputs.">
            <button type="button" className="btn btn-secondary" onClick={() => setSearch('')}>Clear search</button>
          </EmptyState>
        ) : (
          <div className="table-scroll" onKeyDown={selection.tableKeyDown(() => setDeleteTargets(selection.selectedRows))}>
            <table className="data-table" aria-describedby="multicast-selection-hint">
              <thead>
                <tr>
                  <th scope="col" className="cell-select">
                    <input type="checkbox" className="checkbox" data-table-select-all
                      ref={(el) => { if (el) el.indeterminate = selection.pageState === 'some' }}
                      checked={selection.pageState === 'all'} onChange={selection.togglePage}
                      aria-label="Select all multicast outputs on this page" title="Select all on this page (Ctrl+A)" aria-keyshortcuts="Control+A Meta+A" />
                  </th>
                  <th scope="col">Name</th>
                  <th scope="col">Multicast</th>
                  <th scope="col" className="text-right">PID</th>
                  <th scope="col" className="text-right">Chunk (s)</th>
                  <th scope="col" className="text-right">Bitrate (kbps)</th>
                  <th scope="col">Timezone</th>
                  <th scope="col" className="text-right">Stations</th>
                  <th scope="col">Stream</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const st = statusOf(o)
                  const state: MulticastStreamState = st?.state ?? (o.enabled ? 'starting' : 'stopped')
                  const toggling = activationMutation.isPending && activationMutation.variables?.output.id === o.id
                  return (
                    <tr key={o.id} className={selection.isSelected(o.id) ? 'is-selected' : undefined}>
                      <td className="cell-select">
                        <input type="checkbox" className="checkbox" data-table-select-row checked={selection.isSelected(o.id)}
                          onChange={() => undefined} onClick={(e) => selection.toggleRow(o.id, e.shiftKey)} aria-label={`Select ${o.name}`} />
                      </td>
                      <td className="min-w-[200px]">
                        <span className="table-text font-semibold">{o.name}</span>
                        {o.description && <span className="cell-sub">{o.description}</span>}
                      </td>
                      <td>
                        <span className="table-text font-mono whitespace-nowrap">{o.multicast_address}:{o.multicast_port}</span>
                        <span className="cell-sub font-mono">TTL {o.ttl}{o.interface ? ` · ${o.interface}` : ''}</span>
                      </td>
                      <td className="text-right"><span className="table-text font-mono">{o.pid}</span></td>
                      <td className="text-right"><span className="table-text font-mono">{o.chunk_seconds}</span></td>
                      <td className="text-right">
                        <span className="table-text font-mono" title="Computed from the carousel">{kbps(st?.computed_kbps)}</span>
                        {state === 'running' && <span className="cell-sub font-mono" title="Measured over the last 5 s">sent {kbps(st?.measured_kbps)}</span>}
                      </td>
                      <td><span className="table-text font-mono">{o.timezone}</span></td>
                      <td className="text-right"><span className="table-text font-mono">{o.service_count}</span></td>
                      <td className="max-w-[300px]">
                        <span className={STATE_BADGE[state]}>{STATE_LABEL[state]}</span>
                        {st?.last_error && <span className="cell-sub text-error-text">{st.last_error}</span>}
                        {state === 'running' && st?.last_build_at && (
                          <span className="cell-sub font-mono">{st.events.toLocaleString()} events · built {formatTimestamp(st.last_build_at)}</span>
                        )}
                        {state === 'running' && (st?.services_without_data.length ?? 0) > 0 && (
                          <span className="cell-sub text-warning-text">No programmes: {st!.services_without_data.slice(0, 4).join(', ')}{st!.services_without_data.length > 4 ? ` and ${st!.services_without_data.length - 4} more` : ''}</span>
                        )}
                      </td>
                      <td>
                        <span className="switch-control">
                          <button type="button" role="switch" className="switch" aria-checked={o.enabled} disabled={toggling}
                            aria-label={`Stream ${o.name}`} title={o.enabled ? 'Stop streaming' : 'Start streaming'}
                            onClick={() => activationMutation.mutate({ output: o, enabled: !o.enabled })} />
                          <span className="table-text">{o.enabled ? 'On' : 'Off'}</span>
                        </span>
                      </td>
                      <td>
                        <div className="cell-actions">
                          <button type="button" className="icon-button" onClick={() => void downloadDump(o)} disabled={dumpingId === o.id}
                            aria-label={`Download TS dump of ${o.name}`} title="Download one EIT cycle as a .ts file">
                            {dumpingId === o.id ? <span className="spinner spinner-sm" aria-hidden="true" /> : <FileVideo className="h-4 w-4" aria-hidden="true" />}
                          </button>
                          <button type="button" className="icon-button" onClick={() => void openEdit(o)} disabled={loadingEditId === o.id}
                            aria-label={`Edit ${o.name}`} title="Edit settings and stations">
                            {loadingEditId === o.id ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />}
                          </button>
                          <button type="button" className="icon-button is-danger" onClick={() => setDeleteTargets([o])}
                            aria-label={`Delete ${o.name}`} title="Delete output and stop its stream">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p id="multicast-selection-hint" className="sr-only">
              Use the checkboxes to select outputs for bulk actions. Shift+click selects a range, Ctrl+A selects the page, Delete deletes the selection.
            </p>
          </div>
        )}
        {!isLoading && !isError && filtered.length > 0 && <Pagination {...paginationProps} itemLabel="multicast outputs" />}
      </section>

      <ConfirmDialog
        open={deleteTargets !== null}
        title={deleteTargets && deleteTargets.length > 1 ? `Delete ${plural(deleteTargets.length, 'multicast output')}?` : 'Delete multicast output?'}
        description={`Deleting ${(deleteTargets ?? []).map((o) => o.name).slice(0, 5).join(', ')}${(deleteTargets?.length ?? 0) > 5 ? ' and more' : ''} stops the stream and removes the station mapping. Imported channels and programmes are kept. This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting…' : deleteTargets && deleteTargets.length > 1 ? `Delete ${plural(deleteTargets.length, 'output')}` : 'Delete output'}
        destructive
        busy={deleting}
        onCancel={() => { if (!deleting) setDeleteTargets(null) }}
        onConfirm={() => void runDelete()}
      />
    </>
  )
}
