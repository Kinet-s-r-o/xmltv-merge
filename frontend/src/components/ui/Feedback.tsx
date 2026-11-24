import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type NoticeTone = 'success' | 'error' | 'info'

interface Notice {
  id: number
  tone: NoticeTone
  title: string
  message?: string
}

interface FeedbackApi {
  notify: (notice: Omit<Notice, 'id'>) => void
}

const FeedbackContext = createContext<FeedbackApi | null>(null)

const AUTO_DISMISS_MS = 5000
const icons = { success: CheckCircle2, error: AlertCircle, info: Info }

/**
 * Notice stack (Kinet Feedback): fixed top-right, z-120. Success/info
 * auto-dismiss after 5s; errors persist until dismissed. Never use native
 * alert/confirm; decisions go through ConfirmDialog.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id))
  }, [])

  const notify = useCallback((notice: Omit<Notice, 'id'>) => {
    const id = nextId.current++
    setNotices((current) => [...current.slice(-4), { ...notice, id }])
    if (notice.tone !== 'error') window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
  }, [dismiss])

  const api = useMemo(() => ({ notify }), [notify])

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="notice-stack" aria-live="polite">
          {notices.map((notice) => {
            const Icon = icons[notice.tone]
            return (
              <div key={notice.id} className={`notice notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
                <Icon className="notice-icon h-[17px] w-[17px]" aria-hidden="true" />
                <div className="notice-copy">
                  <strong>{notice.title}</strong>
                  {notice.message && <p>{notice.message}</p>}
                </div>
                <button type="button" className="icon-button" aria-label={`Dismiss notification: ${notice.title}`} title="Dismiss" onClick={() => dismiss(notice.id)}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const context = useContext(FeedbackContext)
  if (!context) throw new Error('useFeedback must be used inside FeedbackProvider')
  return context
}
