import { useRef, useState, type ChangeEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../api/client'

/** Lifecycle of a configuration import preview dialog. */
export type ConfigImportState<P> =
  | { status: 'closed' }
  | { status: 'previewing'; fileName: string }
  | { status: 'invalid'; fileName: string; message: string; details: string[] }
  | { status: 'ready'; fileName: string; plan: P }

interface ConfigTransferOptions<P> {
  exportFile: () => Promise<{ filename: string; blob: Blob }>
  preview: (file: File) => Promise<P>
  apply: (file: File) => Promise<P>
  onExported: (filename: string) => void
  onExportError: (err: Error) => void
  onImported: (plan: P) => void
}

/** Saves a downloaded blob under its server-provided file name. */
export function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 0)
}

/**
 * Shared XML export/import flow for configuration files (sources, outputs):
 * export downloads the file; import validates it server-side, shows the plan
 * in a preview dialog and applies the same file only after confirmation.
 */
export function useConfigTransfer<P>({ exportFile, preview, apply, onExported, onExportError, onImported }: ConfigTransferOptions<P>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<File | null>(null)
  const [state, setState] = useState<ConfigImportState<P>>({ status: 'closed' })
  const [applyError, setApplyError] = useState<string | null>(null)

  const exportMutation = useMutation({
    mutationFn: exportFile,
    onSuccess: ({ filename, blob }) => {
      saveBlob(blob, filename)
      onExported(filename)
    },
    onError: onExportError,
  })

  const startPreview = async (file: File) => {
    fileRef.current = file
    setApplyError(null)
    setState({ status: 'previewing', fileName: file.name })
    try {
      const plan = await preview(file)
      if (fileRef.current === file) setState({ status: 'ready', fileName: file.name, plan })
    } catch (err) {
      if (fileRef.current !== file) return
      setState({
        status: 'invalid',
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
        details: err instanceof ApiError ? err.details : [],
      })
    }
  }

  const close = () => {
    fileRef.current = null
    setApplyError(null)
    setState({ status: 'closed' })
  }

  const applyMutation = useMutation({
    mutationFn: apply,
    onSuccess: (plan) => {
      close()
      onImported(plan)
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.details.length > 0 && fileRef.current) {
        setState({ status: 'invalid', fileName: fileRef.current.name, message: err.message, details: err.details })
      } else {
        setApplyError(err.message)
      }
    },
  })

  return {
    state,
    applyError,
    applying: applyMutation.isPending,
    exporting: exportMutation.isPending,
    exportNow: () => exportMutation.mutate(),
    openPicker: () => inputRef.current?.click(),
    close,
    confirm: () => {
      if (!fileRef.current) return
      setApplyError(null)
      applyMutation.mutate(fileRef.current)
    },
    /** Props for the hidden native file input that Import opens. */
    inputProps: {
      ref: inputRef,
      type: 'file' as const,
      accept: '.xml,application/xml,text/xml',
      className: 'sr-only',
      tabIndex: -1,
      'aria-hidden': true as const,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void startPreview(file)
      },
    },
  }
}
