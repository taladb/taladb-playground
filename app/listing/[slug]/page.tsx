'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCollection, useFindOne } from '@taladb/react'
import type { Listing } from '@/lib/types'
import { FavoriteButton } from '@/app/components/FavoriteButton'
import { ReviewSection } from '@/app/components/ReviewSection'

export default function ListingDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const listings = useCollection<Listing>('listings')
  const { data: listing, loading } = useFindOne(listings, { slug })

  if (loading) return <DetailSkeleton />
  if (!listing)
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        Listing not found.{' '}
        <Link href="/" className="text-teal-600 underline">
          Back to explore
        </Link>
      </div>
    )

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">
          Explore
        </Link>{' '}
        / <span className="text-slate-700 dark:text-slate-300">{listing.city}</span>
      </nav>

      <div className="relative overflow-hidden rounded-3xl bg-slate-100 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={listing.image} alt={listing.name} className="h-72 w-full object-cover sm:h-96" />
        <div className="absolute right-3 top-3">
          <FavoriteButton listing={listing} />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold">{listing.name}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {listing.type} in {listing.city}, {listing.country} · ★ {listing.rating.toFixed(2)} (
              {listing.reviewsCount} reviews)
            </p>
          </div>

          <div className="flex flex-wrap gap-4 border-y border-slate-200 py-4 text-sm dark:border-slate-800">
            <Stat label="Guests" value={listing.guests} />
            <Stat label="Bedrooms" value={listing.bedrooms} />
            <Stat label="Bathrooms" value={listing.bathrooms} />
          </div>

          <p className="leading-relaxed text-slate-700 dark:text-slate-300">{listing.description}</p>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Amenities
            </h2>
            <div className="flex flex-wrap gap-2">
              {listing.amenities.map((a) => (
                <span
                  key={a}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>

          <ReviewSection listing={listing} />
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-lg">
              <span className="font-bold">${listing.pricePerNight}</span>
              <span className="text-slate-500 dark:text-slate-400"> / night</span>
            </p>
            <Link
              href={`/book/${listing.slug}`}
              className="mt-4 block rounded-xl bg-teal-500 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-teal-600"
            >
              Reserve
            </Link>
            <p className="mt-3 text-center text-xs text-slate-400">
              Reservations save instantly to your device — even offline.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-semibold">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-72 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800 sm:h-96" />
      <div className="h-8 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
    </div>
  )
}
