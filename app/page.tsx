'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTalaDB, useCollection, useAggregate } from '@taladb/react'
import { openLoans, warrantiesExpiring, recentMemoriesPipeline, stats } from '@/lib/queries'
import { useAsync } from '@/lib/use-async'
import { plural, relative } from '@/lib/format'
import { MemoryCard, MemoryThread } from './components/MemoryCard'
import { MemorySkeleton, LoadingAnnounce } from './components/Skeleton'
import { EngineBadge } from './components/EngineBadge'
import type { Entity, Memory, MemoryRow } from '@/lib/types'

/**
 * Capture first.
 *
 * The spec's central claim is that the fundamental action is "remember this",
 * not "create a note" — so the first thing on the screen is a box to type into,
 * and everything else is what the database already knows.
 *
 * The two attention panels beneath it are pure document-engine work: a set
 * difference for loans, a range scan for warranties. They earn the space
 * because they are the cases where an exact answer has consequences — someone
 * still has your camera, and a warranty runs out on a date.
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
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-12">
      {/* --- capture ------------------------------------------------------- */}
      <section>
        <p className="eyebrow">{greeting}</p>
        <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight md:text-4xl">
          What do you want to remember?
        </h1>

        <form onSubmit={submitDraft} className="mt-5">
          <label htmlFor="capture" className="sr-only">
            What do you want to remember?
          </label>
          <div className="card-raised overflow-hidden focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-500/15">
            <textarea
              id="capture"
              name="memory"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitDraft(e)
              }}
              rows={3}
              placeholder="Changed the bicycle chain today at CycleHouse for ₱1,200…"
              className="w-full resize-none bg-transparent px-4 pt-4 font-serif text-[17px] leading-relaxed
                         outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-stone-400
                         dark:placeholder:text-stone-500"
            />
            <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
              <p className="text-xs text-stone-500 dark:text-stone-400">
                The date, the amount and the thing it happened to get picked out for you.
              </p>
              <button type="submit" disabled={!draft.trim()} className="btn-primary shrink-0 py-1.5">
                Continue
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* --- things that need attention ------------------------------------ */}
      {(!!loans.data?.length || !!warranties.data?.length) && (
        <section className="grid gap-4 md:grid-cols-2">
          {!!loans.data?.length && (
            <Panel title="Still Lent Out" hint="Loans with no later return recorded against them.">
              {loans.data.map((loan) => (
                <Row
                  key={loan.memory._id}
                  entity={loan.entity}
                  meta={`${loan.borrower?.name ?? 'someone'} · ${plural(loan.daysOut, 'day')}`}
                />
              ))}
            </Panel>
          )}

          {!!warranties.data?.length && (
            <Panel
              title="Warranties Running Out"
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
            </Panel>
          )}
        </section>
      )}

      {/* --- recent -------------------------------------------------------- */}
      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Recently Remembered</h2>
          <Link
            href="/timeline"
            className="shrink-0 text-sm text-stone-500 transition-colors hover:text-amber-700 dark:hover:text-amber-400"
          >
            Full timeline →
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

      {/* --- what is on this device ---------------------------------------- */}
      {counts.data && (
        <section className="card p-6">
          <h2 className="eyebrow">On This Device</h2>
          <dl className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {(
              [
                ['Things & people', counts.data.entityCount],
                ['Memories', counts.data.memoryCount],
                ['Connections', counts.data.relationCount],
                ['Embedded', counts.data.embedded],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dd className="tnum font-serif text-3xl font-semibold leading-none">
                  {value.toLocaleString()}
                </dd>
                <dt className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">{label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            Seeded once on your first visit and stored in OPFS. Every page since has been read from
            disk — no request has left this browser.{' '}
            <Link href="/settings" className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-400">
              Storage and export
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <EngineBadge engine="structured" size="xs" />
      </div>
      <ul className="mt-3.5 flex-1 divide-y">{children}</ul>
      <p className="mt-3 text-[11px] text-stone-400 dark:text-stone-500">{hint}</p>
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
      <Link
        href={`/entity/${entity?._id ?? ''}`}
        className="-mx-2 flex items-baseline justify-between gap-3 rounded-lg px-2 py-2
                   transition-colors hover:bg-stone-100/70 dark:hover:bg-stone-800/50"
      >
        <span className="min-w-0 truncate text-sm">
          <span aria-hidden>{entity?.icon} </span>
          {entity?.name ?? 'Unknown'}
        </span>
        <span
          className={`shrink-0 text-xs ${
            urgent
              ? 'font-medium text-rose-600 dark:text-rose-400'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          {meta}
        </span>
      </Link>
    </li>
  )
}
