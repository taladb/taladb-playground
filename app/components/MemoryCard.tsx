'use client'

import Link from 'next/link'
import { MEMORY_ICON, MEMORY_LABEL, money, fullDate } from '@/lib/format'
import { ConfidenceMark } from './ConfidenceMark'
import type { MemoryRow } from '@/lib/types'

/**
 * One event in a timeline. Kept deliberately quiet — the timeline is meant to
 * be skimmed years later, so the date, the type glyph and the title carry it,
 * and everything else is secondary.
 */
export function MemoryCard({
  memory,
  showEntities = true,
  dense = false,
  children,
}: {
  memory: MemoryRow
  showEntities?: boolean
  dense?: boolean
  children?: React.ReactNode
}) {
  return (
    <article className={`card p-4 ${dense ? 'py-3' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none" aria-hidden>
          {MEMORY_ICON[memory.memoryType]}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="font-medium text-stone-900 dark:text-stone-100">{memory.title}</h3>
            <ConfidenceMark confidence={memory.confidence} sourceType={memory.sourceType} />
          </div>

          <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
            {memory.content}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-stone-500 dark:text-stone-400">
            <span className="tnum">{fullDate(memory.occurredAt)}</span>
            <span className="chip border-stone-200 bg-stone-50 py-0.5 dark:border-stone-700 dark:bg-stone-800/60">
              {MEMORY_LABEL[memory.memoryType]}
            </span>
            {memory.amount !== undefined && (
              <span className="tnum font-medium text-stone-700 dark:text-stone-200">
                {money(memory.amount, memory.currency)}
              </span>
            )}
            {showEntities &&
              memory.entityIds.map((id, i) => (
                <Link
                  key={id}
                  href={`/entity/${id}`}
                  className="underline decoration-stone-300 underline-offset-2 hover:text-amber-700 dark:decoration-stone-600 dark:hover:text-amber-400"
                >
                  {memory.entityNames[i] ?? 'Unknown'}
                </Link>
              ))}
          </div>

          {children}
        </div>
      </div>
    </article>
  )
}
