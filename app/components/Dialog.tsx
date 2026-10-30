'use client'

import { useEffect, useRef } from 'react'

/**
 * A confirmation dialog on the native <dialog> element.
 *
 * `showModal()` gives focus containment, Escape to close, an inert page behind
 * and a top-layer backdrop for free, which is everything a hand-rolled modal
 * gets wrong. Focus returns to whatever opened it when it closes.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = 'default',
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  confirmLabel: string
  tone?: 'default' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="confirm-title"
      onClose={onClose}
      onCancel={(e) => {
        // Escape while a write is in flight would hide a dialog whose action
        // is still running; let it finish first.
        if (busy) e.preventDefault()
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current && !busy) onClose()
      }}
    >
      <div className="p-5 md:p-6">
        <h2 id="confirm-title" className="text-[18px]">
          {title}
        </h2>
        <div className="muted mt-2 space-y-2 text-[14px] leading-relaxed">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onClose} disabled={busy} className="btn-ghost" autoFocus>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
          >
            {busy ? <span className="spinner h-4 w-4" /> : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
