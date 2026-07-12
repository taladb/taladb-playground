'use client'

import { useCollection, useFindOne, useMutation } from '@taladb/react'
import type { Favorite, ListingCardDoc } from '@/lib/types'

export function FavoriteButton({ listing }: { listing: ListingCardDoc }) {
  // The read stays a live query — favorites are small, mutable and synced, so
  // the heart must re-render the moment another tab or device toggles it.
  const favorites = useCollection<Favorite>('favorites')
  const { data: existing } = useFindOne(favorites, { listingId: listing.slug })
  // The write goes through useMutation: local-first + durable outbox + retry.
  // The provider's `collections` registry means this handle carries the Zod
  // schema and stamps `_v` — no hand-rolled validation wrapper needed.
  const { mutate } = useMutation<Favorite>({ collection: 'favorites' })
  const active = !!existing

  function toggle() {
    if (existing) {
      mutate({ type: 'delete', where: { _id: existing._id } })
    } else {
      mutate({
        type: 'insert',
        doc: {
          listingId: listing.slug,
          listingName: listing.name,
          city: listing.city,
          image: listing.image,
          pricePerNight: listing.pricePerNight,
          createdAt: Date.now(),
        },
      })
    }
  }

  return (
    <button
      aria-label={active ? 'Remove from favorites' : 'Save to favorites'}
      onClick={toggle}
      className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-base shadow-sm backdrop-blur transition hover:scale-110 dark:bg-slate-900/90"
    >
      <span className={active ? 'text-rose-500' : 'text-slate-400'}>{active ? '♥' : '♡'}</span>
    </button>
  )
}
