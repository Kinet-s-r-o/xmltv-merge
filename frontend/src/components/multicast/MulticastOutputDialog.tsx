import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link2, Pencil, Plus, RadioTower, Save, Search, Trash2 } from 'lucide-react'
import {
  api,
  type MulticastOutput,
  type MulticastOutputInput,
  type MulticastPreview,
  type MulticastService,
  type MulticastTableMode,
  type MulticastTextEncoding,
} from '../../api/client'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { Pagination, usePagedRows } from '../ui/Pagination'
import { formatTimestamp } from '../../lib/sourceStatus'

export const EMPTY_MULTICAST_OUTPUT: MulticastOutputInput = {
  name: '',
  description: '',
  multicast_address: '',
  multicast_port: 1234,
  pid: 18,
  chunk_seconds: 30,
  timezone: 'Europe/Bratislava',
  days_ahead: 4,
  text_encoding: 'utf8',
  language_code: 'slk',
  table_mode: 'actual',
  home_transport_stream_id: null,
  include_tdt_tot: false,
  ttl: 16,
  interface: '',
  enabled: false,
  services: [],
}

/** Editable output settings plus stations; rows carry a client key for React. */
interface StationRow extends MulticastService {
  key: string
}

interface FormState extends Omit<MulticastOutputInput, 'services'> {
  services: StationRow[]
}

let rowSeq = 0
const nextKey = () => `row-${++rowSeq}`

export function toFormInput(output: MulticastOutput): MulticastOutputInput {
  const { id: _id, created_at: _c, updated_at: _u, service_count: _n, status: _s, services, ...rest } = output
  return {
    ...rest,
    services: (services ?? []).map((s) => ({
      channel_id: s.channel_id,
      source_name: s.source_name,
      external_id: s.external_id,
      display_name: s.display_name,
      frequency: s.frequency,
      transport_stream_id: s.transport_stream_id,
      original_network_id: s.original_network_id,
      service_id: s.service_id,
      enabled: s.enabled,
      missing: s.missing,
    })),
  }
}

function toFormState(input: MulticastOutputInput): FormState {
  return { ...input, services: input.services.map((s) => ({ ...s, key: nextKey() })) }
}

function toInput(form: FormState): MulticastOutputInput {
  return {
    ...form,
    name: form.name.trim(),
    description: form.description.trim(),
    multicast_address: form.multicast_address.trim(),
    language_code: form.language_code.trim().toLowerCase(),
    interface: form.interface.trim(),
    home_transport_stream_id: form.table_mode === 'actual_other' ? form.home_transport_stream_id : null,
    services: form.services.map(({ key: _key, missing: _missing, channel: _channel, ...s }) => ({ ...s, display_name: s.display_name.trim() })),
  }
}

const snapshot = (form: FormState) => JSON.stringify(toInput(form))

const ENCODINGS: Array<[MulticastTextEncoding, string]> = [
  ['utf8', 'UTF-8 (selector 0x15)'],
  ['iso8859-2', 'ISO 8859-2 Latin-2 (0x10 0x00 0x02)'],
  ['iso6937', 'ISO 6937 default table (no selector)'],
]

function timezoneOptions() {
  let zones: string[] = []
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    zones = []
  }
  if (!zones.includes('UTC')) zones = ['UTC', ...zones]
  const europe = zones.filter((z) => z.startsWith('Europe/'))
  return [...europe, ...zones.filter((z) => !z.startsWith('Europe/'))]
}

const inRange = (v: number | null, min: number, max: number) => v !== null && Number.isInteger(v) && v >= min && v <= max
const isMulticastIPv4 = (value: string) => {
  const parts = value.trim().split('.')
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false
  const first = Number(parts[0])
  return first >= 224 && first <= 239 && !(first === 224 && parts[1] === '0' && parts[2] === '0')
}

const tripletKey = (s: MulticastService) => `${s.original_network_id}/${s.transport_stream_id}/${s.service_id}`

const numberOrNull = (raw: string) => (raw.trim() === '' ? null : Number(raw))

interface MulticastOutputDialogProps {
  open: boolean
  /** Saved output being edited, or null when creating. */
  output: MulticastOutput | null
  initial: MulticastOutputInput
  saving: boolean
  error: string | null
  onSave: (input: MulticastOutputInput) => void
  onClose: () => void
}

/**
 * Create/edit dialog for a multicast output with two tabs: stream settings and
 * the station list (imported channels mapped to DVB service identifiers).
 * Closing with unsaved edits asks first.
 */
export function MulticastOutputDialog({ open, output, initial, saving, error, onSave, onClose }: MulticastOutputDialogProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial))
  const [initialSnapshot, setInitialSnapshot] = useState(() => snapshot(toFormState(initial)))
  const [tab, setTab] = useState<'settings' | 'stations'>('settings')
  const [discardOpen, setDiscardOpen] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const state = toFormState(initial)
    setForm(state)
    setInitialSnapshot(snapshot(state))
    setTab('settings')
    setDiscardOpen(false)
  }, [open, initial])

  const dirty = open && snapshot(form) !== initialSnapshot
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const requestClose = () => {
    if (saving) return
    if (dirty) setDiscardOpen(true)
    else onClose()
  }

  const timezones = useMemo(timezoneOptions, [])

  const invalid = {
    name: form.name.trim() === '',
    address: !isMulticastIPv4(form.multicast_address),
    port: !inRange(form.multicast_port, 1, 65535),
    pid: !inRange(form.pid, 16, 8190) || (form.include_tdt_tot && form.pid === 20),
    chunk: !inRange(form.chunk_seconds, 2, 300),
    days: !inRange(form.days_ahead, 1, 16),
    language: !/^[a-z]{3}$/.test(form.language_code.trim().toLowerCase()),
    home: form.table_mode === 'actual_other' && !inRange(form.home_transport_stream_id, 0, 65535),
    ttl: !inRange(form.ttl, 1, 255),
  }
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of form.services) counts.set(tripletKey(s), (counts.get(tripletKey(s)) ?? 0) + 1)
    return counts
  }, [form.services])
  const rowInvalid = (s: StationRow) =>
    !inRange(s.transport_stream_id, 0, 65535) ||
    !inRange(s.original_network_id, 0, 65535) ||
    !inRange(s.service_id, 1, 65535) ||
    (s.frequency !== null && !inRange(s.frequency, 0, 100000)) ||
    (duplicates.get(tripletKey(s)) ?? 0) > 1
  const stationsInvalid = form.services.filter(rowInvalid).length
  const settingsInvalid = Object.values(invalid).some(Boolean)
  const canSave = !saving && !settingsInvalid && stationsInvalid === 0 && (output === null || dirty)

  return (
    <>
      <Dialog
        open={open}
        size="full"
        busy={saving}
        title={
          <span className="inline-flex items-center gap-2">
            {output ? <><Pencil className="h-4 w-4" aria-hidden="true" /> Edit multicast output</> : <><RadioTower className="h-4 w-4" aria-hidden="true" /> Add multicast output</>}
          </span>
        }
        description={output
          ? `Changes to ${output.name} apply right after saving; a running stream restarts with the new settings.`
          : 'The output is created switched off. Check it with a TS dump, then switch it on in the list.'}
        onClose={requestClose}
        initialFocusRef={nameRef}
        actions={
          <>
            {error && <p className="inline-alert is-error mr-auto" role="alert">{output ? 'Changes were not saved: ' : 'Output was not added: '}{error}</p>}
            <button type="button" className="btn btn-secondary" onClick={requestClose} disabled={saving}>Cancel</button>
            <button type="submit" form="multicast-output-form" className="btn btn-primary" disabled={!canSave}>
              {saving ? <span className="spinner spinner-sm" aria-hidden="true" /> : output ? <Save className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              {saving ? 'Saving…' : output ? 'Save changes' : 'Add multicast output'}
            </button>
          </>
        }
      >
        <form
          id="multicast-output-form"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSave) onSave(toInput(form))
          }}
        >
          {dirty && (
            <div className="form-dirty-banner" role="status">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Unsaved changes — save them or cancel to discard.
            </div>
          )}
          <div className="tab-bar" role="tablist" aria-label="Multicast output sections">
            <button type="button" role="tab" id="mc-tab-settings" aria-controls="mc-panel-settings" aria-selected={tab === 'settings'}
              className={`tab-btn${tab === 'settings' ? ' is-active' : ''}`} onClick={() => setTab('settings')}>
              Stream settings{settingsInvalid && <span className="badge badge-error ml-2">Check</span>}
            </button>
            <button type="button" role="tab" id="mc-tab-stations" aria-controls="mc-panel-stations" aria-selected={tab === 'stations'}
              className={`tab-btn${tab === 'stations' ? ' is-active' : ''}`} onClick={() => setTab('stations')}>
              Stations <span className="font-mono">({form.services.length})</span>
              {stationsInvalid > 0 && <span className="badge badge-error ml-2">{stationsInvalid} invalid</span>}
            </button>
          </div>

          <div role="tabpanel" id="mc-panel-settings" aria-labelledby="mc-tab-settings" hidden={tab !== 'settings'}>
            <SettingsFields form={form} invalid={invalid} timezones={timezones} setField={setField} nameRef={nameRef} />
          </div>
          <div role="tabpanel" id="mc-panel-stations" aria-labelledby="mc-tab-stations" hidden={tab !== 'stations'}>
            <StationsEditor
              outputId={output?.id ?? null}
              rows={form.services}
              duplicates={duplicates}
              onChange={(services) => setField('services', services)}
            />
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        title="Discard unsaved changes?"
        description={output ? `Your edits to ${output.name} have not been saved and will be lost.` : 'The new multicast output has not been saved; what you entered will be lost.'}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false)
          onClose()
        }}
      />
    </>
  )
}

interface SettingsFieldsProps {
  form: FormState
  invalid: Record<string, boolean>
  timezones: string[]
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  nameRef: React.RefObject<HTMLInputElement | null>
}

function SettingsFields({ form, invalid, timezones, setField, nameRef }: SettingsFieldsProps) {
  const num = (key: 'multicast_port' | 'pid' | 'chunk_seconds' | 'days_ahead' | 'ttl') => (event: React.ChangeEvent<HTMLInputElement>) =>
    setField(key, Number(event.target.value))
  return (
    <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="field sm:col-span-2">
        Name
        <input ref={nameRef} required className="input" value={form.name} aria-invalid={invalid.name || undefined}
          onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Kablovka_new" />
      </label>
      <label className="field sm:col-span-2">
        Description
        <input className="input" value={form.description} onChange={(e) => setField('description', e.target.value)}
          placeholder="e.g. EPG for the DVB-C headend" />
      </label>
      <label className="field">
        Multicast address
        <input required className="input font-mono" value={form.multicast_address} inputMode="decimal"
          aria-invalid={invalid.address || undefined} aria-describedby="mc-address-hint"
          onChange={(e) => setField('multicast_address', e.target.value)} placeholder="233.11.22.241" />
        <span id="mc-address-hint" className={invalid.address ? 'field-error' : 'field-hint'}>IPv4 group 224.0.0.0/4, not 224.0.0.x</span>
      </label>
      <label className="field">
        Multicast port
        <input type="number" min={1} max={65535} className="input input-number font-mono" value={form.multicast_port}
          aria-invalid={invalid.port || undefined} aria-describedby="mc-port-hint" onChange={num('multicast_port')} />
        <span id="mc-port-hint" className={invalid.port ? 'field-error' : 'field-hint'}>UDP 1–65535</span>
      </label>
      <label className="field">
        EIT PID
        <input type="number" min={16} max={8190} className="input input-number font-mono" value={form.pid}
          aria-invalid={invalid.pid || undefined} aria-describedby="mc-pid-hint" onChange={num('pid')} />
        <span id="mc-pid-hint" className={invalid.pid ? 'field-error' : 'field-hint'}>16–8190; DVB standard is 18 (0x12)</span>
      </label>
      <label className="field">
        Chunk time
        <span className="field-inline">
          <input type="number" min={2} max={300} className="input input-number font-mono" value={form.chunk_seconds}
            aria-invalid={invalid.chunk || undefined} aria-describedby="mc-chunk-hint" onChange={num('chunk_seconds')} />
          s
        </span>
        <span id="mc-chunk-hint" className={invalid.chunk ? 'field-error' : 'field-hint'}>Full schedule repeats every 2–300 s; now/next every 2 s</span>
      </label>
      <label className="field">
        Days ahead
        <span className="field-inline">
          <input type="number" min={1} max={16} className="input input-number font-mono" value={form.days_ahead}
            aria-invalid={invalid.days || undefined} aria-describedby="mc-days-hint" onChange={num('days_ahead')} />
          days
        </span>
        <span id="mc-days-hint" className={invalid.days ? 'field-error' : 'field-hint'}>1–16 days of schedule from today</span>
      </label>
      <label className="field">
        Timezone
        <select className="input" value={form.timezone} onChange={(e) => setField('timezone', e.target.value)} aria-describedby="mc-tz-hint">
          {!timezones.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
          {timezones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <span id="mc-tz-hint" className="field-hint">EIT times are UTC; the zone sets the TOT local offset</span>
      </label>
      <label className="field">
        Text encoding
        <select className="input" value={form.text_encoding} onChange={(e) => setField('text_encoding', e.target.value as MulticastTextEncoding)}>
          {ENCODINGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="field">
        Language code
        <input className="input font-mono" maxLength={3} value={form.language_code} aria-invalid={invalid.language || undefined}
          aria-describedby="mc-lang-hint" onChange={(e) => setField('language_code', e.target.value)} />
        <span id="mc-lang-hint" className={invalid.language ? 'field-error' : 'field-hint'}>ISO 639-2, e.g. slk</span>
      </label>
      <label className="field">
        EIT tables
        <select className="input" value={form.table_mode} aria-describedby="mc-mode-hint"
          onChange={(e) => setField('table_mode', e.target.value as MulticastTableMode)}>
          <option value="actual">All stations as actual</option>
          <option value="actual_other">Actual + other</option>
        </select>
        <span id="mc-mode-hint" className="field-hint">
          {form.table_mode === 'actual' ? 'Each station is signalled as EIT actual with its own transport stream ID' : 'Stations in the home TS are actual, all others other'}
        </span>
      </label>
      {form.table_mode === 'actual_other' && (
        <label className="field">
          Home transport stream ID
          <input type="number" min={0} max={65535} className="input input-number font-mono" value={form.home_transport_stream_id ?? ''}
            aria-invalid={invalid.home || undefined} aria-describedby="mc-home-hint"
            onChange={(e) => setField('home_transport_stream_id', numberOrNull(e.target.value))} />
          <span id="mc-home-hint" className={invalid.home ? 'field-error' : 'field-hint'}>TSID of the mux this EIT is inserted into</span>
        </label>
      )}
      <label className="field">
        Multicast TTL
        <input type="number" min={1} max={255} className="input input-number font-mono" value={form.ttl}
          aria-invalid={invalid.ttl || undefined} aria-describedby="mc-ttl-hint" onChange={num('ttl')} />
        <span id="mc-ttl-hint" className={invalid.ttl ? 'field-error' : 'field-hint'}>1–255 router hops</span>
      </label>
      <label className="field">
        Outgoing interface
        <input className="input font-mono" value={form.interface} aria-describedby="mc-iface-hint"
          onChange={(e) => setField('interface', e.target.value)} placeholder="server default" />
        <span id="mc-iface-hint" className="field-hint">Interface name or IPv4 address; empty uses MULTICAST_INTERFACE</span>
      </label>
      <div className="field sm:col-span-2">
        Time tables
        <label className="check-label">
          <input type="checkbox" className="checkbox" checked={form.include_tdt_tot} onChange={(e) => setField('include_tdt_tot', e.target.checked)} />
          Send TDT/TOT on PID 20 (0x14) every 5 s
        </label>
        <span className={invalid.pid && form.include_tdt_tot && form.pid === 20 ? 'field-error' : 'field-hint'}>
          Leave off when the modulator already generates TDT/TOT
        </span>
      </div>
    </div>
  )
}

interface StationsEditorProps {
  outputId: number | null
  rows: StationRow[]
  duplicates: Map<string, number>
  onChange: (rows: StationRow[]) => void
}

interface StationFilters {
  name: string
  source: string
  xmlId: string
  frequency: string
  tsid: string
  onid: string
  sid: string
}

const EMPTY_FILTERS: StationFilters = { name: '', source: '', xmlId: '', frequency: '', tsid: '', onid: '', sid: '' }

function formatTime(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function StationsEditor({ outputId, rows, duplicates, onChange }: StationsEditorProps) {
  const [filters, setFilters] = useState<StationFilters>(EMPTY_FILTERS)
  const [addSourceId, setAddSourceId] = useState<number | ''>('')
  const [channelSearch, setChannelSearch] = useState('')
  const [addChannelId, setAddChannelId] = useState<number | ''>('')
  const [bulk, setBulk] = useState({ frequency: '', tsid: '', onid: '' })
  const [relinkKey, setRelinkKey] = useState<string | null>(null)

  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: () => api.sources() })
  const { data: channels, isLoading: channelsLoading } = useQuery({
    queryKey: ['channels', 'source', addSourceId],
    queryFn: () => api.channels({ source_id: Number(addSourceId) }),
    enabled: addSourceId !== '',
  })
  const { data: preview } = useQuery<MulticastPreview>({
    queryKey: ['multicast-preview', outputId],
    queryFn: () => api.multicastPreview(Number(outputId)),
    enabled: outputId !== null,
    refetchInterval: 60_000,
  })
  const previewByKey = useMemo(() => {
    const map = new Map<string, MulticastPreview['services'][number]>()
    for (const s of preview?.services ?? []) map.set(`${s.original_network_id}/${s.transport_stream_id}/${s.service_id}`, s)
    return map
  }, [preview])

  const sourceList = sources ?? []
  const sourceName = sourceList.find((s) => s.id === addSourceId)?.name ?? ''
  const search = channelSearch.trim().toLocaleLowerCase()
  const channelOptions = (channels ?? []).filter((c) => !search || c.name.toLocaleLowerCase().includes(search) || c.external_id.toLocaleLowerCase().includes(search))
  const sourceNames = Array.from(new Set(rows.map((r) => r.source_name).filter(Boolean))).sort()

  const update = (key: string, patch: Partial<StationRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const addStation = () => {
    const channel = (channels ?? []).find((c) => c.id === addChannelId)
    if (!channel) return
    const last = rows[rows.length - 1]
    const maxSid = rows.reduce((m, r) => Math.max(m, r.service_id || 0), 0)
    if (relinkKey) {
      update(relinkKey, { channel_id: channel.id, source_name: sourceName, external_id: channel.external_id, missing: false })
      setRelinkKey(null)
    } else {
      onChange([...rows, {
        key: nextKey(),
        channel_id: channel.id,
        source_name: sourceName,
        external_id: channel.external_id,
        display_name: channel.name,
        frequency: last?.frequency ?? null,
        transport_stream_id: last?.transport_stream_id ?? 1,
        original_network_id: last?.original_network_id ?? 1,
        service_id: Math.min(maxSid + 1, 65535),
        enabled: true,
      }])
    }
    setAddChannelId('')
  }

  const matches = (r: StationRow) => {
    const f = filters
    const has = (value: string, needle: string) => !needle.trim() || value.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase())
    const eq = (value: number | null, needle: string) => !needle.trim() || String(value ?? '') === needle.trim()
    return has(r.display_name, f.name) && (!f.source || r.source_name === f.source) && has(r.external_id, f.xmlId) &&
      eq(r.frequency, f.frequency) && eq(r.transport_stream_id, f.tsid) && eq(r.original_network_id, f.onid) && eq(r.service_id, f.sid)
  }
  const filtered = rows.filter(matches)
  const filterActive = Object.values(filters).some((v) => v.trim() !== '')
  const { visible, paginationProps } = usePagedRows(filtered, 'xmltv-multicast-stations-page-size', JSON.stringify(filters))

  const applyBulk = () => {
    const keys = new Set(filtered.map((r) => r.key))
    const patch: Partial<StationRow> = {}
    if (bulk.frequency.trim()) patch.frequency = Number(bulk.frequency)
    if (bulk.tsid.trim()) patch.transport_stream_id = Number(bulk.tsid)
    if (bulk.onid.trim()) patch.original_network_id = Number(bulk.onid)
    onChange(rows.map((r) => (keys.has(r.key) ? { ...r, ...patch } : r)))
    setBulk({ frequency: '', tsid: '', onid: '' })
  }

  const filterInput = (key: keyof StationFilters, label: string, mono = false) => (
    <label>
      <span className="sr-only">{label}</span>
      <input className={`input${mono ? ' font-mono' : ''}`} value={filters[key]} placeholder="Filter"
        onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))} />
    </label>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="data-panel-section">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field">
            Source
            <select className="input" value={addSourceId} onChange={(e) => { setAddSourceId(e.target.value ? Number(e.target.value) : ''); setAddChannelId('') }}>
              <option value="">Choose a source…</option>
              {sourceList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field">
            Find channel
            <span className="search-field">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <input type="search" className="input" value={channelSearch} disabled={addSourceId === ''}
                onChange={(e) => setChannelSearch(e.target.value)} placeholder="Name or XMLTV ID" />
            </span>
          </label>
          <label className="field">
            Channel
            <select className="input" value={addChannelId} disabled={addSourceId === '' || channelsLoading}
              onChange={(e) => setAddChannelId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{channelsLoading ? 'Loading channels…' : `${channelOptions.length} channel${channelOptions.length === 1 ? '' : 's'}`}</option>
              {channelOptions.slice(0, 500).map((c) => <option key={c.id} value={c.id}>{c.name} — {c.external_id}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" disabled={addChannelId === ''} onClick={addStation}>
              {relinkKey ? <><Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Link channel</> : <><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add station</>}
            </button>
            {relinkKey && <button type="button" className="btn btn-secondary" onClick={() => setRelinkKey(null)}>Cancel link</button>}
          </div>
        </div>
        <p className="field-hint mt-2">
          {relinkKey
            ? `Choose the channel for ${rows.find((r) => r.key === relinkKey)?.display_name ?? 'the station'}; its DVB identifiers stay unchanged.`
            : 'New stations copy frequency, transport stream ID and network ID from the last row and get the next free service ID. Edit them in the table.'}
        </p>
      </div>

      {filterActive && filtered.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Set values for the filtered stations">
          <p className="bulk-bar-status">Set for <strong className="font-mono">{filtered.length}</strong> shown station{filtered.length === 1 ? '' : 's'}:</p>
          <div className="bulk-bar-actions">
            <label><span className="sr-only">Frequency</span><input className="input input-number font-mono" placeholder="Frequency" value={bulk.frequency} onChange={(e) => setBulk((b) => ({ ...b, frequency: e.target.value }))} /></label>
            <label><span className="sr-only">Transport stream ID</span><input className="input input-number font-mono" placeholder="TSID" value={bulk.tsid} onChange={(e) => setBulk((b) => ({ ...b, tsid: e.target.value }))} /></label>
            <label><span className="sr-only">Network ID</span><input className="input input-number font-mono" placeholder="ONID" value={bulk.onid} onChange={(e) => setBulk((b) => ({ ...b, onid: e.target.value }))} /></label>
            <button type="button" className="btn btn-secondary btn-xs" disabled={!bulk.frequency.trim() && !bulk.tsid.trim() && !bulk.onid.trim()} onClick={applyBulk}>Apply</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="inline-alert is-warning" role="status">
          No stations yet. Choose a source and channel above; each station needs its transport stream ID, network ID and service ID from the modulator.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Channel name</th>
                <th scope="col">Source</th>
                <th scope="col">Input XML id</th>
                <th scope="col">Frequency</th>
                <th scope="col">Transport ID</th>
                <th scope="col">Network ID</th>
                <th scope="col">Service ID</th>
                <th scope="col">Now / next</th>
                <th scope="col">On</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
              <tr>
                <th scope="col">{filterInput('name', 'Filter by channel name')}</th>
                <th scope="col">
                  <label>
                    <span className="sr-only">Filter by source</span>
                    <select className="input min-w-[140px]" value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}>
                      <option value="">All sources</option>
                      {sourceNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </th>
                <th scope="col">{filterInput('xmlId', 'Filter by XMLTV id', true)}</th>
                <th scope="col">{filterInput('frequency', 'Filter by frequency', true)}</th>
                <th scope="col">{filterInput('tsid', 'Filter by transport stream ID', true)}</th>
                <th scope="col">{filterInput('onid', 'Filter by network ID', true)}</th>
                <th scope="col">{filterInput('sid', 'Filter by service ID', true)}</th>
                <th scope="col" />
                <th scope="col" />
                <th scope="col" className="text-right">
                  {filterActive && <button type="button" className="btn-link" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={10}><span className="table-text text-muted">No station matches the filters.</span></td></tr>
              )}
              {visible.map((r) => {
                const dup = (duplicates.get(tripletKey(r)) ?? 0) > 1
                const p = previewByKey.get(tripletKey(r))
                const numInput = (field: 'transport_stream_id' | 'original_network_id' | 'service_id', label: string, min: number) => (
                  <input type="number" min={min} max={65535} className="input input-number font-mono" value={Number.isFinite(r[field]) ? r[field] : ''}
                    aria-label={`${label} of ${r.display_name}`}
                    aria-invalid={dup || !inRange(r[field], min, 65535) || undefined}
                    title={dup ? 'Another station uses the same network / transport / service ID' : undefined}
                    onChange={(e) => update(r.key, { [field]: e.target.value === '' ? NaN : Number(e.target.value) })} />
                )
                return (
                  <tr key={r.key}>
                    <td className="min-w-[180px]">
                      <input className="input" value={r.display_name} aria-label="Channel name" onChange={(e) => update(r.key, { display_name: e.target.value })} />
                      {(r.missing || r.channel_id === null) && <span className="badge badge-error mt-1">Channel missing</span>}
                    </td>
                    <td><span className="table-text">{r.source_name || '—'}</span></td>
                    <td><span className="table-text font-mono break-all">{r.external_id}</span></td>
                    <td>
                      <input type="number" min={0} className="input input-number font-mono" value={r.frequency ?? ''} aria-label={`Frequency of ${r.display_name}`}
                        onChange={(e) => update(r.key, { frequency: numberOrNull(e.target.value) })} />
                    </td>
                    <td>{numInput('transport_stream_id', 'Transport stream ID', 0)}</td>
                    <td>{numInput('original_network_id', 'Network ID', 0)}</td>
                    <td>{numInput('service_id', 'Service ID', 1)}</td>
                    <td className="min-w-[180px]">
                      {outputId === null ? <span className="table-text text-muted">After saving</span> : !p ? <span className="table-text text-muted">Save to preview</span> : p.events === 0 ? (
                        <span className="badge badge-warning">No programmes</span>
                      ) : (
                        <>
                          <span className="table-text">{p.now ? <><span className="font-mono">{formatTime(p.now.start)}</span> {p.now.title}</> : 'Nothing on now'}</span>
                          {p.next && <span className="cell-sub"><span className="font-mono">{formatTime(p.next.start)}</span> {p.next.title}</span>}
                        </>
                      )}
                    </td>
                    <td>
                      <input type="checkbox" className="checkbox" checked={r.enabled} aria-label={`Include ${r.display_name} in the EIT`}
                        onChange={(e) => update(r.key, { enabled: e.target.checked })} />
                    </td>
                    <td>
                      <div className="cell-actions">
                        <button type="button" className="icon-button" aria-label={`Link ${r.display_name} to another channel`} title="Link to another channel"
                          onClick={() => setRelinkKey(r.key)}>
                          <Link2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="icon-button is-danger" aria-label={`Remove ${r.display_name}`} title="Remove station"
                          onClick={() => onChange(rows.filter((x) => x.key !== r.key))}>
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
      {rows.length > 0 && <Pagination {...paginationProps} itemLabel="stations" />}
      {preview && (
        <p className="field-hint">
          Saved configuration: <span className="font-mono">{preview.events.toLocaleString()}</span> events,{' '}
          <span className="font-mono">{preview.sections.toLocaleString()}</span> sections per cycle,{' '}
          <span className="font-mono">{preview.computed_kbps.toFixed(2)}</span> kbps
          {preview.truncated_events > 0 && <> · <span className="text-warning-text">{preview.truncated_events} events dropped (segment full)</span></>}
          {' '}· preview {formatTimestamp(new Date().toISOString())}
        </p>
      )}
    </div>
  )
}
