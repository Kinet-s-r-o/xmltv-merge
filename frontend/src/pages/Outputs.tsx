import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clipboard, Download, Layers3, ListVideo, Plus, Save, Search, Trash2, Upload, X } from 'lucide-react'
import { api, Channel, OutputChannel } from '../api/client'
import { OutputImportDialog } from '../components/outputs/OutputImportDialog'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useFeedback } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, LoadingState, ResourceError, errorMessage } from '../components/ui/ResourceState'
import { useConfigTransfer } from '../lib/configTransfer'
import { useAuth } from '../lib/auth'

const defaultItems = (): Omit<OutputChannel, 'channel_id' | 'display_name'> => ({
  include_title: true, include_subtitle: true, include_description: true, include_credits: true,
  include_categories: true, include_country: true, include_year: true, include_episode_num: true, include_icon: true,
})

const itemLabels: Array<[keyof ReturnType<typeof defaultItems>, string]> = [
  ['include_title', 'Titles'], ['include_subtitle', 'Subtitles'], ['include_description', 'Descriptions'],
  ['include_credits', 'Credits'], ['include_categories', 'Categories'], ['include_country', 'Country'],
  ['include_year', 'Year'], ['include_episode_num', 'Episode numbers'], ['include_icon', 'Programme icons'],
]

const minimalItems = (): ReturnType<typeof defaultItems> => ({
  include_title: true, include_subtitle: true, include_description: true, include_credits: false,
  include_categories: false, include_country: false, include_year: false, include_episode_num: false, include_icon: true,
})

const outputSnapshot = (name: string, channels: OutputChannel[]) => JSON.stringify({ name, channels })

export function Outputs() {
  const { can } = useAuth()
  const canEdit = can('outputs', 'edit')
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftChannels, setDraftChannels] = useState<OutputChannel[]>([])
  const [channelSearch, setChannelSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const { data: outputData, isLoading, isError, error, refetch } = useQuery({ queryKey: ['outputs'], queryFn: api.outputs })
  const { data: channelData } = useQuery({ queryKey: ['channels'], queryFn: () => api.channels() })
  const { data: sourceData } = useQuery({ queryKey: ['sources'], queryFn: api.sources })
  const outputs = outputData ?? []
  const channels = useMemo(() => channelData ?? [], [channelData])
  const sources = useMemo(() => sourceData ?? [], [sourceData])
  const sourceNames = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources])
  const channelsById = useMemo(() => new Map(channels.map((channel) => [channel.id, channel])), [channels])
  const selected = outputs.find((output) => output.id === selectedId)
  const publicFeedUrl = selected ? `${window.location.origin}/feeds/${selected.slug}.xml?token=${selected.public_token}` : ''

  const openOutput = async (id: number) => {
    try {
      const output = await api.output(id)
      setSelectedId(id)
      setDraftName(output.name)
      setDraftChannels(output.channels ?? [])
      setSavedSnapshot(outputSnapshot(output.name, output.channels ?? []))
      setCopied(false)
    } catch (err) {
      notify({ tone: 'error', title: 'Output could not be opened', message: (err as Error).message })
    }
  }
  const createMutation = useMutation({
    mutationFn: () => api.addOutput('New output'),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ['outputs'] })
      notify({ tone: 'success', title: 'Output created', message: 'Rename it, choose channels and save to publish the feed.' })
      openOutput(id)
    },
    onError: (err: Error) => notify({ tone: 'error', title: 'Output was not created', message: err.message }),
  })
  const saveMutation = useMutation({
    mutationFn: () => api.updateOutput(selectedId!, { name: draftName.trim(), channels: draftChannels }),
    onSuccess: async () => {
      setSavedSnapshot(outputSnapshot(draftName.trim(), draftChannels))
      await queryClient.invalidateQueries({ queryKey: ['outputs'] })
      notify({ tone: 'success', title: 'Output saved', message: `${draftName.trim()} now publishes ${draftChannels.length} channels.` })
    },
    onError: (err: Error) => notify({ tone: 'error', title: 'Changes were not saved', message: err.message }),
  })
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteOutput(selectedId!),
    onSuccess: async () => {
      notify({ tone: 'success', title: 'Output deleted', message: `${selected?.name ?? 'The output'} and its feed URL no longer exist.` })
      setSelectedId(null)
      await queryClient.invalidateQueries({ queryKey: ['outputs'] })
    },
    onError: (err: Error) => notify({ tone: 'error', title: 'Output was not deleted', message: err.message }),
  })

  const selectedChannelIds = useMemo(() => new Set(draftChannels.map((channel) => channel.channel_id)), [draftChannels])
  const filteredChannels = useMemo(() => {
    const query = channelSearch.trim().toLocaleLowerCase()
    return channels.filter((channel) => !query || channel.name.toLocaleLowerCase().includes(query) || channel.external_id.toLocaleLowerCase().includes(query))
  }, [channels, channelSearch])
  const toggleChannel = (channel: Channel) => {
    if (selectedChannelIds.has(channel.id)) setDraftChannels((current) => current.filter((item) => item.channel_id !== channel.id))
    else setDraftChannels((current) => [...current, { channel_id: channel.id, display_name: channel.name, ...defaultItems(), channel }])
  }
  const removeChannel = (channelId: number) => setDraftChannels((current) => current.filter((item) => item.channel_id !== channelId))
  const selectVisibleChannels = () => {
    const missing = filteredChannels.filter((channel) => !selectedChannelIds.has(channel.id))
    if (missing.length === 0) return
    setDraftChannels((current) => [...current, ...missing.map((channel) => ({ channel_id: channel.id, display_name: channel.name, ...defaultItems(), channel }))])
  }
  const clearVisibleChannels = () => {
    const visibleIds = new Set(filteredChannels.map((channel) => channel.id))
    setDraftChannels((current) => current.filter((item) => !visibleIds.has(item.channel_id)))
  }
  const updateChannel = (channelId: number, patch: Partial<OutputChannel>) => setDraftChannels((current) => current.map((item) => item.channel_id === channelId ? { ...item, ...patch } : item))
  const applyPreset = (preset: 'full' | 'minimal') => setDraftChannels((current) => current.map((item) => ({ ...item, ...(preset === 'full' ? defaultItems() : minimalItems()) })))
  const isDirty = Boolean(selected) && outputSnapshot(draftName, draftChannels) !== savedSnapshot

  const transfer = useConfigTransfer({
    exportFile: api.exportOutputs,
    preview: api.previewOutputImport,
    apply: api.importOutputs,
    onExported: (filename) => notify({
      tone: 'success',
      title: 'Outputs exported',
      message: `${filename} contains ${outputs.length} output${outputs.length === 1 ? '' : 's'} with their channels and field rules; feed tokens are not included.`,
    }),
    onExportError: (err) => notify({ tone: 'error', title: 'Could not export outputs', message: err.message }),
    onImported: async (plan) => {
      const { create, update, unchanged, missing_channels: missing } = plan.summary
      notify({
        tone: missing > 0 ? 'info' : 'success',
        title: 'Outputs imported',
        message: `${create} new, ${update} updated, ${unchanged} unchanged.${missing > 0 ? ` ${missing} channel${missing === 1 ? ' was' : 's were'} not found and left out.` : ''} New outputs have new feed URLs.`,
      })
      await queryClient.invalidateQueries({ queryKey: ['outputs'] })
      if (selectedId !== null && plan.items.some((item) => item.existing_id === selectedId && item.action === 'update')) openOutput(selectedId)
    },
  })

  const copyFeedUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicFeedUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      notify({ tone: 'error', title: 'Feed URL was not copied', message: 'The browser blocked clipboard access. Select the URL field and copy it manually.' })
    }
  }

  return (
    <>
      <PageHeader
        title="Outputs"
        description="Aggregated XMLTV feeds built from channels of any source. Each feed has a token-protected public URL for customers."
      >
        <input {...transfer.inputProps} />
        {can('outputs', 'import') && (
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={transfer.openPicker}
            disabled={transfer.state.status !== 'closed' || isDirty}
            aria-label="Import outputs from XML"
            title={isDirty ? 'Save or discard the changes to the open output before importing' : 'Import outputs from XML — add or update outputs from a configuration file'}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {can('outputs', 'export') && (
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={transfer.exportNow}
            disabled={transfer.exporting || outputs.length === 0}
            aria-label={transfer.exporting ? 'Exporting outputs…' : 'Export outputs to XML'}
            title="Export outputs to XML — every output's channels and field rules, without feed tokens"
          >
            {transfer.exporting ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
        {canEdit && (
          <button type="button" className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />} Add output
          </button>
        )}
      </PageHeader>

      <OutputImportDialog
        state={transfer.state}
        applying={transfer.applying}
        applyError={transfer.applyError}
        onClose={transfer.close}
        onConfirm={transfer.confirm}
      />

      {isLoading ? (
        <section className="data-panel"><LoadingState title="Loading outputs" /></section>
      ) : isError ? (
        <section className="data-panel"><ResourceError title="Outputs could not be loaded" message={errorMessage(error)} onRetry={() => refetch()} /></section>
      ) : (
        <div className="split-layout">
          <section className="data-panel" aria-labelledby="output-list-title">
            <div className="data-panel-header">
              <div>
                <h2 id="output-list-title">Configured feeds</h2>
                <p className="font-mono">{outputs.length} outputs</p>
              </div>
            </div>
            {outputs.length === 0 ? (
              <EmptyState compact icon={Layers3} title="No outputs yet" message="Add an output to combine channels from your sources into one XMLTV feed." />
            ) : (
              <ul className="feed-list">
                {outputs.map((output) => (
                  <li key={output.id}>
                    <button
                      type="button"
                      onClick={() => openOutput(output.id)}
                      className={`feed-item${output.id === selectedId ? ' is-active' : ''}`}
                      aria-current={output.id === selectedId ? 'true' : undefined}
                    >
                      <Layers3 className="h-4 w-4" aria-hidden="true" />
                      <span className="feed-item-copy">
                        <strong>{output.name}</strong>
                        <span>{output.channel_count} ch · /{output.slug}.xml</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!selected ? (
            <section className="data-panel">
              <EmptyState
                icon={Layers3}
                title="Select an output to configure it"
                message={outputs.length === 0 ? 'Create the first output with Add output. Its feed URL appears here after you open it.' : 'Choose a feed on the left to edit its name, channels and included programme fields.'}
              />
            </section>
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <section className="data-panel" aria-labelledby="output-settings-title">
                <div className="data-panel-header">
                  <div>
                    <h2 id="output-settings-title">Feed settings</h2>
                    <p>{isDirty ? 'Unsaved changes — the public feed still serves the last saved version.' : 'All changes saved.'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isDirty ? <span className="badge badge-warning">Unsaved</span> : <span className="badge badge-success">Saved</span>}
                  </div>
                </div>
                <div className="data-panel-body flex flex-col gap-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="field min-w-[220px] flex-1">
                      Output name
                      <input className="input" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {can('outputs', 'delete') && (
                        <button type="button" onClick={() => setConfirmDelete(true)} className="btn btn-danger">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                        </button>
                      )}
                      {can('outputs', 'export') && (
                        <a href={`/api/v1/outputs/${selected.id}/xml`} target="_blank" rel="noreferrer" className="btn btn-secondary">
                          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Preview XML
                        </a>
                      )}
                      {canEdit && (
                        <button type="button" onClick={() => saveMutation.mutate()} disabled={!draftName.trim() || saveMutation.isPending || !isDirty} className="btn btn-primary">
                          {saveMutation.isPending ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
                          {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                        </button>
                      )}
                    </div>
                  </div>
                  <label className="field">
                    Customer feed URL
                    <span className="url-field">
                      <input readOnly className="input" value={publicFeedUrl} onFocus={(event) => event.target.select()} />
                      <button type="button" onClick={copyFeedUrl} className="btn btn-secondary" aria-label="Copy customer feed URL">
                        <Clipboard className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
                      </button>
                    </span>
                    <span className="field-hint">Contains the access token. Share it only with the customer that receives this feed.</span>
                    <span className="sr-only" aria-live="polite">{copied ? 'Feed URL copied' : ''}</span>
                  </label>
                </div>
              </section>

              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
                <section className="data-panel" aria-labelledby="channel-picker-title">
                  <div className="data-panel-header">
                    <div>
                      <h2 id="channel-picker-title">Available channels</h2>
                      <p className="font-mono">{filteredChannels.length} shown · {draftChannels.length} selected</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className="btn btn-secondary btn-xs" onClick={selectVisibleChannels} disabled={filteredChannels.length === 0}>Select shown</button>
                      <button type="button" className="btn btn-secondary btn-xs" onClick={clearVisibleChannels} disabled={filteredChannels.length === 0}>Clear shown</button>
                    </div>
                  </div>
                  <div className="data-panel-body">
                    <label className="search-field">
                      <span className="sr-only">Search channels by name or XMLTV ID</span>
                      <Search className="h-3.5 w-3.5" aria-hidden="true" />
                      <input type="search" className="input" value={channelSearch} onChange={(event) => setChannelSearch(event.target.value)} placeholder="Search name or XMLTV ID" />
                    </label>
                  </div>
                  {channels.length === 0 ? (
                    <EmptyState compact icon={ListVideo} title="No channels imported yet" message="Add a source and wait for its first import; its channels become selectable here." />
                  ) : filteredChannels.length === 0 ? (
                    <EmptyState compact icon={Search} title="No channels match this search" message="Search matches channel names and XMLTV IDs." />
                  ) : (
                    <ul className="picker-list" aria-label="Available channels">
                      {filteredChannels.map((channel) => (
                        <li key={channel.id}>
                          <label className="picker-row">
                            <input type="checkbox" className="checkbox" checked={selectedChannelIds.has(channel.id)} onChange={() => toggleChannel(channel)} />
                            {channel.icon_url
                              ? <img src={channel.icon_url} alt="" className="channel-logo" loading="lazy" />
                              : <span className="channel-logo" aria-hidden="true">{channel.name.charAt(0).toUpperCase()}</span>}
                            <span className="picker-row-copy">
                              <strong>{channel.name}</strong>
                              <span>{sourceNames.get(channel.source_id) ?? `Source #${channel.source_id}`} · <span className="font-mono">{channel.external_id}</span></span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="data-panel" aria-labelledby="channel-rules-title">
                  <div className="data-panel-header">
                    <div>
                      <h2 id="channel-rules-title">Channels in this feed</h2>
                      <p>Output station name and programme fields written to the XML</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className="btn btn-secondary btn-xs" onClick={() => applyPreset('full')} disabled={draftChannels.length === 0}>All fields</button>
                      <button type="button" className="btn btn-secondary btn-xs" onClick={() => applyPreset('minimal')} disabled={draftChannels.length === 0}>Minimal</button>
                    </div>
                  </div>
                  {draftChannels.length === 0 ? (
                    <EmptyState compact icon={ListVideo} title="No channels in this feed" message="Tick channels in Available channels. Each one gets its own name and field rules here." />
                  ) : (
                    draftChannels.map((item) => {
                      const channel = item.channel ?? channelsById.get(item.channel_id)
                      const channelName = channel?.name ?? `Channel #${item.channel_id}`
                      return (
                        <div key={item.channel_id} className="data-panel-section">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="m-0 truncate text-[13px] font-semibold">{channelName}</p>
                              <p className="m-0 truncate text-[11px] text-muted">
                                {sourceNames.get(channel?.source_id ?? 0) ?? 'Unknown source'} · <span className="font-mono">{channel?.external_id ?? ''}</span>
                              </p>
                            </div>
                            <button type="button" className="icon-button" onClick={() => removeChannel(item.channel_id)} aria-label={`Remove ${channelName} from this output`} title="Remove from output">
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                          <label className="field mt-3">
                            Output station name
                            <input className="input" value={item.display_name} onChange={(event) => updateChannel(item.channel_id, { display_name: event.target.value })} />
                          </label>
                          <fieldset className="mt-3 border-0 p-0">
                            <legend className="mb-1 text-[11px] font-semibold text-secondary">Included programme fields</legend>
                            <div className="rule-grid">
                              {itemLabels.map(([key, label]) => (
                                <label key={key} className="check-label">
                                  <input type="checkbox" className="checkbox" checked={Boolean(item[key])} onChange={(event) => updateChannel(item.channel_id, { [key]: event.target.checked })} />
                                  {label}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        </div>
                      )
                    })
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete output?"
        description={`Delete ${selected?.name ?? 'this output'} and its channel rules? Customers using its feed URL will get an error. This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete output'}
        destructive
        busy={deleteMutation.isPending}
        onCancel={() => { if (!deleteMutation.isPending) setConfirmDelete(false) }}
        onConfirm={() => deleteMutation.mutate(undefined, { onSettled: () => setConfirmDelete(false) })}
      />
    </>
  )
}
