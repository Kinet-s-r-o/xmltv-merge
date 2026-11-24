import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw, type LucideIcon } from 'lucide-react'

interface BaseProps {
  title: string
  message?: ReactNode
  compact?: boolean
}

/** Loading state: spinner + concrete label. */
export function LoadingState({ title, message, compact }: BaseProps) {
  return (
    <div role="status" aria-live="polite" className={`resource-state${compact ? ' is-compact' : ''}`}>
      <div className="resource-state-icon" aria-hidden="true">
        <span className="spinner" />
      </div>
      <strong>{title}</strong>
      {message && <p>{message}</p>}
    </div>
  )
}

/** Empty state: what is missing, why, and what to do next. */
export function EmptyState({ title, message, compact, icon: Icon, children }: BaseProps & { icon: LucideIcon; children?: ReactNode }) {
  return (
    <div className={`resource-state${compact ? ' is-compact' : ''}`}>
      <div className="resource-state-icon" aria-hidden="true">
        <Icon className="h-[22px] w-[22px]" />
      </div>
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      {children && <div className="resource-state-actions">{children}</div>}
    </div>
  )
}

/** Error state with a retry action when the request is safe to repeat. */
export function ResourceError({ title, message, compact, onRetry }: BaseProps & { onRetry?: () => void }) {
  return (
    <div role="alert" className={`resource-state is-error${compact ? ' is-compact' : ''}`}>
      <div className="resource-state-icon" aria-hidden="true">
        <AlertTriangle className="h-[22px] w-[22px]" />
      </div>
      <strong>{title}</strong>
      {message && <p>{message}</p>}
      {onRetry && (
        <div className="resource-state-actions">
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry request
          </button>
        </div>
      )}
    </div>
  )
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
