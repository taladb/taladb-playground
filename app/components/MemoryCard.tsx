'use client'

import Link from 'next/link'
import { MEMORY_COLOR, MEMORY_LABEL, money, fullDate } from '@/lib/format'
import { IconTile } from './Icon'
import { ConfidenceMark } from './ConfidenceMark'
import type { MemoryRow } from '@/lib/types'

/**
 * One event in a timeline.
 *
 * The coloured tile does the sorting: a column of these reads as orange for
 * servicing, green for money, blue for lending, before a single word is
 * processed. That is the whole reason Health can put six unrelated categories
 * on one screen without it turning to soup.
 *
 * The tile also threads onto the rail, so the same component works both inside
 * a timeline and standing alone as a search result.
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
      className="rise relative flex gap-3"
      style={{ '--i': index } as React.CSSProperties}
    >
      <span className="relative z-10 mt-3">
        <IconTile name={memory.memoryType} color={MEMORY_COLOR[memory.memoryType]} />
      </span>

      <div className="card min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-[15px] font-semibold leading-snug">{memory.title}</h3>
          <ConfidenceMark confidence={memory.confidence} sourceType={memory.sourceType} />
        </div>

        <p className="muted mt-1 line-clamp-4 break-words text-[14px] leading-relaxed">
          {memory.content}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]">
          <span
            className="chip font-semibold"
            style={{
              background: `color-mix(in oklab, ${MEMORY_COLOR[memory.memoryType]} 14%, transparent)`,
              color: MEMORY_COLOR[memory.memoryType],
            }}
          >
            {MEMORY_LABEL[memory.memoryType]}
          </span>

          <time className="tnum muted" dateTime={new Date(memory.occurredAt).toISOString()}>
            {fullDate(memory.occurredAt)}
          </time>

          {memory.amount !== undefined && (
            <span className="tnum font-semibold" style={{ color: 'var(--color-ios-green)' }}>
              {money(memory.amount, memory.currency)}
            </span>
          )}
        </div>

        {showEntities && memory.entityIds.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {memory.entityIds.map((id, i) => (
              <Link
                key={id}
                href={`/entity/${id}`}
                className="chip max-w-[14rem] truncate"
                style={{
                  background: 'color-mix(in oklab, var(--color-ios-gray) 14%, transparent)',
                  color: 'var(--color-ios-blue)',
                }}
              >
                {memory.entityNames[i] ?? 'Unknown'}
              </Link>
            ))}
          </div>
        )}

        {children}
      </div>
    </article>
  )
}

/** A timeline: memory rows threaded onto a single vertical rail. */
export function MemoryThread({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative space-y-2.5">
      <span aria-hidden className="rail" />
      {children}
    </div>
  )
}
