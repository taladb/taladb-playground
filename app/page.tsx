'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTalaDB, useCollection, useAggregate } from '@taladb/react'
import { openLoans, warrantiesExpiring, recentMemoriesPipeline, stats } from '@/lib/queries'
import { useAsync } from '@/lib/use-async'
import { plural, relative, tint } from '@/lib/format'
import { MemoryCard, MemoryThread } from './components/MemoryCard'
import { MemorySkeleton, LoadingAnnounce } from './components/Skeleton'
import { Icon, IconTile, type IconName } from './components/Icon'
import type { Entity, Memory, MemoryRow } from '@/lib/types'

/**
 * Capture first, then what needs attention, then the record.
 *
 * The ordering is Health's: the thing you came to do, the things that want you,
 * and then the history underneath. The two attention cards are pure
 * document-engine work — a set difference for loans, a range scan for
 * warranties — and they earn the top of the screen because they are the cases
 * where an exact answer has consequences.
 */
export default function HomePage() {
  const db = useTalaDB()
  const router = useRouter()
  const [draft, setDraft] = useState('')

  const memories = useCollection<Memory>('memories')
  const { data: recent, loading } = useAggregate<Memory, MemoryRow>(
    memories,
    recentMemoriesPipeline(6),
  )

  const loans = useAsync(() => openLoans(db), [db])
  const warranties = useAsync(() => warrantiesExpiring(db, 60), [db])
  const counts = useAsync(() => stats(db), [db])

  function submitDraft(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (text) router.push(`/capture?text=${encodeURIComponent(text)}`)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening'

  return (
    <div className="space-y-8">
      <header>
        <p className="muted text-[15px] font-medium">{greeting}</p>
        <h1 className="mt-0.5">Summary</h1>
      </header>

      {/* --- capture ------------------------------------------------------- */}
      <section>
        <form onSubmit={submitDraft}>
          <label htmlFor="capture" className="sr-only">
            What do you want to remember?
          </label>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 pt-4">
              <IconTile name="sparkle" color="var(--color-ios-blue)" size="sm" />
              <h2 className="text-[17px]">Remember Something</h2>
            </div>
            <textarea
              id="capture"
              name="memory"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitDraft(e)
              }}
              rows={2}
              placeholder="Changed the bicycle chain today at CycleHouse for ₱1,200…"
              className="w-full resize-none bg-transparent px-4 pt-3 text-[17px] leading-relaxed outline-none"
            />
            <div className="flex items-center justify-between gap-3 px-4 pb-3.5 pt-1">
              <p className="muted text-[13px]">The date, amount and thing get picked out for you.</p>
              <button
                type="submit"
                disabled={!draft.trim()}
                className="btn-primary shrink-0 px-4 py-2 text-[15px]"
              >
                Continue
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* --- attention ------------------------------------------------------ */}
      {(!!loans.data?.length || !!warranties.data?.length) && (
        <section className="space-y-2.5">
          <h2 className="px-1">Needs Attention</h2>
          <div className="grid gap-2.5 md:grid-cols-2">
            {!!loans.data?.length && (
              <SummaryCard
                title="Still Lent Out"
                icon="loan"
                color="var(--color-ios-blue)"
                count={loans.data.length}
                hint="Loans with no later return recorded."
              >
                {loans.data.map((loan) => (
                  <Row
                    key={loan.memory._id}
                    entity={loan.entity}
                    meta={`${loan.borrower?.name ?? 'someone'} · ${plural(loan.daysOut, 'day')}`}
                  />
                ))}
              </SummaryCard>
            )}

            {!!warranties.data?.length && (
              <SummaryCard
                title="Warranties Ending"
                icon="warranty"
                color="var(--color-ios-orange)"
                count={warranties.data.length}
                hint="Range scan over the warranty date index."
              >
                {warranties.data.map(({ entity, daysLeft }) => (
                  <Row
                    key={entity._id}
                    entity={entity}
                    meta={relative(entity.warrantyExpiresAt!)}
                    urgent={daysLeft <= 30}
                  />
                ))}
              </SummaryCard>
            )}
          </div>
        </section>
      )}

      {/* --- on this device -------------------------------------------------- */}
      {counts.data && (
        <section className="space-y-2.5">
          <h2 className="px-1">On This Device</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(
              [
                ['Things', counts.data.entityCount, 'var(--color-ios-blue)', 'box'],
                ['Memories', counts.data.memoryCount, 'var(--color-ios-green)', 'note'],
                ['Links', counts.data.relationCount, 'var(--color-ios-indigo)', 'project'],
                ['Embedded', counts.data.embedded, 'var(--color-ios-purple)', 'sparkle'],
              ] as const
            ).map(([label, value, color, icon]) => (
              <div key={label} className="card p-3.5">
                <IconTile name={icon as IconName} color={color} size="sm" />
                <p className="tnum mt-2.5 text-[26px] font-bold leading-none tracking-tight" style={{ color }}>
                  {value.toLocaleString()}
                </p>
                <p className="muted mt-1 text-[13px]">{label}</p>
              </div>
            ))}
          </div>
          <p className="muted px-1 text-[13px] leading-relaxed">
            Seeded once on your first visit and stored in OPFS. Every page since has been read from
            disk — no request has left this browser.{' '}
            <Link href="/settings" style={{ color: 'var(--color-ios-blue)' }}>
              Storage and export
            </Link>
          </p>
        </section>
      )}

      {/* --- recent -------------------------------------------------------- */}
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-4 px-1">
          <h2>Recently Remembered</h2>
          <Link href="/timeline" className="shrink-0 text-[15px]" style={{ color: 'var(--color-ios-blue)' }}>
            See All
          </Link>
        </div>

        {loading ? (
          <>
            <LoadingAnnounce>Loading your memories…</LoadingAnnounce>
            <MemorySkeleton rows={3} />
          </>
        ) : (
          <MemoryThread>
            {recent.map((memory, i) => (
              <MemoryCard key={memory._id} memory={memory} index={i} />
            ))}
          </MemoryThread>
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  title,
  icon,
  color,
  count,
  hint,
  children,
}: {
  title: string
  icon: IconName
  color: string
  count: number
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-3.5">
        <IconTile name={icon} color={color} size="sm" />
        <h3 className="text-[15px] font-semibold" style={{ color }}>
          {title}
        </h3>
        <span
          className="tnum ml-auto rounded-full px-2 py-0.5 text-[13px] font-semibold"
          style={{ background: tint(color, 14), color }}
        >
          {count}
        </span>
      </div>
      <ul className="flex-1">{children}</ul>
      <p className="muted-more px-4 pb-3 pt-2 text-[11px]">{hint}</p>
    </div>
  )
}

function Row({
  entity,
  meta,
  urgent = false,
}: {
  entity: Entity | null
  meta: string
  urgent?: boolean
}) {
  return (
    <li>
      <Link href={`/entity/${entity?._id ?? ''}`} className="list-row list-row-flush">
        <span aria-hidden className="text-lg">
          {entity?.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px]">{entity?.name ?? 'Unknown'}</span>
        <span
          className="shrink-0 text-[13px]"
          style={urgent ? { color: 'var(--color-ios-red)', fontWeight: 600 } : { color: 'var(--color-label-2)' }}
        >
          {meta}
        </span>
        <Icon name="chevron" className="muted-more h-4 w-4 shrink-0" strokeWidth={2.5} />
      </Link>
    </li>
  )
}
