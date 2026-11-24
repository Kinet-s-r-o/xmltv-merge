import type { AuthType } from '../../api/client'

export const USER_TYPE_LABEL: Record<AuthType, string> = { local: 'Local', remote: 'Remote' }

/** Colored dot + text: local = green, remote (RADIUS) = orange. Never color-only. */
export function UserTypeIndicator({ type, detail }: { type: AuthType; detail?: boolean }) {
  return (
    <span className="type-indicator" title={type === 'local' ? 'Local user — password stored in XMLTV EPG' : 'Remote user — password verified by RADIUS'}>
      <span className={`type-dot is-${type}`} aria-hidden="true" />
      <span className="table-text">{USER_TYPE_LABEL[type]}{detail && type === 'remote' ? ' (RADIUS)' : ''}</span>
    </span>
  )
}
