'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { useCollection, useFind } from '@taladb/react'
import type { Listing } from '@/lib/types'
import { buildFilter, DEFAULT_FILTERS, sortListings, type ExploreFilters, type SortKey } from '@/lib/queries'
import { useSeedStatus } from '@/lib/seed'
import { FilterPanel } from './components/FilterPanel'
import { ListingCard } from './components/ListingCard'

const PAGE_SIZE = 24

export default function ExplorePage() {
  const { docReady } = useSeedStatus()
  const listings = useCollection<Listing>('listings')
  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortKey>('recommended')
  const [page, setPage] = useState(1)

  // Defer the filter so fast typing/slider drags don't thrash the live query.
  const deferred = useDeferredValue(filters)
  const filter = useMemo(() => buildFilter(deferred), [deferred])
  const { data, loading } = useFind(listings, filter)

  const sorted = useMemo(() => sortListings(data, sort), [data, sort])
  const visible = sorted.slice(0, page * PAGE_SIZE)
  const activeCount =
    deferred.cities.length + deferred.types.length + deferred.amenities.length +
    (deferred.keyword ? 1 : 0) + (deferred.minGuests > 1 ? 1 : 0) + (deferred.maxPrice < 500 ? 1 : 0)

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl bg-gradient-to-br from-indigo-600 to-blue-600 p-6 text-white shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Find your next stay</h1>
        <p className="mt-1 max-w-2xl text-sm text-indigo-50">
          Every listing, filter, and booking here lives in a database running{' '}
          <strong>inside your browser</strong>. This page is powered entirely by TalaDB&apos;s
          document queries — structured filters and full-text search, no server round-trips.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/15 p-1.5 backdrop-blur">
          <span className="pl-2 text-lg">🔎</span>
          <input
            value={filters.keyword}
            onChange={(e) => {
              setFilters({ ...filters, keyword: e.target.value })
              setPage(1)
            }}
            placeholder="Search descriptions — try “beach”, “quiet garden”, “fireplace”…"
            className="w-full bg-transparent px-1 py-2 text-sm text-white placeholder:text-indigo-200 focus:outline-none"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <FilterPanel
            filters={filters}
            onChange={(f) => {
              setFilters(f)
              setPage(1)
            }}
          />
        </aside>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {!docReady ? (
                'Loading catalog…'
              ) : (
                <>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {sorted.length.toLocaleString()}
                  </span>{' '}
                  stays{activeCount ? ` · ${activeCount} filter${activeCount > 1 ? 's' : ''}` : ''}
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

          <QueryPreview filter={filter} />

          {loading && !docReady ? (
            <GridSkeleton />
          ) : sorted.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500 dark:border-slate-700">
              No stays match these filters. Try widening your search.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {visible.map((l) => (
                  <ListingCard key={l.slug} listing={l} />
                ))}
              </div>
              {visible.length < sorted.length && (
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="mx-auto mt-2 rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900"
                >
                  Show more ({(sorted.length - visible.length).toLocaleString()} left)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QueryPreview({ filter }: { filter: object | undefined }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-100/60 text-xs dark:border-slate-800 dark:bg-slate-900/60">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-slate-500 dark:text-slate-400">
        The query TalaDB is running
      </summary>
      <pre className="overflow-x-auto px-3 pb-3 font-mono text-[11px] leading-relaxed text-indigo-700 dark:text-indigo-300">
        {`listings.find(${JSON.stringify(filter ?? {}, null, 2)})`}
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
