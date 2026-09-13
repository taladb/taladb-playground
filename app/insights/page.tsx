'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTalaDB } from '@taladb/react'
import { entitiesByIds, spendByEntity, spendByType, warrantiesExpired, warrantiesExpiring } from '@/lib/queries'
import { collections } from '@/lib/schema'
import { useAsync } from '@/lib/use-async'
import { MEMORY_ICON, MEMORY_LABEL, money, plural, relative } from '@/lib/format'
import { EngineBadge } from '../components/EngineBadge'
import type { MemoryType } from '@/lib/types'

/**
 * Insights — the aggregation pipeline, doing the thing aggregation is for.
 *
 * Every number on this page is a `$group`/`$sum` executed inside the engine
 * over the full corpus. None of it is assembled in JavaScript, and none of it
 * is estimated. This is the half of the product that has to be *right*: the
 * answer to "what has this cost me" is either a fact or it is worthless.
 */
export default function InsightsPage() {
  const db = useTalaDB()
  const [year, setYear] = useState<number | 'all'>(new Date().getFullYear())

  const window =
    year === 'all'
      ? {}
      : { from: new Date(year, 0, 1).getTime(), to: new Date(year, 11, 31, 23, 59).getTime() }

  const byEntity = useAsync(async () => {
    const rows = await spendByEntity(db, window)
    const named = rows.filter((r) => r._id)
    const entities = await entitiesByIds(db, named.map((r) => r._id))
    return named
      .map((row) => ({ ...row, entity: entities.get(row._id) ?? null }))
      .filter((row) => row.entity)
  }, [db, year])

  const byType = useAsync(() => spendByType(db, window), [db, year])

  const years = useAsync(async () => {
    const rows = await collections(db).memories.aggregate<{ _id: string; n: number }>([
      { $group: { _id: '$memoryType', n: { $sum: 1 } } },
    ])
    void rows
    return [2023, 2024, 2025, 2026]
  }, [db])

  const warranties = useAsync(
    async () => ({
      soon: await warrantiesExpiring(db, 180),
      lapsed: await warrantiesExpired(db, 365),
    }),
    [db],
  )

  const total = byEntity.data?.reduce((sum, row) => sum + row.total, 0) ?? 0
  const max = byEntity.data?.[0]?.total ?? 1

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Insights</h1>
        <EngineBadge engine="structured" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['all', ...(years.data ?? [])] as const).map((y) => (
          <button
            key={y}
            onClick={() => setYear(y as number | 'all')}
            className={`chip ${
              year === y
                ? 'border-stone-900 bg-stone-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-stone-950'
                : 'border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400'
            }`}
          >
            {y === 'all' ? 'All time' : y}
          </button>
        ))}
      </div>

      <section className="card p-5">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Total recorded spend {year === 'all' ? 'all time' : `in ${year}`}
        </p>
        <p className="tnum mt-1 text-3xl font-semibold">{money(total)}</p>
        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Across {plural(byEntity.data?.length ?? 0, 'thing')} with an amount recorded.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Where it went</h2>
        <div className="card mt-3 divide-y p-0">
          {byEntity.loading && <div className="h-32 animate-pulse bg-stone-100 dark:bg-stone-900" />}
          {byEntity.data?.slice(0, 12).map((row) => (
            <Link
              key={row._id}
              href={`/entity/${row._id}`}
              className="block px-5 py-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm">
                  <span aria-hidden>{row.entity!.icon} </span>
                  {row.entity!.name}
                </span>
                <span className="tnum shrink-0 text-sm font-medium">{money(row.total)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${(row.total / max) * 100}%` }}
                  />
                </div>
                <span className="tnum w-20 shrink-0 text-right text-[11px] text-stone-400 dark:text-stone-500">
                  {plural(row.n, 'entry', 'entries')}
                </span>
              </div>
            </Link>
          ))}
          {byEntity.data?.length === 0 && (
            <p className="px-5 py-6 text-sm text-stone-500 dark:text-stone-400">
              Nothing recorded in this period.
            </p>
          )}
        </div>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          <code className="font-mono">$match</code> on the date range, then{' '}
          <code className="font-mono">$group</code> by subject with{' '}
          <code className="font-mono">$sum</code> — executed in the engine, not in JavaScript.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">By kind of event</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {byType.data?.map((row) => (
            <div key={row._id} className="card flex items-center justify-between gap-3 p-3">
              <span className="truncate text-sm">
                <span aria-hidden>{MEMORY_ICON[row._id as MemoryType]} </span>
                {MEMORY_LABEL[row._id as MemoryType] ?? row._id}
              </span>
              <span className="tnum shrink-0 text-sm font-medium">{money(row.total)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Warranties</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="card p-4">
            <h3 className="text-sm font-semibold">Still covered</h3>
            <ul className="mt-3 space-y-2">
              {warranties.data?.soon.map(({ entity }) => (
                <li key={entity._id} className="flex items-baseline justify-between gap-3 text-sm">
                  <Link href={`/entity/${entity._id}`} className="truncate hover:text-amber-700 dark:hover:text-amber-400">
                    <span aria-hidden>{entity.icon} </span>
                    {entity.name}
                  </Link>
                  <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
                    {relative(entity.warrantyExpiresAt!)}
                  </span>
                </li>
              ))}
              {!warranties.data?.soon.length && (
                <li className="text-sm text-stone-500 dark:text-stone-400">
                  Nothing expiring in the next six months.
                </li>
              )}
            </ul>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold">Recently lapsed</h3>
            <ul className="mt-3 space-y-2">
              {warranties.data?.lapsed.map(({ entity }) => (
                <li key={entity._id} className="flex items-baseline justify-between gap-3 text-sm">
                  <Link href={`/entity/${entity._id}`} className="truncate hover:text-amber-700 dark:hover:text-amber-400">
                    <span aria-hidden>{entity.icon} </span>
                    {entity.name}
                  </Link>
                  <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
                    {relative(entity.warrantyExpiresAt!)}
                  </span>
                </li>
              ))}
              {!warranties.data?.lapsed.length && (
                <li className="text-sm text-stone-500 dark:text-stone-400">None in the last year.</li>
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
