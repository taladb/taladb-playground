'use client'

import Link from 'next/link'
import { MEMORY_COLOR, MEMORY_LABEL, money, fullDate } from '@/lib/format'
import { snippet } from '@/lib/highlight'
import { isSampleMemory } from '@/lib/queries'
import { IconTile } from './Icon'
import { ConfidenceMark } from './ConfidenceMark'
import { Highlight } from './Highlight'
import type { MemoryRow } from '@/lib/types'

/**
 * One event in a timeline.
 *
 * The coloured tile does the sorting: a column of these reads as orange for
 * servicing, green for money, blue for lending, before a single word is
 * processed. The tile also threads onto the rail, so the same component works
 * both inside a timeline and standing alone as a search result.
 *
 * Given `terms`, it becomes a search result: the query's words are marked, and
 * a long memory is cut to the window around its first match.
 */
export function MemoryCard({
  memory,
  showEntities = true,
  index = 0,
  terms,
  children,
}: {
  memory: MemoryRow
  showEntities?: boolean
  /** Position in its list, for the entrance stagger. */
  index?: number
  /** Query words to mark, when this card is a search result. */
  terms?: string[]
  children?: React.ReactNode
}) {
  const color = MEMORY_COLOR[memory.memoryType]
  const body = terms ? snippet(memory.content, terms) : memory.content

  return (
    <article
      className="rise relative flex gap-3"
      style={{ '--i': index } as React.CSSProperties}
    >
      <span className="relative z-10 mt-3.5">
        <IconTile name={memory.memoryType} color={color} />
      </span>

      <div className="card min-w-0 flex-1 p-4 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-[15px] font-semibold leading-snug">
            <Link prefetch={false} href={`/memory/${memory._id}`} className="hover:underline hover:underline-offset-2">
              {terms ? <Highlight text={memory.title} terms={terms} /> : memory.title}
            </Link>{' '}
            <ConfidenceMark confidence={memory.confidence} sourceType={memory.sourceType} />
          </h3>
          {memory.amount !== undefined && (
            <span className="tnum shrink-0 text-[14px] font-semibold">{money(memory.amount, memory.currency)}</span>
          )}
        </div>

        <p className={`muted mt-1 break-words text-[14px] leading-relaxed ${terms ? '' : 'line-clamp-3'}`}>
          {terms ? <Highlight text={body} terms={terms} /> : body}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color }}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            {MEMORY_LABEL[memory.memoryType]}
          </span>
          <span aria-hidden className="muted-more">·</span>
          <time className="tnum muted" dateTime={new Date(memory.occurredAt).toISOString()}>
            {fullDate(memory.occurredAt)}
          </time>
          {isSampleMemory(memory) && (
            <>
              <span aria-hidden className="muted-more">·</span>
              <span className="muted-more" title="Part of the demo corpus, not something you wrote">
                Sample
              </span>
            </>
          )}

          {showEntities && memory.entityIds.length > 0 && (
            <span className="flex flex-wrap gap-1.5 sm:ml-auto">
              {memory.entityIds.map((id, i) => (
                <Link prefetch={false}
                  key={id}
                  href={`/entity/${id}`}
                  className="chip max-w-[14rem] truncate transition-colors hover:text-[var(--color-label)]"
                  style={{ background: 'var(--color-fill)', color: 'var(--color-label-2)' }}
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
    <div className="relative space-y-2.5">
      <span aria-hidden className="rail" />
      {children}
    </div>
  )
}
