'use client'

import { useState } from 'react'
import { useCollection, useQuery } from '@taladb/react'
import type { Listing, Review } from '@/lib/types'
import { useReviews } from '@/lib/mutations'

export function ReviewSection({ listing }: { listing: Listing }) {
  // Local-only catalog handle — used for the atomic $inc below. It is never
  // synced, so it needs no schema/`_v`.
  const listings = useCollection<Listing>('listings')
  // A synced slice, scoped to this listing: live over the local replica, with a
  // scoped pull behind it. Backed by the `listingId` index.
  const { data } = useQuery<Review>({
    collection: 'reviews',
    filter: { listingId: listing.slug },
  })
  const { mutateAsync } = useReviews()
  const [body, setBody] = useState('')
  const [rating, setRating] = useState(5)
  const [q, setQ] = useState('')

  // Client-side narrowing over this listing's own reviews (a handful of rows).
  const shown = q.trim()
    ? data.filter((r) => r.body.toLowerCase().includes(q.trim().toLowerCase()))
    : data

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    await mutateAsync({
      type: 'insert',
      doc: {
        listingId: listing.slug,
        author: 'You',
        rating,
        body: body.trim(),
        createdAt: Date.now(),
      },
    })
    // Bump the listing's review count with an atomic $inc — a local-only write
    // to the catalog, so it never crosses the sync boundary.
    await listings.updateOne({ slug: listing.slug }, { $inc: { reviewsCount: 1 } })
    setBody('')
  }

  return (
    <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Reviews {data.length ? `(${data.length})` : ''}
        </h2>
        {data.length > 0 && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reviews…"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
        )}
      </div>

      <form onSubmit={submit} className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Rating</label>
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {'★'.repeat(n)}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share your experience… (saved locally & synced)"
          rows={2}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          className="self-start rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-slate-900"
        >
          Post review
        </button>
      </form>

      {shown.length === 0 ? (
        <p className="text-sm text-slate-400">{data.length ? 'No reviews match.' : 'No reviews yet — be the first.'}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((r) => (
              <li key={r._id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{r.author}</span>
                  <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">{r.body}</p>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
