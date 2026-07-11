'use client'

import { useEffect, useState } from 'react'
import { useTalaDB } from '@taladb/react'

export function SyncStatusBadge() {
  const db = useTalaDB()
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const s = await db.syncStatus?.()
        if (alive && s) setPending(s.pending)
      } catch {
        /* syncStatus is browser-only; ignore elsewhere */
      }
    }
    tick()
    const id = setInterval(tick, 3000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [db])

  const color = !online
    ? 'bg-amber-500'
    : pending > 0
      ? 'bg-teal-500 animate-pulse'
      : 'bg-emerald-500'
  const label = !online ? 'Offline' : pending > 0 ? `Syncing ${pending}` : 'Synced'

  return (
    <span
      title="Local-first sync status"
      className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 sm:flex dark:border-slate-800 dark:text-slate-300"
    >
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}
