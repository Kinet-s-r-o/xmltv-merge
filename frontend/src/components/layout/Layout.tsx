import { Outlet, NavLink, useLocation, matchPath } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Database, KeyRound, Layers3, LayoutDashboard, ListVideo, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, RadioTower, Server, ShieldCheck, Sun, Tv, UserCog, Users, Wifi, WifiOff, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type Section } from '../../api/client'
import { useAuth } from '../../lib/auth'
import { applyTheme, nextTheme, readThemePreference, type ThemePreference } from '../../lib/theme'

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
  section: Section
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Monitor',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'dashboard' },
      { to: '/epg', icon: Tv, label: 'EPG grid', section: 'epg' },
      { to: '/channels', icon: ListVideo, label: 'Channels', section: 'channels' },
    ],
  },
  {
    label: 'Configure',
    items: [
      { to: '/sources', icon: Database, label: 'Sources', section: 'sources' },
      { to: '/outputs', icon: Layers3, label: 'Outputs', section: 'outputs' },
      { to: '/multicast', icon: RadioTower, label: 'Multicast outputs', section: 'multicast' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/system/users', icon: Users, label: 'Users', section: 'users' },
      { to: '/system/roles', icon: ShieldCheck, label: 'Roles', section: 'roles' },
      { to: '/system/radius', icon: Server, label: 'RADIUS servers', section: 'radius' },
    ],
  },
]

const sectionTitles: Array<[string, string]> = [
  ['/', 'Dashboard'],
  ['/epg', 'EPG grid'],
  ['/channels', 'Channels'],
  ['/programmes/:id', 'Programme detail'],
  ['/sources', 'Sources'],
  ['/outputs', 'Outputs'],
  ['/multicast', 'Multicast outputs'],
  ['/system/users', 'Users'],
  ['/system/roles', 'Roles'],
  ['/system/radius', 'RADIUS servers'],
  ['/account', 'My account'],
]

const themeMeta: Record<ThemePreference, { icon: LucideIcon; label: string }> = {
  dark: { icon: Moon, label: 'Dark theme' },
  light: { icon: Sun, label: 'Light theme' },
  system: { icon: Monitor, label: 'System theme' },
}

const COLLAPSE_KEY = 'xmltv-sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'true'
  } catch {
    return false
  }
}

export function Layout() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { can } = useAuth()
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => can(item.section)) }))
    .filter((group) => group.items.length > 0)

  const { isError: serviceDown, isSuccess: serviceUp } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30_000,
    retry: 0,
  })

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed))
    } catch {
      // Preference is optional.
    }
  }, [collapsed])

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true })
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen])

  const title = sectionTitles.find(([pattern]) => matchPath({ path: pattern, end: true }, location.pathname))?.[1] ?? 'XMLTV EPG'
  const ThemeIcon = themeMeta[theme].icon
  const upcomingTheme = themeMeta[nextTheme(theme)].label

  return (
    <div className={`app-shell${collapsed ? ' is-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      {mobileNavOpen && <button type="button" className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`app-sidebar${mobileNavOpen ? ' is-open' : ''}`} aria-label="Primary">
        <div className="sidebar-brand">
          <NavLink to="/" className="brand-lockup" aria-label="XMLTV EPG dashboard">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <span className="brand-copy">
              <span className="brand-name">XMLTV EPG</span>
              <span className="brand-subtitle">Guide aggregation console</span>
            </span>
          </NavLink>
          <button type="button" className="icon-button sidebar-close" onClick={() => { setMobileNavOpen(false); menuButtonRef.current?.focus() }} aria-label="Close navigation" title="Close navigation">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Sections">
          {visibleGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-section">{group.label}</p>
              <ul className="nav-list">
                {group.items.map(({ to, icon: Icon, label }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      title={collapsed ? label : undefined}
                      className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className="h-[17px] w-[17px]" strokeWidth={1.7} aria-hidden="true" />
                          <span className="nav-label">{label}</span>
                          {isActive && <ChevronRight className="nav-chevron h-[13px] w-[13px]" aria-hidden="true" />}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-meta">
            <span>XMLTV EPG</span>
            <span className="font-mono">v1.0.0</span>
            <button
              type="button"
              className="icon-button collapse-button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={collapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <button
              ref={menuButtonRef}
              type="button"
              className="icon-button menu-button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
              title="Open navigation"
            >
              <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p>XMLTV EPG</p>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <span className={`service-pill${serviceUp ? ' is-online' : serviceDown ? ' is-offline' : ''}`} aria-live="polite">
              {serviceDown ? <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Wifi className="h-3.5 w-3.5" aria-hidden="true" />}
              {serviceUp ? 'API online' : serviceDown ? 'API unreachable' : 'Checking API'}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => setTheme(nextTheme)}
              aria-label={`${themeMeta[theme].label} active. Switch to ${upcomingTheme.toLowerCase()}`}
              title={`${themeMeta[theme].label} — switch to ${upcomingTheme.toLowerCase()}`}
            >
              <ThemeIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <UserMenu />
          </div>
        </header>
        <main ref={mainRef} id="main-content" tabIndex={-1} className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Topbar account menu: signed-in user, role, My account and Sign out. */
function UserMenu() {
  const { session, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()
  const { user } = session
  const name = user.display_name || user.username
  const initials = name.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || '?'

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="user-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={`Signed in as ${user.username}`}
      >
        <span className="user-avatar" aria-hidden="true">{initials}</span>
        <span className="user-menu-name max-sm:sr-only">{name}</span>
      </button>
      {open && (
        <div className="user-menu-panel" role="menu" aria-label="Account">
          <div className="user-menu-meta">
            <strong>{name}</strong>
            <span className="font-mono">{user.username} · {user.auth_type === 'local' ? 'Local' : 'Remote (RADIUS)'}</span>
            <span>Role: {user.role_name}</span>
          </div>
          <NavLink to="/account" role="menuitem" className="user-menu-item">
            <UserCog className="h-4 w-4" aria-hidden="true" /> My account
          </NavLink>
          <NavLink to="/account#two-factor" role="menuitem" className="user-menu-item">
            <KeyRound className="h-4 w-4" aria-hidden="true" /> Two-factor authentication
          </NavLink>
          <button
            type="button"
            role="menuitem"
            className="user-menu-item is-danger"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true)
              void signOut().finally(() => setSigningOut(false))
            }}
          >
            {signingOut ? <span className="spinner spinner-sm" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  )
}
