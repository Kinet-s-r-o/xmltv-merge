import { Outlet, NavLink, useLocation, matchPath } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Database, Layers3, LayoutDashboard, ListVideo, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, RadioTower, Sun, Tv, Wifi, WifiOff, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { applyTheme, nextTheme, readThemePreference, type ThemePreference } from '../../lib/theme'

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Monitor',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/epg', icon: Tv, label: 'EPG grid' },
      { to: '/channels', icon: ListVideo, label: 'Channels' },
    ],
  },
  {
    label: 'Configure',
    items: [
      { to: '/sources', icon: Database, label: 'Sources' },
      { to: '/outputs', icon: Layers3, label: 'Outputs' },
      { to: '/multicast', icon: RadioTower, label: 'Multicast outputs' },
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
          {navGroups.map((group) => (
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
          </div>
        </header>
        <main ref={mainRef} id="main-content" tabIndex={-1} className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
