'use client'

import { useCallback, useMemo } from 'react'
import { useMutation, type WriteOp } from '@taladb/react'
import type { Document } from 'taladb'
import type { Booking, Favorite, Review } from './types'
import { BOOKING_V, FAVORITE_V, REVIEW_V, WRITE_SCHEMAS } from './db-schema'

/**
 * `useMutation` gives us the local-first write + durable outbox + bounded retry.
 * What it does NOT give us is the strict local validation the standards doc
 * requires ("be strict where writes are local and reversible"): the hook resolves
 * its collection via `useCollection(name)`, which calls `db.collection(name)`
 * with no options — so the Zod `schema` and the `_v` stamp we attach in
 * `collections()` are bypassed on this path.
 *
 * (The *tolerant* half still applies: `syncSchema` is registered on the db when
 * `collections(db)` first runs, and `db.sync()` reads it from there — so pulled
 * documents are still validated/quarantined in the engine.)
 *
 * So we close the local half here: parse and stamp `_v` before the document
 * reaches the hook. Invalid local writes hard-fail at the call site, exactly
 * where the caller can handle them, and every document we author carries its
 * shape version.
 */
function useValidatedMutation<T extends Document>(collection: 'bookings' | 'favorites' | 'reviews', version: number) {
  const inner = useMutation<T>({ collection })
  const schema = WRITE_SCHEMAS[collection]

  const write = useCallback(
    (op: WriteOp<T>): WriteOp<T> => {
      if (op.type === 'insert') {
        const doc = { ...op.doc, _v: version }
        schema.parse(doc) // throws on a bad local write — by design
        return { type: 'insert', doc: doc as Omit<T, '_id'> }
      }
      return op
    },
    [schema, version],
  )

  return useMemo(
    () => ({
      ...inner,
      mutate: (op: WriteOp<T>) => inner.mutate(write(op)),
      mutateAsync: (op: WriteOp<T>) => inner.mutateAsync(write(op)),
    }),
    [inner, write],
  )
}

export const useBookings = () => useValidatedMutation<Booking>('bookings', BOOKING_V)
export const useFavorites = () => useValidatedMutation<Favorite>('favorites', FAVORITE_V)
export const useReviews = () => useValidatedMutation<Review>('reviews', REVIEW_V)
