import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export type DialogSize = 'small' | 'medium' | 'large' | 'wide' | 'full'

interface DialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  size?: DialogSize
  role?: 'dialog' | 'alertdialog'
  busy?: boolean
  onClose: () => void
  actions?: ReactNode
  children?: ReactNode
  /** Element that receives focus on open; defaults to the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

/** Open dialogs, innermost last; only the top one handles keys and the app root stays inert until all close. */
const dialogStack: symbol[] = []

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal dialog (Kinet contract): role="dialog", aria-modal="true",
 * focus trap, Escape closes, body scroll locked, app root inert, focus restored
 * to the trigger on close. z-index 100 via .dialog-backdrop.
 */
export function Dialog({ open, title, description, size = 'medium', role = 'dialog', busy, onClose, actions, children, initialFocusRef }: DialogProps) {
  const panelRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    const previousOverflow = document.body.style.overflow
    const token = Symbol('dialog')
    dialogStack.push(token)
    document.body.style.overflow = 'hidden'
    root?.setAttribute('inert', '')

    const focusTarget = initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    focusTarget?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== token) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      dialogStack.splice(dialogStack.indexOf(token), 1)
      document.body.style.overflow = previousOverflow
      if (dialogStack.length === 0) root?.removeAttribute('inert')
      previouslyFocused?.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={panelRef}
        className={`dialog-panel dialog-${size}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
      >
        <header className="dialog-header">
          <div className="min-w-0">
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" title="Close" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        {children && <div className="dialog-body">{children}</div>}
        {actions && <footer className="dialog-actions">{actions}</footer>}
      </section>
    </div>,
    document.body,
  )
}
