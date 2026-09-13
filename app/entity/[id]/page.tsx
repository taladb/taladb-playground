'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { useTalaDB, useCollection, useAggregate } from '@taladb/react'
import {
  entityById, entityTimelinePipeline, spendForEntity,
} from '@/lib/queries'
import { contentsOf, locateEntity, relatedEntities, relationLabel } from '@/lib/graph'
import { useAsync } from '@/lib/use-async'
import { ENTITY_LABEL, fullDate, money, plural, relative, yearOf } from '@/lib/format'
import { MemoryCard } from '@/app/components/MemoryCard'
import { EngineBadge } from '@/app/components/EngineBadge'
import type { Memory, MemoryRow } from '@/lib/types'

type Tab = 'timeline' | 'info' | 'connections'

/**
 * An entity and its history.
 *
 * The spec's core insight is that an object does not only have attributes, it
 * has a timeline — so the timeline is the default tab and the attributes are
 * behind the second one. Every section on this page is a different kind of
 * query against the same database, and each says which.
 */
export default function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const db = useTalaDB()
  const [tab, setTab] = useState<Tab>('timeline')

  const entity = useAsync(() => entityById(db, id), [db, id])
  const location = useAsync(() => locateEntity(db, id), [db, id])
  const spend = useAsync(() => spendForEntity(db, id), [db, id])

  const memories = useCollection<Memory>('memories')
  const { data: timeline, loading } = useAggregate<Memory, MemoryRow>(
    memories,
    entityTimelinePipeline(id),
  )

  if (entity.loading) {
    return <div className="card h-40 animate-pulse bg-stone-100 dark:bg-stone-900" />
  }

  if (!entity.data) {
    return (
      <div className="card p-6">
        <p className="text-sm">That thing is not in your memory.</p>
        <Link href="/things" className="btn-ghost mt-4 text-sm">
          Back to your things
        </Link>
      </div>
    )
  }

  const e = entity.data

  return (
    <div className="space-y-6">
      {/* --- header -------------------------------------------------------- */}
      <header className="flex items-start gap-4">
        <span className="text-4xl leading-none" aria-hidden>
          {e.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{e.name}</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {e.category || ENTITY_LABEL[e.entityType]}
            {e.manufacturer && ` · ${e.manufacturer}`}
            {e.model && ` ${e.model}`}
          </p>
          {e.description && (
            <p className="mt-2 max-w-2xl text-sm text-stone-600 dark:text-stone-300">
              {e.description}
            </p>
          )}
        </div>
      </header>

      {/* --- at a glance: three engines, three answers ---------------------- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500 dark:text-stone-400">Where it is</p>
            <EngineBadge engine="graph" size="xs" />
          </div>
          {location.data?.path.length ? (
            <>
              <p className="mt-1.5 text-sm font-medium leading-snug">
                {location.data.path.map((p) => p.name).join(' → ')}
              </p>
              {location.data.via && (
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  Moved {relative(location.data.via.occurredAt)}
                </p>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-sm text-stone-400 dark:text-stone-500">Not recorded</p>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500 dark:text-stone-400">Total recorded spend</p>
            <EngineBadge engine="structured" size="xs" />
          </div>
          <p className="tnum mt-1.5 text-sm font-medium">
            {spend.data ? money(spend.data.total) : '—'}
          </p>
          {spend.data && (
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              over {plural(spend.data.n, 'memory', 'memories')}
            </p>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500 dark:text-stone-400">Warranty</p>
            <EngineBadge engine="structured" size="xs" />
          </div>
          {e.warrantyExpiresAt ? (
            <>
              <p className="mt-1.5 text-sm font-medium">{fullDate(e.warrantyExpiresAt)}</p>
              <p
                className={`mt-1 text-xs ${
                  e.warrantyExpiresAt < Date.now()
                    ? 'text-stone-500 dark:text-stone-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {e.warrantyExpiresAt < Date.now() ? 'Expired' : 'Covered'}{' '}
                {relative(e.warrantyExpiresAt)}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-stone-400 dark:text-stone-500">None recorded</p>
          )}
        </div>
      </div>

      {/* --- tabs ---------------------------------------------------------- */}
      <div className="flex gap-1 border-b">
        {(
          [
            ['timeline', `Timeline (${timeline.length})`],
            ['info', 'Details'],
            ['connections', 'Connections'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === key
                ? 'border-amber-500 font-medium text-stone-900 dark:text-stone-100'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && <Timeline memories={timeline} loading={loading} />}
      {tab === 'info' && <Details entityId={id} />}
      {tab === 'connections' && <Connections entityId={id} />}
    </div>
  )
}

/** Chronological history, grouped by year so a long life stays readable. */
function Timeline({ memories, loading }: { memories: MemoryRow[]; loading: boolean }) {
  if (loading) {
    return <div className="card h-32 animate-pulse bg-stone-100 dark:bg-stone-900" />
  }

  if (!memories.length) {
    return (
      <p className="card p-6 text-sm text-stone-500 dark:text-stone-400">
        Nothing has happened to this yet.
      </p>
    )
  }

  const byYear = new Map<number, MemoryRow[]>()
  for (const memory of memories) {
    const year = yearOf(memory.occurredAt)
    const list = byYear.get(year)
    if (list) list.push(memory)
    else byYear.set(year, [memory])
  }

  return (
    <div className="space-y-8">
      {[...byYear.entries()].map(([year, rows]) => (
        <section key={year}>
          <h2 className="tnum sticky top-14 z-10 -mx-1 bg-stone-50/90 px-1 py-1 text-sm font-semibold text-stone-400 backdrop-blur dark:bg-stone-950/90 dark:text-stone-500">
            {year}
          </h2>
          <div className="mt-2 space-y-3">
            {rows.map((memory) => (
              <MemoryCard key={memory._id} memory={memory} showEntities={false} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Details({ entityId }: { entityId: string }) {
  const db = useTalaDB()
  const entity = useAsync(() => entityById(db, entityId), [db, entityId])
  const e = entity.data
  if (!e) return null

  const rows: Array<[string, string]> = [
    ...(e.manufacturer ? [['Manufacturer', e.manufacturer] as [string, string]] : []),
    ...(e.model ? [['Model', e.model] as [string, string]] : []),
    ...(e.serialNumber ? [['Serial number', e.serialNumber] as [string, string]] : []),
    ...(e.purchasedAt ? [['Purchased', fullDate(e.purchasedAt)] as [string, string]] : []),
    ...(e.purchasePrice !== undefined
      ? [['Purchase price', money(e.purchasePrice)] as [string, string]]
      : []),
    ...(e.condition ? [['Condition', e.condition] as [string, string]] : []),
    ...Object.entries(e.attributes ?? {}),
  ]

  return (
    <div className="space-y-4">
      {rows.length > 0 ? (
        <dl className="card divide-y p-0">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-4 px-5 py-3 text-sm">
              <dt className="w-40 shrink-0 text-stone-500 dark:text-stone-400">{label}</dt>
              <dd className="min-w-0 flex-1 font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="card p-6 text-sm text-stone-500 dark:text-stone-400">
          No details recorded.
        </p>
      )}

      {!!e.tags?.length && (
        <div className="flex flex-wrap gap-1.5">
          {e.tags.map((tag) => (
            <span
              key={tag}
              className="chip border-stone-200 bg-white text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-500 dark:text-stone-400">
        Core fields are columns; everything below them lives in a free-form attribute map, so a
        bicycle can record a chain model and a laptop can record a charger wattage without the
        schema knowing either exists.
      </p>
    </div>
  )
}

function Connections({ entityId }: { entityId: string }) {
  const db = useTalaDB()
  const related = useAsync(() => relatedEntities(db, entityId), [db, entityId])
  const contents = useAsync(() => contentsOf(db, entityId), [db, entityId])

  const groups = related.data ?? []
  const inside = contents.data ?? []

  if (related.loading) {
    return <div className="card h-24 animate-pulse bg-stone-100 dark:bg-stone-900" />
  }

  if (!groups.length && !inside.length) {
    return (
      <p className="card p-6 text-sm text-stone-500 dark:text-stone-400">
        Nothing is connected to this yet.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <EngineBadge engine="graph" size="xs" />
        <p className="text-xs text-stone-500 dark:text-stone-400">
          One hop over the relations collection, both directions.
        </p>
      </div>

      {!!inside.length && (
        <section>
          <h2 className="text-sm font-semibold">Kept here</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {inside.map((child) => (
              <Link
                key={child._id}
                href={`/entity/${child._id}`}
                className="chip border-stone-200 bg-white hover:border-amber-400 dark:border-stone-700 dark:bg-stone-900"
              >
                <span aria-hidden>{child.icon}</span>
                {child.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section key={`${group.relationType}-${group.inbound}`}>
          <h2 className="text-sm font-semibold">
            {relationLabel(group.relationType, group.inbound)}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.entities.map((other) => (
              <Link
                key={other._id}
                href={`/entity/${other._id}`}
                className="chip border-stone-200 bg-white hover:border-amber-400 dark:border-stone-700 dark:bg-stone-900"
              >
                <span aria-hidden>{other.icon}</span>
                {other.name}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
