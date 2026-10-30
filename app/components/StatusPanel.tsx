'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useTalaDB } from '@taladb/react'
import type { TalaDB } from 'taladb'
import { collections } from '@/lib/schema'
import { stats } from '@/lib/queries'
import { useEmbedderState } from '@/lib/embed'
import { useAsync } from '@/lib/use-async'
import { modelStatusLabel } from './ModelStatus'
import { Icon } from './Icon'

type StorageInfo = Awaited<ReturnType<NonNullable<TalaDB['storageInfo']>>>

type Health = 'ok' | 'limited' | 'checking'

/** What the header pill can claim, from what the engine reports. */
function healthOf(info: StorageInfo | null | undefined): Health {
  if (info === undefined) return 'checking'
  if (!info || info.storageError) return 'limited'
  return 'ok'
}

const HEALTH = {
  ok: { color: 'var(--color-ios-green)', short: 'On this device', long: 'Stored on this device' },
  limited: { color: 'var(--color-ios-orange)', short: 'Storage limited', long: 'Storage limited' },
  checking: { color: 'var(--color-ios-gray)', short: 'Opening', long: 'Opening database' },
} as const

/**
 * "Stored on this device", and the evidence for it.
 *
 * The pill is a claim; the panel behind it is the proof. Every row is read
 * from the engine or the browser when the panel opens — the storage backend
 * TalaDB actually got, whether the browser has promised not to evict it, how
 * many documents and indexes exist, whether the model is loaded. Nothing in
 * it is a constant typed into the page.
 */
export function StatusPill() {
  const db = useTalaDB()
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<StorageInfo | null | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    Promise.resolve(db.storageInfo?.() ?? null)
      .then((i) => live && setInfo(i))
      .catch(() => live && setInfo(null))
    return () => {
      live = false
    }
  }, [db])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const health = healthOf(info)
  const h = HEALTH[health]

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="status-panel"
        aria-label={`${h.long}. Show storage and status details.`}
        className="flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors hover:bg-[var(--color-fill)]"
        style={{ border: '1px solid var(--color-border)' }}
      >
        <span className="relative flex h-2 w-2">
          <span className="h-2 w-2 rounded-full" style={{ background: h.color }} />
        </span>
        <span className="hidden whitespace-nowrap sm:inline">{h.short}</span>
      </button>

      {open && (
        <div
          id="status-panel"
          role="dialog"
          aria-label="Storage and system status"
          className="surface-pop pop-in absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden"
        >
          <StatusBody info={info ?? null} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

function StatusBody({ info, onNavigate }: { info: StorageInfo | null; onNavigate: () => void }) {
  const db = useTalaDB()
  const embedder = useEmbedderState()
  const [persist, setPersist] = useState<boolean | null | 'unsupported'>(null)

  const counts = useAsync(() => stats(db), [db])
  const index = useAsync(async () => {
    const { memories, entities } = collections(db)
    const [m, e] = await Promise.all([memories.listIndexes(), entities.listIndexes()])
    const vector = m.vector.includes('embedding') ? await memories.vectorIndexStatus('embedding') : null
    return {
      btree: m.btree.length + e.btree.length,
      fts: m.fts.length + e.fts.length,
      vector,
    }
  }, [db])

  useEffect(() => {
    if (!navigator.storage?.persisted) {
      setPersist('unsupported')
      return
    }
    void navigator.storage.persisted().then(setPersist).catch(() => setPersist('unsupported'))
  }, [])

  async function requestPersist() {
    try {
      setPersist(await navigator.storage.persist())
    } catch {
      setPersist('unsupported')
    }
  }

  const backend = !info
    ? { value: 'Unknown', tone: 'warn' as const }
    : info.storageError
      ? { value: `Problem: ${info.storageError}`, tone: 'warn' as const }
      : info.storage === 'opfs'
        ? { value: 'Origin private file system', tone: 'ok' as const }
        : { value: 'IndexedDB snapshot (fallback)', tone: 'ok' as const }

  return (
    <div className="text-[13px]">
      <div className="px-4 pb-3 pt-4">
        <p className="text-[15px] font-semibold">Your data stays in this browser</p>
        <p className="muted mt-1 leading-relaxed">
          Memories, indexes and searches live in a TalaDB database on this device. There is no
          account and no server holding a copy.
        </p>
      </div>

      <dl className="divide-y border-y">
        <Row label="Database" value="Open" tone="ok" />
        <Row label="Storage" value={backend.value} tone={backend.tone} />
        <Row
          label="Kept by the browser"
          value={
            persist === null
              ? 'Checking…'
              : persist === 'unsupported'
                ? 'Not reported'
                : persist
                  ? 'Yes — protected from cleanup'
                  : 'Best effort'
          }
          tone={persist === true ? 'ok' : 'neutral'}
          action={
            persist === false ? (
              <button onClick={() => void requestPersist()} className="link text-[12px] font-medium">
                Ask to keep
              </button>
            ) : null
          }
        />
        <Row
          label="Documents"
          value={
            counts.data
              ? `${counts.data.memoryCount.toLocaleString()} memories · ${counts.data.entityCount.toLocaleString()} things`
              : '…'
          }
        />
        <Row
          label="Indexes"
          value={
            index.data
              ? `${index.data.btree} b-tree · ${index.data.fts} full-text · ${
                  index.data.vector ? `vector (${index.data.vector.state === 'flat' ? 'exact' : index.data.vector.state})` : 'no vector'
                }`
              : '…'
          }
          tone={index.data ? 'ok' : 'neutral'}
        />
        <Row
          label="Embedding model"
          value={modelStatusLabel(embedder)}
          tone={embedder.status === 'ready' ? 'ok' : embedder.status === 'error' ? 'warn' : 'neutral'}
        />
      </dl>

      {persist === false && (
        <p className="muted px-4 pt-3 text-[12px] leading-relaxed">
          “Best effort” means the browser may clear this site’s data if the device runs low on
          space. Asking to keep it is a request, and the browser decides.
        </p>
      )}

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <Link href="/how-it-works" onClick={onNavigate} className="link text-[13px] font-medium">
          How it works
        </Link>
        <Link href="/settings" onClick={onNavigate} className="link text-[13px] font-medium">
          Storage &amp; export
        </Link>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  tone = 'neutral',
  action,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'neutral'
  action?: React.ReactNode
}) {
  const dot =
    tone === 'ok' ? 'var(--color-ios-green)' : tone === 'warn' ? 'var(--color-ios-orange)' : 'var(--color-border-strong)'
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
      <dt className="muted w-28 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 break-words font-medium">
        {value}
        {action && <div className="mt-0.5">{action}</div>}
      </dd>
    </div>
  )
}
