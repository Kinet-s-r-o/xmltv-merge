import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clipboard, Download, Layers3, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { api, Channel, OutputChannel } from '../api/client'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { LoadingPanel } from '../components/ui/LoadingPanel'

const defaultItems = (): Omit<OutputChannel, 'channel_id' | 'display_name'> => ({
  include_title: true, include_subtitle: true, include_description: true, include_credits: true,
  include_categories: true, include_country: true, include_year: true, include_episode_num: true, include_icon: true,
})

const itemLabels: Array<[keyof ReturnType<typeof defaultItems>, string]> = [
  ['include_title', 'Titles'], ['include_subtitle', 'Subtitles'], ['include_description', 'Descriptions'],
  ['include_credits', 'Credits'], ['include_categories', 'Categories'], ['include_country', 'Country'],
  ['include_year', 'Year'], ['include_episode_num', 'Episode numbers'], ['include_icon', 'Programme icons'],
]

export function Outputs() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftChannels, setDraftChannels] = useState<OutputChannel[]>([])
  const [channelSearch, setChannelSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const { data: outputData, isLoading } = useQuery({ queryKey: ['outputs'], queryFn: api.outputs })
  const { data: channelData } = useQuery({ queryKey: ['channels'], queryFn: () => api.channels() })
  const { data: sourceData } = useQuery({ queryKey: ['sources'], queryFn: api.sources })
  const outputs = outputData ?? []
  const channels = channelData ?? []
  const sources = sourceData ?? []
  const sourceNames = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources])
  const selected = outputs.find((output) => output.id === selectedId)
  const publicFeedUrl = selected ? `${window.location.origin}/feeds/${selected.slug}.xml?token=${selected.public_token}` : ''

  const openOutput = async (id: number) => {
    try { const output = await api.output(id); setSelectedId(id); setDraftName(output.name); setDraftChannels(output.channels ?? []); setError(null) }
    catch (err) { setError((err as Error).message) }
  }
  const createMutation = useMutation({ mutationFn: () => api.addOutput('New output'), onSuccess: async ({ id }) => { await queryClient.invalidateQueries({ queryKey: ['outputs'] }); openOutput(id) }, onError: (err: Error) => setError(err.message) })
  const saveMutation = useMutation({ mutationFn: () => api.updateOutput(selectedId!, { name: draftName.trim(), channels: draftChannels }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['outputs'] }); setError(null) }, onError: (err: Error) => setError(err.message) })
  const deleteMutation = useMutation({ mutationFn: () => api.deleteOutput(selectedId!), onSuccess: async () => { setSelectedId(null); await queryClient.invalidateQueries({ queryKey: ['outputs'] }) }, onError: (err: Error) => setError(err.message) })

  const selectedChannelIds = useMemo(() => new Set(draftChannels.map((channel) => channel.channel_id)), [draftChannels])
  const filteredChannels = useMemo(() => {
    const query = channelSearch.trim().toLocaleLowerCase()
    return channels.filter((channel) => !query || channel.name.toLocaleLowerCase().includes(query) || channel.external_id.toLocaleLowerCase().includes(query))
  }, [channels, channelSearch])
  const toggleChannel = (channel: Channel) => {
    if (selectedChannelIds.has(channel.id)) setDraftChannels((current) => current.filter((item) => item.channel_id !== channel.id))
    else setDraftChannels((current) => [...current, { channel_id: channel.id, display_name: channel.name, ...defaultItems(), channel }])
  }
  const updateChannel = (channelId: number, patch: Partial<OutputChannel>) => setDraftChannels((current) => current.map((item) => item.channel_id === channelId ? { ...item, ...patch } : item))

  return <>
  <div className="p-6 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-zinc-100">Outputs</h1><p className="mt-1 text-sm text-zinc-400">Build aggregated XMLTV feeds from channels across your sources.</p></div>
      <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"><Plus className="h-4 w-4" /> Add output</button>
    </div>
    {error && <div role="alert" aria-live="assertive" className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error" className="rounded p-1 hover:bg-red-500/10"><X className="h-4 w-4" /></button></div>}
    {isLoading ? <div className="rounded-xl border border-zinc-800 bg-zinc-900/50"><LoadingPanel label="Loading outputs" /></div> : <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2">
        <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Configured feeds</div>
        {outputs.length === 0 ? <div className="p-4 text-sm text-zinc-500">No outputs yet. Create one to start aggregating channels.</div> : outputs.map((output) => <button key={output.id} onClick={() => openOutput(output.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${output.id === selectedId ? 'bg-indigo-500/10 text-indigo-200' : 'text-zinc-300 hover:bg-zinc-800/70'}`}><Layers3 className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{output.name}</span><span className="block text-xs text-zinc-500">{output.channel_count} channels · /{output.slug}.xml</span></span><Pencil className="h-3.5 w-3.5 text-zinc-500" /></button>)}
      </section>
      {!selected ? <section className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center"><div><Layers3 className="mx-auto mb-3 h-8 w-8 text-zinc-600" /><p className="text-sm text-zinc-400">Select an output to configure it.</p></div></section> : <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><label className="min-w-[240px] flex-1 text-xs text-zinc-400">Output name<input value={draftName} onChange={(event) => setDraftName(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-indigo-500/50 focus:outline-none" /></label><div className="flex gap-2"><button onClick={() => setConfirmDelete(true)} className="min-h-11 rounded-lg p-2 text-red-400 hover:bg-red-500/10" title="Delete output" aria-label="Delete output"><Trash2 className="h-4 w-4" /></button><a href={`/api/v1/outputs/${selected.id}/xml`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"><Download className="h-4 w-4" /> XML</a><button onClick={() => saveMutation.mutate()} disabled={!draftName.trim() || saveMutation.isPending} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"><Save className="h-4 w-4" /> {saveMutation.isPending ? 'Saving...' : 'Save changes'}</button></div><label className="w-full text-xs text-zinc-500">Customer feed URL<div className="mt-1 flex gap-2"><input readOnly value={publicFeedUrl} aria-label="Customer feed URL" className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400" /><button onClick={async () => { await navigator.clipboard.writeText(publicFeedUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2000) }} className="min-h-11 rounded-lg border border-zinc-700 px-3 text-zinc-300 hover:bg-zinc-800" title="Copy feed URL" aria-label="Copy customer feed URL"><Clipboard className="h-4 w-4" /> <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span></button><span className="sr-only" aria-live="polite">{copied ? 'Feed URL copied' : ''}</span></div></label></div>
        <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50"><div className="border-b border-zinc-800 p-4"><h2 className="text-sm font-medium text-zinc-200">Channels</h2><p className="mt-1 text-xs text-zinc-500">Choose stations from any source.</p><label className="relative mt-3 block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input type="search" value={channelSearch} onChange={(event) => setChannelSearch(event.target.value)} placeholder="Search channels..." className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-500/50 focus:outline-none" /></label></div><div className="max-h-[560px] divide-y divide-zinc-800 overflow-y-auto">{filteredChannels.map((channel) => <button key={channel.id} onClick={() => toggleChannel(channel)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-zinc-800/50"><span className={`flex h-5 w-5 items-center justify-center rounded border ${selectedChannelIds.has(channel.id) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-700 text-transparent'}`}><Check className="h-3.5 w-3.5" /></span>{channel.icon_url ? <img src={channel.icon_url} alt="" className="h-7 w-7 rounded object-contain" /> : <span className="flex h-7 w-7 items-center justify-center rounded bg-zinc-800 text-xs text-zinc-500">{channel.name[0]}</span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm text-zinc-200">{channel.name}</span><span className="block truncate text-xs text-zinc-500">{sourceNames.get(channel.source_id) ?? 'Unknown source'} · {channel.external_id}</span></span></button>)}{channels.length === 0 ? <div className="p-5 text-sm text-zinc-500">Add and import a source first.</div> : filteredChannels.length === 0 && <div className="p-5 text-sm text-zinc-500">No channels match this search.</div>}</div></div>
          <div className="space-y-3">{draftChannels.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Selected channels will appear here with their output rules.</div> : draftChannels.map((item) => <div key={item.channel_id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-200">{item.channel?.name ?? channels.find((channel) => channel.id === item.channel_id)?.name}</p><p className="text-xs text-zinc-500">{sourceNames.get(item.channel?.source_id ?? channels.find((channel) => channel.id === item.channel_id)?.source_id ?? 0) ?? 'Unknown source'} · {item.channel?.external_id ?? channels.find((channel) => channel.id === item.channel_id)?.external_id ?? ''}</p></div><button onClick={() => toggleChannel(item.channel ?? channels.find((channel) => channel.id === item.channel_id)!)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><X className="h-4 w-4" /></button></div><label className="mt-3 block text-xs text-zinc-400">Output station name<input value={item.display_name} onChange={(event) => updateChannel(item.channel_id, { display_name: event.target.value })} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-indigo-500/50 focus:outline-none" /></label><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{itemLabels.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={Boolean(item[key])} onChange={(event) => updateChannel(item.channel_id, { [key]: event.target.checked })} className="accent-indigo-500" />{label}</label>)}</div></div>)}</div>
        </div>
      </section>}
    </div>}
  </div>
  <ConfirmDialog open={confirmDelete} title="Delete output?" description={`Delete ${selected?.name ?? 'this output'} and its channel rules? This action cannot be undone.`} confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete output'} destructive onCancel={() => { if (!deleteMutation.isPending) setConfirmDelete(false) }} onConfirm={() => { deleteMutation.mutate(); setConfirmDelete(false) }} />
  </>
}
