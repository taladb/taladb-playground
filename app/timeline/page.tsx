'use client'

import { useState } from 'react'
import { useCollection, useAggregate } from '@taladb/react'
import { timelinePipeline } from '@/lib/queries'
import { MEMORY_ICON, MEMORY_LABEL, plural, yearOf } from '@/lib/format'
import { MemoryCard } from '../components/MemoryCard'
import { EngineBadge } from '../components/EngineBadge'
import { MEMORY_TYPES, type Memory, type MemoryRow, type MemoryType } from '@/lib/types'

const PAGE = 40

/**
 * Everything, newest first.
 *
 * Paged with `useAggregate`, which subscribes to the pipeline rather than
 * snapshotting it — `find()` has no sort or limit, and a plain `aggregate` call
 * in an effect would freeze the page the moment anything was written underneath
 * it. Save a memory from another tab and this list updates in place.
 */
export default function TimelinePage() {
  const [type, setType] = useState<MemoryType | null>(null)
  const [limit, setLimit] = useState(PAGE)

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
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Timeline</h1>
        <EngineBadge engine="structured" size="xs" />
      </div>

      <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setType(null)}
          className={`chip shrink-0 ${
            type === null
              ? 'border-stone-900 bg-stone-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-stone-950'
              : 'border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400'
          }`}
        >
          Everything
        </button>
        {MEMORY_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t === type ? null : t)}
            className={`chip shrink-0 ${
              type === t
                ? 'border-stone-900 bg-stone-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-stone-950'
                : 'border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400'
            }`}
          >
            <span aria-hidden>{MEMORY_ICON[t]}</span>
            {MEMORY_LABEL[t]}
          </button>
        ))}
      </div>

      <p className="text-xs text-stone-500 dark:text-stone-400">
        {loading ? 'Reading…' : `Showing ${plural(data.length, 'memory', 'memories')}`}
      </p>

      <div className="space-y-8">
        {[...byYear.entries()].map(([year, rows]) => (
          <section key={year}>
            <h2 className="tnum sticky top-14 z-10 -mx-1 bg-stone-50/90 px-1 py-1 text-sm font-semibold text-stone-400 backdrop-blur dark:bg-stone-950/90 dark:text-stone-500">
              {year}
            </h2>
            <div className="mt-2 space-y-3">
              {rows.map((memory) => (
                <MemoryCard key={memory._id} memory={memory} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {data.length >= limit && (
        <button onClick={() => setLimit((n) => n + PAGE)} className="btn-ghost w-full text-sm">
          Show more
        </button>
      )}
    </div>
  )
}
