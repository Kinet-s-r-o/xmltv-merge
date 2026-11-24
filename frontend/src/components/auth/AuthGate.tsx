import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, setCsrfToken, UNAUTHORIZED_EVENT, type PermissionAction, type Section, type Session } from '../../api/client'
import { AuthContextProvider, allows } from '../../lib/auth'
import { LoadingState, ResourceError, errorMessage } from '../ui/ResourceState'
import { LoginPage } from './LoginPage'

const ME_KEY = ['auth', 'me'] as const

/** Drops cached data of the previous user so nothing leaks across sign-ins. */
function clearUserData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
}

/**
 * Shows the sign-in page until a session exists, then renders the app with
 * the session and permission helpers in context.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ME_KEY, queryFn: authApi.me, retry: 1, staleTime: 60_000, refetchInterval: 5 * 60_000 })
  const session = me.data ?? null
  const status = useQuery({ queryKey: ['auth', 'status'], queryFn: authApi.status, enabled: me.isSuccess && session === null, retry: 1 })

  useEffect(() => {
    setCsrfToken(session?.csrf_token ?? '')
  }, [session?.csrf_token])

  useEffect(() => {
    const onUnauthorized = () => {
      setCsrfToken('')
      queryClient.setQueryData(ME_KEY, null)
      clearUserData(queryClient)
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [queryClient])

  const onAuthenticated = useCallback((next: Session) => {
    setCsrfToken(next.csrf_token)
    clearUserData(queryClient)
    queryClient.setQueryData(ME_KEY, next)
    queryClient.invalidateQueries({ queryKey: ['auth', 'status'] })
  }, [queryClient])

  const signOut = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setCsrfToken('')
      clearUserData(queryClient)
      queryClient.setQueryData(ME_KEY, null)
    }
  }, [queryClient])

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ME_KEY }), [queryClient])

  const value = useMemo(() => session && {
    session,
    can: (section: Section, action: PermissionAction = 'read') => allows(session.permissions, section, action),
    canAny: (sections: Section[], action: PermissionAction = 'read') => sections.some((section) => allows(session.permissions, section, action)),
    signOut,
    refresh,
  }, [session, signOut, refresh])

  if (me.isPending) {
    return <main className="auth-screen"><LoadingState title="Checking your session" /></main>
  }
  if (me.isError) {
    return (
      <main className="auth-screen">
        <ResourceError title="The XMLTV EPG API is not reachable" message={errorMessage(me.error)} onRetry={() => me.refetch()} />
      </main>
    )
  }
  if (!value) {
    if (status.isPending) return <main className="auth-screen"><LoadingState title="Loading sign-in" /></main>
    return <LoginPage setupRequired={status.data?.setup_required ?? false} onAuthenticated={onAuthenticated} />
  }
  return <AuthContextProvider value={value}>{children}</AuthContextProvider>
}
