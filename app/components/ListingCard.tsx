'use client'

import Link from 'next/link'
import type { Listing } from '@/lib/types'
import { FavoriteButton } from './FavoriteButton'

export function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link
      href={`/listing/${listing.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={listing.image}
          alt={listing.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute right-2 top-2" onClick={(e) => e.preventDefault()}>
          <FavoriteButton listing={listing} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {listing.city}, {listing.country}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium">
            ★ {listing.rating.toFixed(2)}
            <span className="text-slate-400">({listing.reviewsCount})</span>
          </span>
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{listing.name}</h3>
        <p className="mt-auto pt-1.5 text-sm">
          <span className="font-semibold">${listing.pricePerNight}</span>
          <span className="text-slate-500 dark:text-slate-400"> / night · {listing.guests} guests</span>
        </p>
      </div>
    </Link>
  )
}
