'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTalaDB, useCollection, useAggregate } from '@taladb/react'
import { openLoans, warrantiesExpiring, recentMemoriesPipeline, stats } from '@/lib/queries'
import { useAsync } from '@/lib/use-async'
import { fullDate, plural, relative } from '@/lib/format'
import { MemoryCard } from './components/MemoryCard'
import { EngineBadge } from './components/EngineBadge'
import type { Memory, MemoryRow } from '@/lib/types'

/**
 * Capture first.
 *
 * The spec's central claim is that the fundamental action is "remember this",
 * not "create a note", so the first thing on the screen is a box to type into
 * and everything else is what the database already knows.
 *
 * The two attention panels underneath are both pure document-engine work — a
 * set difference for loans, a range scan for warranties. They are here because
 * they are the cases where an exact answer has real consequences: someone still
 * has your camera, and a warranty runs out on a date.
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
    if (!text) return
    router.push(`/capture?text=${encodeURIComponent(text)}`)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-10">
      {/* --- capture ------------------------------------------------------- */}
      <section>
        <p className="text-sm text-stone-500 dark:text-stone-400">{greeting}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          What do you want to remember?
        </h1>

        <form onSubmit={submitDraft} className="mt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitDraft(e)
            }}
            rows={3}
            placeholder="Changed the bicycle chain today at CycleHouse for ₱1,200."
            className="field resize-none text-base leading-relaxed"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Write it the way you would say it. The date, the amount and the thing it happened to
              get picked out for you to confirm.
            </p>
            <button type="submit" disabled={!draft.trim()} className="btn-primary shrink-0">
              Continue
            </button>
          </div>
        </form>
      </section>

      {/* --- things that need attention ------------------------------------ */}
      {(loans.data?.length || warranties.data?.length) && (
        <section className="grid gap-4 md:grid-cols-2">
          {!!loans.data?.length && (
            <div className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Still lent out</h2>
                <EngineBadge engine="structured" size="xs" />
              </div>
              <ul className="mt-3 space-y-2.5">
                {loans.data.map((loan) => (
                  <li key={loan.memory._id} className="flex items-baseline justify-between gap-3 text-sm">
                    <Link
                      href={`/entity/${loan.entity?._id ?? ''}`}
                      className="truncate hover:text-amber-700 dark:hover:text-amber-400"
                    >
                      <span aria-hidden>{loan.entity?.icon} </span>
                      {loan.entity?.name ?? 'Unknown'}
                    </Link>
                    <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
                      {loan.borrower?.name ?? 'someone'} · {plural(loan.daysOut, 'day')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-stone-400 dark:text-stone-500">
                Loans with no later return recorded against them.
              </p>
            </div>
          )}

          {!!warranties.data?.length && (
            <div className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Warranties running out</h2>
                <EngineBadge engine="structured" size="xs" />
              </div>
              <ul className="mt-3 space-y-2.5">
                {warranties.data.map(({ entity, daysLeft }) => (
                  <li key={entity._id} className="flex items-baseline justify-between gap-3 text-sm">
                    <Link
                      href={`/entity/${entity._id}`}
                      className="truncate hover:text-amber-700 dark:hover:text-amber-400"
                    >
                      <span aria-hidden>{entity.icon} </span>
                      {entity.name}
                    </Link>
                    <span
                      className={`shrink-0 text-xs ${
                        daysLeft <= 30
                          ? 'font-medium text-rose-600 dark:text-rose-400'
                          : 'text-stone-500 dark:text-stone-400'
                      }`}
                    >
                      {relative(entity.warrantyExpiresAt!)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-stone-400 dark:text-stone-500">
                Range scan over the warranty date index.
              </p>
            </div>
          )}
        </section>
      )}

      {/* --- recent -------------------------------------------------------- */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Recently remembered</h2>
          <Link href="/timeline" className="text-sm text-stone-500 hover:text-amber-700 dark:hover:text-amber-400">
            Full timeline →
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {loading && <div className="card h-24 animate-pulse bg-stone-100 dark:bg-stone-900" />}
          {recent.map((memory) => (
            <MemoryCard key={memory._id} memory={memory} />
          ))}
        </div>
      </section>

      {/* --- what is on this device ---------------------------------------- */}
      {counts.data && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">On this device</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Things & people', counts.data.entityCount],
              ['Memories', counts.data.memoryCount],
              ['Connections', counts.data.relationCount],
              ['Embedded', counts.data.embedded],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs text-stone-500 dark:text-stone-400">{label}</dt>
                <dd className="tnum mt-0.5 text-xl font-semibold">
                  {(value as number).toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-stone-500 dark:text-stone-400">
            Seeded once on your first visit and stored in OPFS. Every page since has been read from
            disk — no request has left this browser.{' '}
            <Link href="/settings" className="underline underline-offset-2">
              Storage and export
            </Link>
          </p>
        </section>
      )}

      <p className="text-center text-xs text-stone-400 dark:text-stone-600">
        {recent[0] ? `Last memory: ${fullDate(recent[0].occurredAt)}` : null}
      </p>
    </div>
  )
}
