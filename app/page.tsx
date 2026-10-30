'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTalaDB, useCollection, useAggregate } from '@taladb/react'
import { openLoans, warrantiesExpiring, recentMemoriesPipeline, stats, ownMemoryCount } from '@/lib/queries'
import { useAsync } from '@/lib/use-async'
import { handOff } from '@/lib/handoff'
import { plural, relative, tint } from '@/lib/format'
import { MemoryCard, MemoryThread } from './components/MemoryCard'
import { MemorySkeleton, LoadingAnnounce, CardSkeleton } from './components/Skeleton'
import { Icon, IconTile, type IconName } from './components/Icon'
import { usePalette } from './components/CommandPalette'
import { ModKey } from './components/Nav'
import type { Entity, Memory, MemoryRow } from '@/lib/types'

const WELCOME_KEY = 'keepsake.welcome.dismissed'

const TRY = ['who has my camera?', 'bike keeps making a clicking noise', 'where is my drill?']

/**
 * What Keepsake is, then the thing you came to do, then what needs attention,
 * then the record.
 *
 * A first-time visitor gets ten seconds of explanation — what this is, that it
 * runs here, that what they see is sample data — and can put it away for good.
 * The two attention cards are pure document-engine work, a set difference for
 * loans and a range scan for warranties, and they earn the top of the screen
 * because they are the cases where an exact answer has consequences.
 */
export default function HomePage() {
  const db = useTalaDB()
  const router = useRouter()
  const palette = usePalette()
  const [draft, setDraft] = useState('')
  const [ask, setAsk] = useState('')
  const [welcome, setWelcome] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setWelcome(localStorage.getItem(WELCOME_KEY) !== '1')
    } catch {
      setWelcome(true)
    }
  }, [])

  function dismissWelcome() {
    setWelcome(false)
    try {
      localStorage.setItem(WELCOME_KEY, '1')
    } catch {}
  }

  const memories = useCollection<Memory>('memories')
  const { data: recent, loading } = useAggregate<Memory, MemoryRow>(
    memories,
    recentMemoriesPipeline(6),
  )

  const loans = useAsync(() => openLoans(db), [db])
  const warranties = useAsync(() => warrantiesExpiring(db, 60), [db])
  const counts = useAsync(() => stats(db), [db])
  const storage = useAsync(async () => (await db.storageInfo?.()) ?? null, [db])
  const own = useAsync(() => ownMemoryCount(db), [db])

  function submitDraft(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    handOff('text', text)
    router.push('/capture')
  }

  function submitAsk(e: React.FormEvent) {
    e.preventDefault()
    const q = ask.trim()
    if (q) handOff('q', q)
    router.push('/recall')
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-10">
      {welcome ? (
        <Welcome
          memoryCount={counts.data?.memoryCount}
          own={own.data ?? undefined}
          onDismiss={dismissWelcome}
        />
      ) : welcome === false ? (
        <header>
          <p className="muted text-[15px] font-medium">{greeting}</p>
          <h1 className="mt-1">Your memory, at a glance</h1>
        </header>
      ) : (
        <CardSkeleton className="h-40" />
      )}

      {/* --- ask ----------------------------------------------------------- */}
      <section aria-labelledby="ask-heading" className="space-y-3">
        <h2 id="ask-heading" className="sr-only">Search</h2>
        <form onSubmit={submitAsk} role="search">
          <label htmlFor="home-ask" className="sr-only">Ask about anything you have remembered</label>
          <div
            className="flex items-center gap-3 rounded-[16px] px-4 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ios-blue)_22%,transparent)]"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border-strong)', boxShadow: 'var(--shadow-card)' }}
          >
            <Icon name="search" className="muted h-5 w-5 shrink-0" strokeWidth={2.2} />
            <input
              id="home-ask"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="Ask anything — “who has my camera?”"
              enterKeyHint="search"
              autoComplete="off"
              className="h-14 min-w-0 flex-1 bg-transparent text-[17px] outline-none"
            />
            <button
              type="button"
              onClick={() => palette.open(ask)}
              className="kbd hidden h-6 px-1.5 md:inline-flex"
              aria-label="Open quick search"
              title="Quick search"
            >
              <ModKey />K
            </button>
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="muted mr-1 text-[13px]">Try</span>
          {TRY.map((q) => (
            <Link key={q} href={`/recall?q=${encodeURIComponent(q)}`} className="pill">
              {q}
            </Link>
          ))}
        </div>
      </section>

      {/* --- capture ------------------------------------------------------- */}
      <section>
        <form onSubmit={submitDraft}>
          <label htmlFor="capture" className="sr-only">
            What do you want to remember?
          </label>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 pt-4">
              <IconTile name="plus" color="var(--color-ios-blue)" size="sm" />
              <h2 className="text-[16px]">Remember something</h2>
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
              placeholder="Changed the bicycle chain today at CycleHouse for $40…"
              className="w-full resize-none bg-transparent px-4 pt-3 text-[16px] leading-relaxed outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3.5 pt-1">
              <p className="muted text-[13px]">The date, amount and thing are picked out for you to check.</p>
              <button type="submit" disabled={!draft.trim()} className="btn-primary shrink-0">
                Continue
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* --- attention ------------------------------------------------------ */}
      {(!!loans.data?.length || !!warranties.data?.length) && (
        <section className="space-y-3">
          <h2>Needs attention</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {!!loans.data?.length && (
              <SummaryCard
                title="Still lent out"
                icon="loan"
                color="var(--color-ios-blue)"
                count={loans.data.length}
                hint="Loans with no later return — two indexed reads, no ranking."
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
                title="Warranties ending"
                icon="warranty"
                color="var(--color-ios-orange)"
                count={warranties.data.length}
                hint="A range scan over the warranty-date index."
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
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2>On this device</h2>
          <Link href="/how-it-works" className="link shrink-0 text-[14px] font-medium">
            How it works
          </Link>
        </div>
        {counts.data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['Memories', counts.data.memoryCount, 'note'],
                ['Things, people & places', counts.data.entityCount, 'box'],
                ['Connections', counts.data.relationCount, 'link'],
                ['Searchable by meaning', counts.data.embedded, 'sparkle'],
              ] as const
            ).map(([label, value, icon]) => (
              <div key={label} className="card p-4">
                <Icon name={icon as IconName} className="muted h-4 w-4" strokeWidth={2.1} />
                <p className="tnum mt-3 text-[26px] font-bold leading-none tracking-tight">
                  {value.toLocaleString()}
                </p>
                <p className="muted mt-1.5 text-[13px]">{label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => <CardSkeleton key={i} className="h-[106px]" />)}
          </div>
        )}
        <p className="muted flex items-start gap-2 text-[13px] leading-relaxed">
          <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          <span>
            Stored with TalaDB in{' '}
            {storage.data
              ? storage.data.storage === 'opfs'
                ? 'this browser’s private file system (OPFS)'
                : 'this browser’s IndexedDB'
              : 'this browser'}
            . Every number on this page was read from it just now — not from a server.{' '}
            <Link href="/settings" className="link">Storage and export</Link>
          </span>
        </p>
      </section>

      {/* --- recent -------------------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2>Recently remembered</h2>
          <Link href="/timeline" className="link shrink-0 text-[14px] font-medium">
            See all
          </Link>
        </div>

        {loading ? (
          <>
            <LoadingAnnounce>Loading your memories…</LoadingAnnounce>
            <MemorySkeleton rows={3} />
          </>
        ) : recent.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Icon name="note" className="muted-more h-7 w-7" strokeWidth={1.8} />
            <p className="text-[16px] font-semibold">No memories yet</p>
            <p className="muted max-w-sm text-[14px]">Write one above, or restore the sample household from Settings.</p>
          </div>
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

function Welcome({
  memoryCount,
  own,
  onDismiss,
}: {
  memoryCount?: number
  own?: number
  onDismiss: () => void
}) {
  const sample = memoryCount !== undefined && own !== undefined ? memoryCount - own : undefined
  return (
    <section aria-labelledby="welcome-title" className="card-raised rise relative overflow-hidden p-6 md:p-9">
      <button onClick={onDismiss} className="btn-icon absolute right-3 top-3" aria-label="Dismiss the introduction">
        <Icon name="close" className="h-4 w-4" strokeWidth={2.2} />
      </button>

      <p className="eyebrow">Keepsake · powered by TalaDB</p>
      <h1 id="welcome-title" className="mt-3 max-w-2xl text-[32px] md:text-[44px]">
        Your memories. Your device. Your privacy.
      </h1>
      <p className="muted mt-4 max-w-2xl text-[16px] leading-relaxed md:text-[17px]">
        Keepsake remembers the things in your life — what you bought, fixed, lent and moved — and
        finds any of it when you ask in plain words. The database, its search indexes and the
        optional AI model all run inside this browser.
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {(
          [
            ['lock', 'Stored on this device', 'No account, no server. Your memories live in TalaDB, in this browser.'],
            ['database', 'Exact answers', 'Totals, loans, locations and warranties are computed, not guessed.'],
            ['sparkle', 'Search by meaning', '“Clicking noise” finds the memory that said “rattle”.'],
          ] as const
        ).map(([icon, title, body]) => (
          <li key={title} className="rounded-[14px] p-4" style={{ background: 'var(--color-fill)' }}>
            <Icon name={icon} className="h-[18px] w-[18px]" strokeWidth={2.1} />
            <p className="mt-2.5 text-[14px] font-semibold">{title}</p>
            <p className="muted mt-1 text-[13px] leading-relaxed">{body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Link href="/recall" className="btn-primary">
          <Icon name="search" className="h-4 w-4" strokeWidth={2.4} />
          Try a search
        </Link>
        <Link href="/capture" className="btn-ghost">
          <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />
          Remember something
        </Link>
        <Link href="/how-it-works" className="link px-2 py-2 text-[15px] font-medium sm:ml-1">
          How it works
        </Link>
      </div>

      <p
        className="mt-6 flex items-start gap-2 rounded-[12px] px-3.5 py-3 text-[13px] leading-relaxed"
        style={{ background: 'color-mix(in oklab, var(--color-ios-orange) 10%, transparent)' }}
      >
        <span className="shrink-0 whitespace-nowrap font-semibold" style={{ color: 'var(--color-ios-orange)' }}>Sample data</span>
        <span className="muted">
          {sample !== undefined ? `${sample.toLocaleString()} memories` : 'The memories here'} come from a
          fictional household so there is something to search.
          {own ? ` ${plural(own, 'memory is', 'memories are')} yours.` : ''} What you write is kept
          alongside them, and resetting the samples never touches it.
        </span>
      </p>
    </section>
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
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-3.5">
        <IconTile name={icon} color={color} size="sm" />
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <span
          className="tnum ml-auto rounded-full px-2 py-0.5 text-[12px] font-semibold"
          style={{ background: tint(color, 14), color }}
        >
          {count}
        </span>
      </div>
      <ul className="flex-1">{children}</ul>
      <p className="muted-more px-4 pb-3 pt-2 text-[12px]">{hint}</p>
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
      <Link prefetch={false} href={`/entity/${entity?._id ?? ''}`} className="list-row list-row-flush">
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
