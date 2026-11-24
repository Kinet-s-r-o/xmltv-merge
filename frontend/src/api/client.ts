const API_BASE = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export interface Source {
  id: number
  name: string
  source_url: string
  enabled: boolean
  refresh_interval_minutes: number
  history_days: number
  generator_info_name?: string
  generator_info_url?: string
  last_import_at?: string
  last_import_status?: string
  last_import_error?: string
  created_at: string
  updated_at: string
  channel_count: number
  programme_count: number
}

export interface Channel {
  id: number
  source_id: number
  external_id: string
  name: string
  name_lang?: string
  icon_url?: string
  url?: string
  created_at: string
}

export interface Programme {
  id: number
  source_id: number
  channel_id: number
  start_time: string
  stop_time: string
  subtitle?: string
  subtitle_lang?: string
  description?: string
  description_lang?: string
  country?: string
  year?: number
  episode_num?: string
  episode_num_system?: string
  icon_url?: string
  created_at: string
  titles?: Title[]
  credits?: Credit[]
  categories?: Category[]
  channel?: { name: string; icon_url?: string }
}

export interface Title {
  id: number
  programme_id: number
  lang: string
  title: string
}

export interface Credit {
  id: number
  programme_id: number
  type: string
  name: string
}

export interface Category {
  id: number
  programme_id: number
  lang?: string
  category: string
}

export interface ImportResult {
  source_name: string
  channels: number
  programmes: number
  duration: string
  imported_at: string
}

export interface CreateSourceInput {
  name: string
  url: string
  refresh_interval_minutes: number
  history_days: number
}

/** Result of a configuration import row (sources and outputs share the vocabulary). */
export type ConfigImportAction = 'create' | 'update' | 'unchanged'
export type SourceImportAction = ConfigImportAction

export interface SourceImportItem {
  name: string
  url: string
  enabled: boolean
  refresh_interval_minutes: number
  history_days: number
  action: SourceImportAction
  existing_id?: number
  changes: string[]
}

export interface SourceImportPlan {
  version: string
  items: SourceImportItem[]
  summary: { create: number; update: number; unchanged: number }
  applied: boolean
}

/** API error that may carry a list of validation problems (e.g. source configuration import). */
export class ApiError extends Error {
  details: string[]
  constructor(message: string, details: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.details = details
  }
}

async function failure(res: Response): Promise<ApiError> {
  const err = await res.json().catch(() => ({ error: res.statusText }))
  return new ApiError(err.error || `HTTP ${res.status}`, Array.isArray(err.details) ? err.details : [])
}

export interface OutputImportItem {
  name: string
  slug: string
  action: ConfigImportAction
  existing_id?: number
  changes: string[]
  channel_count: number
  channels_added: number
  channels_removed: number
  channels_changed: number
  missing_channels: Array<{ source: string; id: string }>
}

export interface OutputImportPlan {
  version: string
  items: OutputImportItem[]
  summary: { create: number; update: number; unchanged: number; missing_channels: number }
  applied: boolean
}

/** Uploads a configuration file (multipart field "file") and returns the import plan. */
function uploadConfig<P extends { items: unknown[] }>(path: string, file: File): Promise<P> {
  const formData = new FormData()
  formData.append('file', file)
  return fetch(`${API_BASE}${path}`, { method: 'POST', body: formData }).then(async (res) => {
    if (!res.ok) throw await failure(res)
    const plan = (await res.json()) as P
    return { ...plan, items: plan.items ?? [] }
  })
}

/** Downloads a configuration export; resolves to the file name and contents. */
async function downloadConfig(path: string, fallbackName: string) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw await failure(res)
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName
  return { filename, blob: await res.blob() }
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface OutputChannel {
  id?: number
  output_id?: number
  channel_id: number
  display_name: string
  include_title: boolean
  include_subtitle: boolean
  include_description: boolean
  include_credits: boolean
  include_categories: boolean
  include_country: boolean
  include_year: boolean
  include_episode_num: boolean
  include_icon: boolean
  channel?: Channel
}

export interface Output {
  id: number
  name: string
  slug: string
  public_token: string
  created_at: string
  updated_at: string
  channel_count: number
  channels?: OutputChannel[]
}

export type MulticastTextEncoding = 'utf8' | 'iso8859-2' | 'iso6937'
export type MulticastTableMode = 'actual' | 'actual_other'
export type MulticastStreamState = 'stopped' | 'starting' | 'running' | 'error' | 'disabled_on_server'

export interface MulticastService {
  id?: number
  output_id?: number
  channel_id: number | null
  source_name: string
  external_id: string
  display_name: string
  frequency: number | null
  transport_stream_id: number
  original_network_id: number
  service_id: number
  enabled: boolean
  missing?: boolean
  channel?: Channel
}

export interface MulticastStatus {
  output_id: number
  state: MulticastStreamState
  last_error?: string
  started_at?: string
  last_build_at?: string
  packets_sent: number
  bytes_sent: number
  measured_kbps: number
  computed_kbps: number
  cycle_seconds: number
  sections: number
  events: number
  truncated_events: number
  services_without_data: string[]
}

export interface MulticastOutputInput {
  name: string
  description: string
  multicast_address: string
  multicast_port: number
  pid: number
  chunk_seconds: number
  timezone: string
  days_ahead: number
  text_encoding: MulticastTextEncoding
  language_code: string
  table_mode: MulticastTableMode
  home_transport_stream_id: number | null
  include_tdt_tot: boolean
  ttl: number
  interface: string
  enabled: boolean
  services: MulticastService[]
}

export interface MulticastOutput extends Omit<MulticastOutputInput, 'services'> {
  id: number
  created_at: string
  updated_at: string
  service_count: number
  services?: MulticastService[]
  status?: MulticastStatus
}

export interface MulticastStatusList {
  streaming_enabled: boolean
  outputs: MulticastStatus[]
}

export interface MulticastEventInfo {
  title: string
  start: string
  stop: string
}

export interface MulticastPreview {
  computed_kbps: number
  sections: number
  events: number
  truncated_events: number
  services: Array<{
    service_id: number
    transport_stream_id: number
    original_network_id: number
    display_name: string
    events: number
    now: MulticastEventInfo | null
    next: MulticastEventInfo | null
  }>
}

export interface MulticastImportItem {
  name: string
  action: ConfigImportAction
  existing_id?: number
  changes: string[]
  service_count: number
  missing_channels: Array<{ source: string; id: string }>
}

export interface MulticastImportPlan {
  version: string
  items: MulticastImportItem[]
  summary: { create: number; update: number; unchanged: number; missing_channels: number }
  applied: boolean
}

/** Downloads a binary file (e.g. a TS dump); resolves to the file name and contents. */
async function downloadFile(path: string, fallbackName: string) {
  return downloadConfig(path, fallbackName)
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  import: (file: File, sourceName?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (sourceName) formData.append('source_name', sourceName)
    return fetch(`${API_BASE}/import`, { method: 'POST', body: formData }).then(
      async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(err.error || `HTTP ${res.status}`)
        }
        return res.json() as Promise<ImportResult>
      },
    )
  },

  sources: () => request<Source[]>('/sources'),

  addSource: (source: CreateSourceInput) =>
    request<{ id: number; status: string }>('/sources', {
      method: 'POST',
      body: JSON.stringify(source),
    }),

  updateSource: (id: number, source: CreateSourceInput) =>
    request<void>(`/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(source),
    }),

  exportSources: () => downloadConfig('/sources/export', 'xmltv-sources.xml'),
  previewSourceImport: (file: File) => uploadConfig<SourceImportPlan>('/sources/import/preview', file),
  importSources: (file: File) => uploadConfig<SourceImportPlan>('/sources/import', file),

  deleteSource: (id: number) => request<void>(`/sources/${id}`, { method: 'DELETE' }),

  refreshSource: (id: number) => request<{ status: string }>(`/sources/${id}/refresh`, { method: 'POST' }),

  setSourceEnabled: (id: number, enabled: boolean) =>
    request<void>(`/sources/${id}/activation`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  channels: (params?: { source_id?: number; search?: string }) => {
    const qs = new URLSearchParams()
    if (params?.source_id) qs.set('source_id', String(params.source_id))
    if (params?.search) qs.set('search', params.search)
    const q = qs.toString()
    return request<Channel[]>(`/channels${q ? `?${q}` : ''}`)
  },

  outputs: () => request<Output[]>('/outputs'),
  output: (id: number) => request<Output>(`/outputs/${id}`),
  addOutput: (name: string) => request<{ id: number }>('/outputs', { method: 'POST', body: JSON.stringify({ name }) }),
  updateOutput: (id: number, output: { name: string; channels: OutputChannel[] }) => request<void>(`/outputs/${id}`, { method: 'PUT', body: JSON.stringify(output) }),
  deleteOutput: (id: number) => request<void>(`/outputs/${id}`, { method: 'DELETE' }),
  exportOutputs: () => downloadConfig('/outputs/export', 'xmltv-outputs.xml'),
  previewOutputImport: (file: File) => uploadConfig<OutputImportPlan>('/outputs/import/preview', file),
  importOutputs: (file: File) => uploadConfig<OutputImportPlan>('/outputs/import', file),

  multicastOutputs: () => request<MulticastOutput[]>('/multicast-outputs'),
  multicastOutput: (id: number) => request<MulticastOutput>(`/multicast-outputs/${id}`),
  multicastStatus: () => request<MulticastStatusList>('/multicast-outputs/status'),
  multicastPreview: (id: number) => request<MulticastPreview>(`/multicast-outputs/${id}/preview`),
  addMulticastOutput: (output: MulticastOutputInput) =>
    request<{ id: number }>('/multicast-outputs', { method: 'POST', body: JSON.stringify(output) }),
  updateMulticastOutput: (id: number, output: MulticastOutputInput) =>
    request<void>(`/multicast-outputs/${id}`, { method: 'PUT', body: JSON.stringify(output) }),
  deleteMulticastOutput: (id: number) => request<void>(`/multicast-outputs/${id}`, { method: 'DELETE' }),
  setMulticastOutputEnabled: (id: number, enabled: boolean) =>
    request<void>(`/multicast-outputs/${id}/activation`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  downloadMulticastDump: (id: number) => downloadFile(`/multicast-outputs/${id}/dump.ts`, `eit-${id}.ts`),
  exportMulticastOutputs: () => downloadConfig('/multicast-outputs/export', 'multicast-outputs.xml'),
  previewMulticastImport: (file: File) => uploadConfig<MulticastImportPlan>('/multicast-outputs/import/preview', file),
  importMulticastOutputs: (file: File) => uploadConfig<MulticastImportPlan>('/multicast-outputs/import', file),

  channel: (id: number) => request<Channel>(`/channels/${id}`),

  programmes: (params?: { date?: string; channel_id?: number; channel_ids?: number[]; source_id?: number; page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.date) qs.set('date', params.date)
    if (params?.channel_id) qs.set('channel_id', String(params.channel_id))
    if (params?.channel_ids?.length) qs.set('channel_ids', params.channel_ids.join(','))
    if (params?.source_id) qs.set('source_id', String(params.source_id))
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return request<Paginated<Programme>>(`/programmes${q ? `?${q}` : ''}`)
  },

  programme: (id: number) => request<Programme>(`/programmes/${id}`),
}
