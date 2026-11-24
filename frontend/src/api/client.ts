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
