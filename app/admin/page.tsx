'use client'

import { useEffect, useState } from 'react'
import { useTalaDB } from '@taladb/react'
import type { Document } from 'taladb'
import { collections } from '@/lib/db-schema'
import { useSeedStatus } from '@/lib/seed'

interface CityStat extends Document {
  _id: string
  listings: number
  avgPrice: number
  avgRating: number
}
interface RevenueStat extends Document {
  _id: string
  revenue: number
  nights: number
  bookings: number
}

export default function AdminPage() {
  const db = useTalaDB()
  const { docReady } = useSeedStatus()
  const [cityStats, setCityStats] = useState<CityStat[]>([])
  const [revenue, setRevenue] = useState<RevenueStat[]>([])
  const [totals, setTotals] = useState({ listings: 0, bookings: 0, revenue: 0 })
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!docReady) return
    let alive = true
    ;(async () => {
      setRunning(true)
      const { listings, bookings } = collections(db)

      // Aggregation pipeline #1 — catalog supply by city.
      const byCity = await listings.aggregate<CityStat>([
        { $group: { _id: '$city', listings: { $sum: 1 }, avgPrice: { $avg: '$pricePerNight' }, avgRating: { $avg: '$rating' } } },
        { $sort: { listings: -1 } },
      ])

      // Aggregation pipeline #2 — realised revenue by city (non-cancelled bookings).
      const rev = await bookings.aggregate<RevenueStat>([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: '$city', revenue: { $sum: '$total' }, nights: { $sum: '$nights' }, bookings: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
        { $limit: 8 },
      ])

      const listingCount = await listings.count()
      const bookingCount = await bookings.count({ status: { $ne: 'cancelled' } })
      const revTotal = rev.reduce((s, r) => s + r.revenue, 0)

      if (!alive) return
      setCityStats(byCity)
      setRevenue(rev)
      setTotals({ listings: listingCount, bookings: bookingCount, revenue: revTotal })
      setRunning(false)
    })()
    return () => {
      alive = false
    }
  }, [db, docReady])

  const maxRev = Math.max(1, ...revenue.map((r) => r.revenue))
  const maxListings = Math.max(1, ...cityStats.map((c) => c.listings))

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Host dashboard</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every figure here is computed by TalaDB&apos;s <strong>aggregation pipeline</strong>{' '}
          (<code className="font-mono text-xs">$group</code> / <code className="font-mono text-xs">$sum</code> /{' '}
          <code className="font-mono text-xs">$avg</code>) running over the on-device catalog and your bookings —
          no server, no SQL.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Listings" value={totals.listings.toLocaleString()} />
        <KpiCard label="Active bookings" value={totals.bookings.toLocaleString()} />
        <KpiCard label="Booked revenue" value={`$${totals.revenue.toLocaleString()}`} />
      </div>

      <Panel title="Revenue by city" hint="bookings.aggregate([{ $match }, { $group: { _id: '$city', revenue: { $sum: '$total' } } }, { $sort }])">
        {revenue.length === 0 ? (
          <EmptyRow text={running ? 'Running aggregation…' : 'No bookings yet — reserve a stay to populate this.'} />
        ) : (
          <BarList
            rows={revenue.map((r) => ({ label: r._id, value: r.revenue, sub: `${r.bookings} bookings · ${r.nights} nights`, pct: r.revenue / maxRev }))}
            format={(v) => `$${v.toLocaleString()}`}
          />
        )}
      </Panel>

      <Panel title="Catalog supply by city" hint="listings.aggregate([{ $group: { _id: '$city', listings: { $sum: 1 }, avgPrice: { $avg: '$pricePerNight' } } }])">
        {cityStats.length === 0 ? (
          <EmptyRow text={running ? 'Running aggregation…' : 'No data.'} />
        ) : (
          <BarList
            rows={cityStats.map((c) => ({
              label: c._id,
              value: c.listings,
              sub: `avg $${Math.round(c.avgPrice)} · ★ ${c.avgRating.toFixed(2)}`,
              pct: c.listings / maxListings,
            }))}
            format={(v) => `${v}`}
          />
        )}
      </Panel>
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

function Panel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-3 mt-0.5 overflow-x-auto font-mono text-[11px] text-slate-400">{hint}</p>
      {children}
    </section>
  )
}

function BarList({
  rows,
  format,
}: {
  rows: { label: string; value: number; sub: string; pct: number }[]
  format: (v: number) => string
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 truncate font-medium">{r.label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
            <div className="flex h-full items-center rounded bg-teal-500/80 px-2" style={{ width: `${Math.max(6, r.pct * 100)}%` }}>
              <span className="truncate text-xs font-semibold text-white">{format(r.value)}</span>
            </div>
          </div>
          <span className="hidden w-40 shrink-0 text-right text-xs text-slate-400 sm:block">{r.sub}</span>
        </li>
      ))}
    </ul>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>
}
