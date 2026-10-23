import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Tv, ListVideo, Database, ArrowRight, Upload } from 'lucide-react'
import { api } from '../api/client'

export function Dashboard() {
  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })

  const totalChannels = sources?.reduce((sum, s) => sum + s.channel_count, 0) ?? 0
  const totalProgrammes = sources?.reduce((sum, s) => sum + s.programme_count, 0) ?? 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-400 mt-1">Overview of your EPG data</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Database}
          label="Sources"
          value={sources?.length ?? 0}
          color="text-indigo-400"
        />
        <StatCard
          icon={ListVideo}
          label="Channels"
          value={totalChannels}
          color="text-emerald-400"
        />
        <StatCard
          icon={Tv}
          label="Programmes"
          value={totalProgrammes}
          color="text-amber-400"
        />
      </div>

      {/* Sources Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-300">Sources</h2>
          <Link to="/sources" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
            Manage <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-zinc-500 text-sm">Loading...</div>
        ) : sources && sources.length > 0 ? (
          <div className="divide-y divide-zinc-800">
            {sources.map((s) => (
              <div key={s.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{s.name}</p>
                    <p className="text-xs text-zinc-500">
                      {s.channel_count} channels · {s.programme_count} programmes
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-400">
                    {s.last_import_at ? new Date(s.last_import_at).toLocaleString() : 'Never imported'}
                  </p>
                  {s.last_import_status && (
                    <span className={`text-xs ${s.last_import_status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {s.last_import_status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center">
            <Upload className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No sources yet. Import an XML file to get started.</p>
            <Link to="/sources" className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 inline-block">
              Go to Sources →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${color}`} />
        <div>
          <p className="text-2xl font-bold text-zinc-100">{value.toLocaleString()}</p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      </div>
    </div>
  )
}
