'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTalaDB } from '@taladb/react'
import type { ListingCardDoc } from './types'
import { collections } from './db-schema'
import { buildFilter, buildPagePipeline, PAGE_SIZE, type ExploreFilters, type SortKey } from './queries'

export interface CatalogPage {
  /** The listings to render — only the pages fetched so far. */
  rows: ListingCardDoc[]
  /** Total matches for the current filter, counted IN the engine. */
  total: number
  /** First page for the current filter still in flight. */
  loading: boolean
  /** A "show more" page is in flight. */
  loadingMore: boolean
  hasMore: boolean
  loadMore: () => void
  /** Engine time for the last page query, ms — surfaced in the UI. */
  ms: number | null
  error: string | null
}

/**
 * Read a page of the catalog straight out of the engine.
 *
 * `listings` is a read-only, local-only catalog: it is seeded once and never
 * written at runtime, so a live subscription (`useFind`) buys nothing — and a
 * live subscription over an unfiltered catalog is exactly what used to pull all
 * 10,000 documents into JS on every render just to show 24 cards.
 *
 * Instead each page is one `aggregate` call whose `$match`/`$sort`/`$skip`/
 * `$limit` run inside TalaDB, so only `PAGE_SIZE` documents ever cross the
 * worker boundary. The synced, mutable collections (bookings/favorites/reviews)
 * DO stay on live queries — see `useQuery` in the pages that read them.
 */
export function useCatalogPage(
  filters: ExploreFilters,
  sort: SortKey,
  enabled = true,
): CatalogPage {
  const db = useTalaDB()

  // One stable key per (filter, sort). Changing it resets paging to page 1.
  const key = useMemo(() => JSON.stringify([filters, sort]), [filters, sort])

  const [rows, setRows] = useState<ListingCardDoc[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [ms, setMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Guards a stale response from overwriting a newer one when the user changes
  // filters while a page is still in flight.
  const reqId = useRef(0)

  const fetchPage = useCallback(
    async (p: number, append: boolean) => {
      if (!enabled) return
      const id = ++reqId.current
      append ? setLoadingMore(true) : setLoading(true)
      setError(null)
      try {
        const { listings } = collections(db)
        const t0 = performance.now()
        // The count runs in the engine too — we never materialise the matches
        // just to take their length.
        const [docs, count] = await Promise.all([
          listings.aggregate<ListingCardDoc>(buildPagePipeline(filters, sort, p)),
          append ? Promise.resolve(-1) : listings.count(buildFilter(filters)),
        ])
        if (id !== reqId.current) return // superseded
        setMs(Math.round((performance.now() - t0) * 10) / 10)
        setRows((prev) => (append ? [...prev, ...docs] : docs))
        if (!append) setTotal(count)
      } catch (e) {
        if (id === reqId.current) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (id === reqId.current) {
          append ? setLoadingMore(false) : setLoading(false)
        }
      }
    },
    [db, filters, sort, enabled],
  )

  // Filter/sort changed (or the catalog just became available) → back to page 1.
  useEffect(() => {
    setPage(1)
    void fetchPage(1, false)
    // `key` is the serialised (filters, sort); fetchPage closes over both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  const loadMore = useCallback(() => {
    const next = page + 1
    setPage(next)
    void fetchPage(next, true)
  }, [page, fetchPage])

  return {
    rows,
    total,
    loading,
    loadingMore,
    hasMore: rows.length < total,
    loadMore,
    ms,
    error,
  }
}
