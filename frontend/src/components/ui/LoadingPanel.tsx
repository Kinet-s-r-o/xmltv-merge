interface LoadingPanelProps {
  label: string
  compact?: boolean
}

export function LoadingPanel({ label, compact = false }: LoadingPanelProps) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className={`space-y-3 text-center text-zinc-500 ${compact ? 'p-6' : 'p-8'}`}>
      <div className="mx-auto h-2 w-32 animate-pulse rounded-full bg-zinc-800" />
      <div className="mx-auto h-2 w-48 animate-pulse rounded-full bg-zinc-800/70" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
