import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, CheckCircle, XCircle, FileText } from 'lucide-react'
import { api, ImportResult } from '../api/client'

export function Sources() {
  const queryClient = useQueryClient()
  const [sourceName, setSourceName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources(),
  })

  const importMutation = useMutation({
    mutationFn: () => api.import(file!, sourceName || undefined),
    onSuccess: (data) => {
      setResult(data)
      setError(null)
      setFile(null)
      setSourceName('')
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      queryClient.invalidateQueries({ queryKey: ['programmes'] })
    },
    onError: (err: Error) => {
      setError(err.message)
      setResult(null)
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0])
      if (!sourceName) setSourceName(e.target.files[0].name.replace(/\.xml$/i, ''))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0])
      if (!sourceName) setSourceName(e.dataTransfer.files[0].name.replace(/\.xml$/i, ''))
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Sources</h1>
        <p className="text-sm text-zinc-400 mt-1">Manage your XMLTV data sources</p>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center hover:border-indigo-500/50 transition-colors"
      >
        <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-400 mb-4">Drag & drop an XML file here, or click to browse</p>
        <input ref={fileInputRef} type="file" accept=".xml" onChange={handleFileChange} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        >
          Browse File
        </button>
        {file && (
          <p className="text-xs text-emerald-400 mt-3">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
        )}
      </div>

      <div className="flex gap-3 items-center">
        <label className="text-sm text-zinc-400 w-24">Source Name</label>
        <input
          type="text"
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
          placeholder="e.g. My EPG Source"
          className="flex-1 max-w-sm px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50"
        />
        <button
          onClick={() => importMutation.mutate()}
          disabled={!file || importMutation.isPending}
          className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          {importMutation.isPending ? 'Importing...' : 'Import'}
        </button>
      </div>

      {result && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-sm text-emerald-300">Import successful!</p>
            <p className="text-xs text-zinc-400">
              {result.channels} channels, {result.programmes} programmes imported in {result.duration}
            </p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <XCircle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-300">Existing Sources</h2>
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-zinc-500">Loading...</div>
        ) : sources && sources.length > 0 ? (
          <div className="divide-y divide-zinc-800">
            {sources.map((s) => (
              <div key={s.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{s.name}</p>
                  <p className="text-xs text-zinc-500">
                    {s.channel_count} channels · {s.programme_count} programmes
                  </p>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  <p>Last import: {s.last_import_at ? new Date(s.last_import_at).toLocaleString() : 'Never'}</p>
                  {s.last_import_status && (
                    <span className={s.last_import_status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                      {s.last_import_status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-zinc-500">No sources yet.</div>
        )}
      </div>
    </div>
  )
}

