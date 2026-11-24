import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import type { Section } from '../../api/client'
import { firstAllowedPath, sectionLabel, useAuth } from '../../lib/auth'
import { EmptyState } from '../ui/ResourceState'

/**
 * Renders a route only when the role can read one of its sections. The
 * dashboard redirects to the first allowed section instead of a dead end.
 */
export function RequirePermission({ sections, redirect, children }: { sections: Section[]; redirect?: boolean; children: ReactNode }) {
  const { session, canAny } = useAuth()
  if (canAny(sections)) return <>{children}</>
  if (redirect) {
    const target = firstAllowedPath(session.permissions)
    if (target !== '/') return <Navigate to={target} replace />
  }
  return (
    <section className="data-panel">
      <EmptyState
        icon={ShieldOff}
        title={`No access to ${sections.map(sectionLabel).join(' / ')}`}
        message={`Your role ${session.user.role_name} does not include Read permission for this section. Ask an administrator to change the role under System → Roles.`}
      />
    </section>
  )
}
