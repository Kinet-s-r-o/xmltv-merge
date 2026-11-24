import { format, isValid } from 'date-fns'
import type { Source } from '../api/client'

export type SourceHealth = 'healthy' | 'failed' | 'pending' | 'disabled'

/** Source lifecycle state shown in badges; never conveyed by color alone. */
export function sourceHealth(source: Source): SourceHealth {
  if (!source.enabled) return 'disabled'
  if (source.last_import_status === 'success') return 'healthy'
  if (source.last_import_status === 'error') return 'failed'
  return 'pending'
}

export const healthLabel: Record<SourceHealth, string> = {
  healthy: 'Imported',
  failed: 'Import failed',
  pending: 'Awaiting import',
  disabled: 'Disabled',
}

export const healthBadge: Record<SourceHealth, string> = {
  healthy: 'badge badge-success',
  failed: 'badge badge-error',
  pending: 'badge badge-warning',
  disabled: 'badge',
}

/** Machine-readable timestamp (rendered in IBM Plex Mono). */
export function formatTimestamp(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return isValid(date) ? format(date, 'yyyy-MM-dd HH:mm') : null
}

export function formatInterval(minutes: number) {
  if (minutes % 60 === 0) return `${minutes / 60} h`
  return `${minutes} min`
}
