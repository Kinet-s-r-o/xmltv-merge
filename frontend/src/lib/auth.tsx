import { createContext, useContext, type ReactNode } from 'react'
import type { PermissionAction, Permissions, Section, Session } from '../api/client'

/** Application sections a role grants permissions on, in display order (mirrors backend auth.Sections). */
export const SECTIONS: Array<{ id: Section; label: string; group: 'Monitor' | 'Configure' | 'System'; path: string; hint: string }> = [
  { id: 'dashboard', label: 'Dashboard', group: 'Monitor', path: '/', hint: 'Source status overview' },
  { id: 'epg', label: 'EPG grid', group: 'Monitor', path: '/epg', hint: 'Programme timeline and details' },
  { id: 'channels', label: 'Channels', group: 'Monitor', path: '/channels', hint: 'Channel list and station schedules' },
  { id: 'sources', label: 'Sources', group: 'Configure', path: '/sources', hint: 'XMLTV URLs, refresh, file imports' },
  { id: 'outputs', label: 'Outputs', group: 'Configure', path: '/outputs', hint: 'XMLTV feeds for customers' },
  { id: 'multicast', label: 'Multicast outputs', group: 'Configure', path: '/multicast', hint: 'DVB EIT multicast streams' },
  { id: 'users', label: 'Users', group: 'System', path: '/system/users', hint: 'Accounts, user type, 2FA' },
  { id: 'roles', label: 'Roles', group: 'System', path: '/system/roles', hint: 'Permissions per section' },
  { id: 'radius', label: 'RADIUS servers', group: 'System', path: '/system/radius', hint: 'Authentication of remote users' },
]

export const PERMISSION_ACTIONS: Array<{ id: PermissionAction; label: string; hint: string }> = [
  { id: 'full', label: 'Full', hint: 'Every action, including future ones' },
  { id: 'read', label: 'Read', hint: 'Open the section and view its records' },
  { id: 'edit', label: 'Edit', hint: 'Create and change records, switch them on or off' },
  { id: 'delete', label: 'Delete', hint: 'Delete records' },
  { id: 'import', label: 'Import', hint: 'Import configuration or XMLTV files' },
  { id: 'export', label: 'Export', hint: 'Download configuration, feeds and dumps' },
]

export function sectionLabel(section: Section) {
  return SECTIONS.find((item) => item.id === section)?.label ?? section
}

/** Whether permissions grant action on section; "full" grants everything. */
export function allows(permissions: Permissions | undefined, section: Section, action: PermissionAction = 'read') {
  const permission = permissions?.[section]
  if (!permission) return false
  return permission.full || permission[action] === true
}

interface AuthContextValue {
  session: Session
  can: (section: Section, action?: PermissionAction) => boolean
  /** True when any of the sections grants action. */
  canAny: (sections: Section[], action?: PermissionAction) => boolean
  signOut: () => Promise<void>
  /** Reloads the session (e.g. after enabling 2FA). */
  refresh: () => Promise<unknown>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthContextProvider({ value, children }: { value: AuthContextValue; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthGate')
  return context
}

/** First route the signed-in user may open (used when the dashboard is not allowed). */
export function firstAllowedPath(permissions: Permissions | undefined) {
  return SECTIONS.find((section) => allows(permissions, section.id))?.path ?? '/account'
}
