import { Outlet, NavLink } from 'react-router-dom'
import { Tv, LayoutDashboard, ListVideo, Database } from 'lucide-react'
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
]

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-zinc-800">
          <Tv className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-sm tracking-tight">XMLTV EPG</span>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
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
        <div className="p-3 border-t border-zinc-800 text-xs text-zinc-500">
          v1.0.0
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
