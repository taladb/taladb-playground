'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useCollection, useFindOne, useMutation } from '@taladb/react'
import type { Booking, Listing } from '@/lib/types'

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function BookPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  // Single-document read from the local catalog, served by the `slug` lookup.
  const listings = useCollection<Listing>('listings')
  const { data: listing, loading } = useFindOne(listings, { slug })
  // Local-first write: committed to disk immediately, then pushed with retry.
  const { mutateAsync } = useMutation<Booking>({ collection: 'bookings' })

  const [checkIn, setCheckIn] = useState(todayPlus(7))
  const [checkOut, setCheckOut] = useState(todayPlus(10))
  const [guests, setGuests] = useState(2)
  const [saving, setSaving] = useState(false)

  const nights = useMemo(() => {
    const a = new Date(checkIn).getTime()
    const b = new Date(checkOut).getTime()
    return Math.max(0, Math.round((b - a) / 86400000))
  }, [checkIn, checkOut])

  if (loading) return <div className="py-20 text-center text-sm text-slate-500">Loading…</div>
  if (!listing) return <div className="py-20 text-center text-sm text-slate-500">Listing not found.</div>

  const total = nights * listing.pricePerNight

  async function confirm() {
    if (!listing || nights < 1) return
    setSaving(true)
    await mutateAsync({
      type: 'insert',
      doc: {
        listingId: listing.slug,
        listingName: listing.name,
        city: listing.city,
        image: listing.image,
        checkIn,
        checkOut,
        guests,
        nights,
        pricePerNight: listing.pricePerNight,
        total,
        status: 'upcoming',
        createdAt: Date.now(),
      },
    })
    router.push('/trips')
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <nav className="text-sm text-slate-500">
        <Link href={`/listing/${listing.slug}`} className="hover:underline">
          ← Back to listing
        </Link>
      </nav>
      <h1 className="text-2xl font-bold">Confirm your stay</h1>

      <div className="flex gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={listing.image} alt="" className="h-20 w-20 rounded-xl object-cover" />
        <div>
          <p className="font-semibold">{listing.name}</p>
          <p className="text-sm text-slate-500">
            {listing.city}, {listing.country}
          </p>
          <p className="mt-1 text-sm">${listing.pricePerNight} / night</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in">
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="input" />
        </Field>
        <Field label="Check-out">
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="input" />
        </Field>
        <Field label="Guests">
          <input
            type="number"
            min={1}
            max={listing.guests}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="input"
          />
        </Field>
      </div>

      <div className="rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-800">
        <Row label={`$${listing.pricePerNight} × ${nights} nights`} value={`$${total}`} />
        <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
        <Row label="Total" value={`$${total}`} bold />
      </div>

      <button
        onClick={confirm}
        disabled={nights < 1 || saving}
        className="rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : `Confirm reservation · $${total}`}
      </button>
      <p className="text-center text-xs text-slate-400">
        This write hits your on-device database instantly and works offline. It syncs to the server in
        the background — watch the status badge in the header.
      </p>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        :global(.dark .input) {
          border-color: rgb(51 65 85);
          background: rgb(15 23 42);
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
