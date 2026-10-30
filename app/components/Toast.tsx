'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * Confirmation that a local write happened.
 *
 * A write to TalaDB commits or throws — there is no "pending" to show — so a
 * toast here only ever reports something that already happened on disk. It is
 * announced politely to screen readers and never steals focus.
 */

type Tone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  tone: Tone
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

const TONE: Record<Tone, { color: string; icon: 'check' | 'alert' | 'info' }> = {
  success: { color: 'var(--color-ios-green)', icon: 'check' },
  error: { color: 'var(--color-ios-red)', icon: 'alert' },
  info: { color: 'var(--color-ios-blue)', icon: 'info' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = ++nextId.current
    setItems((list) => [...list.slice(-2), { id, message, tone }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((item) => (
          <Toast key={item.id} item={item} onDone={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function Toast({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, item.tone === 'error' ? 6000 : 3500)
    return () => clearTimeout(t)
  }, [item.tone, onDone])

  const tone = TONE[item.tone]
  return (
    <div className="surface-pop pop-in pointer-events-auto flex max-w-md items-center gap-2.5 px-4 py-2.5 text-[14px]">
      <span style={{ color: tone.color }}>
        <Icon name={tone.icon} className="h-4 w-4" strokeWidth={2.4} />
      </span>
      <span className="min-w-0">{item.message}</span>
      <button onClick={onDone} aria-label="Dismiss" className="-mr-1 ml-1 rounded-md p-1 muted hover:text-[var(--color-label)]">
        <Icon name="close" className="h-3.5 w-3.5" strokeWidth={2.4} />
      </button>
    </div>
  )
}
