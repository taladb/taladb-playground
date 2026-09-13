'use client'

import Link from 'next/link'
import { MEMORY_ICON, MEMORY_LABEL, money, fullDate } from '@/lib/format'
import { ConfidenceMark } from './ConfidenceMark'
import type { MemoryRow } from '@/lib/types'

/**
 * One event in a timeline.
 *
 * Deliberately quiet: a timeline is meant to be skimmed years later, so the
 * date, the glyph and the title carry it and everything else recedes. The title
 * is set in the serif because it is something a person wrote — the metadata
 * around it is interface, and stays in the sans.
 *
 * The glyph sits in a ringed disc so the same component works both threaded
 * onto a timeline rail and standing alone as a search result.
 */
export function MemoryCard({
  memory,
  showEntities = true,
  index = 0,
  children,
}: {
  memory: MemoryRow
  showEntities?: boolean
  /** Position in its list, for the entrance stagger. */
  index?: number
  children?: React.ReactNode
}) {
  return (
    <article
      className="rise group relative flex gap-3.5"
      style={{ '--i': index } as React.CSSProperties}
    >
      {/* The node on the rail. */}
      <span
        aria-hidden
        className="relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                   border bg-white text-sm shadow-[var(--shadow-card)]
                   dark:bg-stone-900"
      >
        {MEMORY_ICON[memory.memoryType]}
      </span>

      <div
        className="card min-w-0 flex-1 p-4 transition-[box-shadow,border-color] duration-200
                   group-hover:border-stone-300 group-hover:shadow-[var(--shadow-lift)]
                   dark:group-hover:border-stone-700"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="font-serif text-[15px] font-medium leading-snug text-stone-900 dark:text-stone-100">
            {memory.title}
          </h3>
          <ConfidenceMark confidence={memory.confidence} sourceType={memory.sourceType} />
        </div>

        <p className="mt-1.5 line-clamp-4 break-words text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          {memory.content}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-stone-500 dark:text-stone-400">
          <time className="tnum" dateTime={new Date(memory.occurredAt).toISOString()}>
            {fullDate(memory.occurredAt)}
          </time>

          <span aria-hidden className="text-stone-300 dark:text-stone-700">
            ·
          </span>

          <span className="text-stone-500 dark:text-stone-400">
            {MEMORY_LABEL[memory.memoryType]}
          </span>

          {memory.amount !== undefined && (
            <>
              <span aria-hidden className="text-stone-300 dark:text-stone-700">
                ·
              </span>
              <span className="tnum font-medium text-stone-800 dark:text-stone-200">
                {money(memory.amount, memory.currency)}
              </span>
            </>
          )}

          {showEntities && memory.entityIds.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              {memory.entityIds.map((id, i) => (
                <Link
                  key={id}
                  href={`/entity/${id}`}
                  className="max-w-[14rem] truncate rounded-md px-1.5 py-0.5 text-stone-600
                             ring-1 ring-stone-200 transition-colors hover:bg-amber-50
                             hover:text-amber-900 hover:ring-amber-300
                             dark:text-stone-400 dark:ring-stone-700 dark:hover:bg-amber-950/40
                             dark:hover:text-amber-200 dark:hover:ring-amber-800"
                >
                  {memory.entityNames[i] ?? 'Unknown'}
                </Link>
              ))}
            </span>
          )}
        </div>

        {children}
      </div>
    </article>
  )
}

/** A timeline: memory rows threaded onto a single vertical rail. */
export function MemoryThread({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative space-y-3">
      <span aria-hidden className="rail" />
      {children}
    </div>
  )
}
