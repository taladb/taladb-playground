'use client'

import { useDeferredValue, useState } from 'react'
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  explainPipeline,
  type ExploreFilters,
  type SortKey,
} from '@/lib/queries'
import { useCatalogPage } from '@/lib/use-catalog'
import { useSeedStatus } from '@/lib/seed'
import { FilterPanel } from './components/FilterPanel'
import { ListingCard } from './components/ListingCard'

export default function ExplorePage() {
  const { docReady } = useSeedStatus()
  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortKey>('recommended')

  // Defer the filter so fast typing/slider drags don't thrash the engine.
  const deferred = useDeferredValue(filters)

  // One page of documents, matched/sorted/paged inside TalaDB.
  const { rows, total, loading, loadingMore, hasMore, loadMore, ms } = useCatalogPage(
    deferred,
    sort,
    docReady,
  )
  const activeCount = activeFilterCount(deferred)

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl bg-gradient-to-br from-indigo-600 to-blue-600 p-6 text-white shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Find your next stay</h1>
        <p className="mt-1 max-w-2xl text-sm text-indigo-50">
          Every listing, filter, and booking here lives in a database running{' '}
          <strong>inside your browser</strong>. The catalog is seeded once, then never
          downloaded again — each search below is matched, sorted and paged{' '}
          <strong>inside TalaDB</strong>, with no server round-trip.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/15 p-1.5 backdrop-blur">
          <span className="pl-2 text-lg">🔎</span>
          <input
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            placeholder="Search descriptions — try “beach”, “quiet garden”, “fireplace”…"
            className="w-full bg-transparent px-1 py-2 text-sm text-white placeholder:text-indigo-200 focus:outline-none"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <FilterPanel filters={filters} onChange={setFilters} />
        </aside>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {!docReady ? (
                'Loading catalog…'
              ) : (
                <>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {total.toLocaleString()}
                  </span>{' '}
                  stays{activeCount ? ` · ${activeCount} filter${activeCount > 1 ? 's' : ''}` : ''}
                  {ms !== null && (
                    <>
                      {' · '}
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        {ms} ms
                      </span>{' '}
                      on-device
                    </>
                  )}
                </>
              )}
            </p>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="recommended">Recommended</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="rating">Top rated</option>
            </select>
          </div>

          <QueryPreview text={explainPipeline(deferred, sort, 1)} total={total} shown={rows.length} />

          {loading ? (
            <GridSkeleton />
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500 dark:border-slate-700">
              No stays match these filters. Try widening your search.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {rows.map((l) => (
                  <ListingCard key={l.slug} listing={l} />
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mx-auto mt-2 rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
                >
                  {loadingMore
                    ? 'Loading…'
                    : `Show more (${(total - rows.length).toLocaleString()} left)`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QueryPreview({ text, total, shown }: { text: string; total: number; shown: number }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-100/60 text-xs dark:border-slate-800 dark:bg-slate-900/60">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-slate-500 dark:text-slate-400">
        The query TalaDB is running —{' '}
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {shown.toLocaleString()} document{shown === 1 ? '' : 's'} crossed into JS
        </span>{' '}
        (of {total.toLocaleString()} matched)
      </summary>
      <pre className="overflow-x-auto px-3 pb-3 font-mono text-[11px] leading-relaxed text-indigo-700 dark:text-indigo-300">
        {text}
      </pre>
    </details>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      ))}
    </div>
  )
}
