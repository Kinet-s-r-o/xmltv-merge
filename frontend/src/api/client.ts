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

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  limit: number
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

  deleteSource: (id: number) => request<void>(`/sources/${id}`, { method: 'DELETE' }),

  channels: (params?: { source_id?: number; search?: string }) => {
    const qs = new URLSearchParams()
    if (params?.source_id) qs.set('source_id', String(params.source_id))
    if (params?.search) qs.set('search', params.search)
    const q = qs.toString()
    return request<Channel[]>(`/channels${q ? `?${q}` : ''}`)
  },

  channel: (id: number) => request<Channel>(`/channels/${id}`),

  programmes: (params?: { date?: string; channel_id?: number; source_id?: number; page?: number; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.date) qs.set('date', params.date)
    if (params?.channel_id) qs.set('channel_id', String(params.channel_id))
    if (params?.source_id) qs.set('source_id', String(params.source_id))
    if (params?.page) qs.set('page', String(params.page))
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return request<Paginated<Programme>>(`/programmes${q ? `?${q}` : ''}`)
  },

  programme: (id: number) => request<Programme>(`/programmes/${id}`),
}
