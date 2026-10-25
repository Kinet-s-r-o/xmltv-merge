import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Tv, LayoutDashboard, ListVideo, Database, Menu, Moon, Sun, Layers3, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs))
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/epg', icon: Tv, label: 'EPG' },
  { to: '/channels', icon: ListVideo, label: 'Channels' },
  { to: '/sources', icon: Database, label: 'Sources' },
  { to: '/outputs', icon: Layers3, label: 'Outputs' },
]

export function Layout() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('xmltv-theme') === 'light')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('light', lightMode)
    localStorage.setItem('xmltv-theme', lightMode ? 'light' : 'dark')
  }, [lightMode])

  useEffect(() => {
    mainRef.current?.focus()
  }, [location.pathname])

  return (
    <div className="flex min-h-screen overflow-hidden">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      {mobileNavOpen && <button type="button" className="fixed inset-0 z-30 bg-black/60 md:hidden" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-800 bg-zinc-900/95 transition-transform duration-200 md:static md:w-56 md:translate-x-0 md:bg-zinc-900/50 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-14 flex items-center gap-2 px-4 border-b border-zinc-800">
          <Tv className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-sm tracking-tight">XMLTV EPG</span>
          <button type="button" className="ml-auto rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 md:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                cn(
                'flex min-h-11 items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-indigo-500/10 text-indigo-300'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500 flex items-center justify-between">
          <span>v1.0.0</span>
          <button
            type="button"
            onClick={() => setLightMode((enabled) => !enabled)}
            aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            title={lightMode ? 'Dark mode' : 'Light mode'}
            className="min-h-11 min-w-11 rounded-lg p-2 hover:bg-zinc-800/70 hover:text-zinc-200 transition-colors"
          >
            {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </aside>
      <main ref={mainRef} id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-auto outline-none">
        <div className="flex h-14 items-center border-b border-zinc-800 px-4 md:hidden">
          <button type="button" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 text-sm font-medium text-zinc-200">XMLTV EPG</span>
        </div>
        <Outlet />
      </main>
    </div>
  )
}
