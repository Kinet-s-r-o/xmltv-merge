import { useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog } from './Dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Small confirmation dialog; destructive tone uses .btn-danger. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog
      open={open}
      role="alertdialog"
      size="small"
      busy={busy}
      initialFocusRef={cancelRef}
      title={<span className="inline-flex items-center gap-2">{destructive && <AlertTriangle className="h-4 w-4 text-error-text" aria-hidden="true" />}{title}</span>}
      description={description}
      onClose={onCancel}
      actions={
        <>
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy && <span className="spinner spinner-sm" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </>
      }
    />
  )
}
