'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCollection, useAggregate } from '@taladb/react'
import { timelinePipeline } from '@/lib/queries'
import { MEMORY_ICON, MEMORY_LABEL, plural, yearOf } from '@/lib/format'
import { MemoryCard, MemoryThread } from '../components/MemoryCard'
import { MemorySkeleton, LoadingAnnounce } from '../components/Skeleton'
import { EngineBadge } from '../components/EngineBadge'
import { MEMORY_TYPES, type Memory, type MemoryRow, type MemoryType } from '@/lib/types'

const PAGE = 40

export default function TimelinePage() {
  return (
    <Suspense fallback={<MemorySkeleton rows={4} />}>
      <Timeline />
    </Suspense>
  )
}

/**
 * Everything, newest first.
 *
 * Paged with `useAggregate`, which *subscribes* to the pipeline rather than
 * snapshotting it — `find()` has no sort or limit, and a plain `aggregate` in
 * an effect would freeze the page the moment anything was written underneath
 * it. Save a memory in another tab and this list updates in place.
 *
 * Filter and page size live in the URL, so a filtered timeline is a link you
 * can send, reload, or reach with the back button.
 */
function Timeline() {
  const router = useRouter()
  const params = useSearchParams()

  const type = (params.get('type') as MemoryType | null) ?? null
  const limit = Number(params.get('show') ?? PAGE)

  const setParams = useCallback(
    (next: { type?: MemoryType | null; show?: number }) => {
      const q = new URLSearchParams(params)
      if ('type' in next) {
        if (next.type) q.set('type', next.type)
        else q.delete('type')
        q.delete('show') // a new filter starts at the first page
      }
      if (next.show) q.set('show', String(next.show))
      router.replace(q.size ? `/timeline?${q}` : '/timeline', { scroll: false })
    },
    [params, router],
  )

  const memories = useCollection<Memory>('memories')
  const { data, loading } = useAggregate<Memory, MemoryRow>(
    memories,
    timelinePipeline({ ...(type ? { memoryType: type } : {}) }, limit),
  )

  const byYear = new Map<number, MemoryRow[]>()
  for (const memory of data) {
    const year = yearOf(memory.occurredAt)
    const list = byYear.get(year)
    if (list) list.push(memory)
    else byYear.set(year, [memory])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-tight md:text-4xl">Timeline</h1>
        <EngineBadge engine="structured" size="xs" />
      </div>

      <div className="scrollbar-thin -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <Filter active={type === null} onClick={() => setParams({ type: null })}>
          Everything
        </Filter>
        {MEMORY_TYPES.map((t) => (
          <Filter key={t} active={type === t} onClick={() => setParams({ type: t === type ? null : t })}>
            <span aria-hidden>{MEMORY_ICON[t]}</span>
            {MEMORY_LABEL[t]}
          </Filter>
        ))}
      </div>

      <p className="text-xs text-stone-500 dark:text-stone-400" aria-live="polite">
        {loading ? 'Reading…' : `Showing ${plural(data.length, 'memory', 'memories')}`}
      </p>

      {loading ? (
        <>
          <LoadingAnnounce>Loading the timeline…</LoadingAnnounce>
          <MemorySkeleton rows={5} />
        </>
      ) : data.length === 0 ? (
        <Empty type={type} onClear={() => setParams({ type: null })} />
      ) : (
        <div className="space-y-10">
          {[...byYear.entries()].map(([year, rows]) => (
            <section key={year}>
              <h2 className="tnum sticky top-14 z-20 -mx-1 mb-3 w-fit rounded-lg bg-stone-50/85 px-2 py-1 font-serif text-sm font-semibold text-stone-400 backdrop-blur-sm dark:bg-stone-950/85 dark:text-stone-500">
                {year}
              </h2>
              <MemoryThread>
                {rows.map((memory, i) => (
                  <MemoryCard key={memory._id} memory={memory} index={i} />
                ))}
              </MemoryThread>
            </section>
          ))}
        </div>
      )}

      {!loading && data.length >= limit && (
        <button onClick={() => setParams({ show: limit + PAGE })} className="btn-ghost w-full">
          Show {PAGE} More
        </button>
      )}
    </div>
  )
}

function Filter({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`chip shrink-0 ${
        active
          ? 'border-stone-900 bg-stone-900 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-stone-950'
          : 'border-stone-200 bg-white/70 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-400 dark:hover:border-stone-600'
      }`}
    >
      {children}
    </button>
  )
}

function Empty({ type, onClear }: { type: MemoryType | null; onClear: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="text-3xl" aria-hidden>
        {type ? MEMORY_ICON[type] : '🕰️'}
      </span>
      <p className="font-serif text-lg font-medium">
        {type ? `No ${MEMORY_LABEL[type].toLowerCase()} memories yet` : 'Nothing here yet'}
      </p>
      <p className="max-w-sm text-sm text-stone-500 dark:text-stone-400">
        {type
          ? 'Nothing of this kind has been recorded. Try another filter, or write one.'
          : 'Once you remember something, it will appear here in order.'}
      </p>
      {type && (
        <button onClick={onClear} className="btn-ghost mt-1">
          Show Everything
        </button>
      )}
    </div>
  )
}
