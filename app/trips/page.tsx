'use client'

import Link from 'next/link'
import { useCollection, useFind } from '@taladb/react'
import type { Booking, Favorite } from '@/lib/types'

export default function TripsPage() {
  const bookings = useCollection<Booking>('bookings')
  const favorites = useCollection<Favorite>('favorites')
  const { data: trips } = useFind(bookings)
  const { data: saved } = useFind(favorites)

  const sortedTrips = trips.slice().sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm dark:border-teal-900 dark:bg-teal-950/40">
        <p className="font-medium text-teal-900 dark:text-teal-200">This is your synced data.</p>
        <p className="mt-1 text-teal-800 dark:text-teal-300/80">
          Bookings and saves live in the on-device database and sync to the server every 10s. Open this
          page in a second tab or device (same browser) and watch changes converge. Go offline (DevTools
          → Network → Offline), make changes, then reconnect — they merge automatically.
        </p>
      </section>

      <section>
        <h1 className="mb-3 text-xl font-bold">Your trips</h1>
        {sortedTrips.length === 0 ? (
          <Empty text="No reservations yet." cta />
        ) : (
          <ul className="flex flex-col gap-3">
            {sortedTrips.map((t) => (
              <li
                key={t._id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-3 sm:flex-row sm:items-center dark:border-slate-800"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.image} alt="" className="h-24 w-full rounded-xl object-cover sm:h-16 sm:w-24" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/listing/${t.listingId}`} className="font-semibold hover:underline">
                      {t.listingName}
                    </Link>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-sm text-slate-500">
                    {t.city} · {t.checkIn} → {t.checkOut} · {t.guests} guests · ${t.total}
                  </p>
                </div>
                <div className="flex gap-2">
                  {t.status === 'upcoming' && (
                    <button
                      onClick={() => bookings.updateOne({ _id: t._id }, { $set: { status: 'cancelled' } })}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={() => bookings.deleteOne({ _id: t._id })}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-950/40"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Saved ({saved.length})</h2>
        {saved.length === 0 ? (
          <Empty text="No saved stays yet — tap the heart on any listing." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {saved
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((f) => (
                <Link
                  key={f._id}
                  href={`/listing/${f.listingId}`}
                  className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.image} alt="" className="aspect-[4/3] w-full object-cover" />
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{f.listingName}</p>
                    <p className="text-xs text-slate-500">
                      {f.city} · ${f.pricePerNight}
                    </p>
                  </div>
                </Link>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatusBadge({ status }: { status: Booking['status'] }) {
  const map = {
    upcoming: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    completed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  }
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${map[status]}`}>{status}</span>
}

function Empty({ text, cta }: { text: string; cta?: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
      {text}
      {cta && (
        <div className="mt-2">
          <Link href="/" className="text-teal-600 underline">
            Explore stays
          </Link>
        </div>
      )}
    </div>
  )
}
