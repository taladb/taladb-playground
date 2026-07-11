'use client'

import { useCollection, useFindOne } from '@taladb/react'
import type { Favorite, Listing } from '@/lib/types'

export function FavoriteButton({ listing }: { listing: Listing }) {
  const favorites = useCollection<Favorite>('favorites')
  const { data: existing } = useFindOne(favorites, { listingId: listing.slug })
  const active = !!existing

  async function toggle() {
    if (existing) {
      await favorites.deleteOne({ _id: existing._id })
    } else {
      await favorites.insert({
        listingId: listing.slug,
        listingName: listing.name,
        city: listing.city,
        image: listing.image,
        pricePerNight: listing.pricePerNight,
        createdAt: Date.now(),
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
