'use client'

import { AMENITIES, CITIES } from '@/lib/types'
import { PRICE_CEIL, type ExploreFilters } from '@/lib/queries'

const TYPES = ['Apartment', 'House', 'Villa', 'Cabin', 'Loft', 'Cottage', 'Studio', 'Bungalow']

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-teal-500 bg-teal-500 text-white'
          : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  )
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

export function FilterPanel({
  filters,
  onChange,
}: {
  filters: ExploreFilters
  onChange: (f: ExploreFilters) => void
}) {
  const set = (patch: Partial<ExploreFilters>) => onChange({ ...filters, ...patch })

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <Section title="City">
        <div className="flex flex-wrap gap-1.5">
          {CITIES.map((c) => (
            <Chip key={c} label={c} active={filters.cities.includes(c)} onClick={() => set({ cities: toggle(filters.cities, c) })} />
          ))}
        </div>
      </Section>

      <Section title={`Max price · $${filters.maxPrice}${filters.maxPrice >= PRICE_CEIL ? '+' : ''}`}>
        <input
          type="range"
          min={20}
          max={PRICE_CEIL}
          step={10}
          value={filters.maxPrice}
          onChange={(e) => set({ maxPrice: Number(e.target.value) })}
          className="w-full accent-teal-500"
        />
      </Section>

      <Section title="Guests">
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 4, 6, 8].map((n) => (
            <Chip key={n} label={`${n}+`} active={filters.minGuests === n} onClick={() => set({ minGuests: n })} />
          ))}
        </div>
      </Section>

      <Section title="Property type">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <Chip key={t} label={t} active={filters.types.includes(t)} onClick={() => set({ types: toggle(filters.types, t) })} />
          ))}
        </div>
      </Section>

      <Section title="Amenities">
        <div className="flex flex-wrap gap-1.5">
          {AMENITIES.map((a) => (
            <Chip key={a} label={a} active={filters.amenities.includes(a)} onClick={() => set({ amenities: toggle(filters.amenities, a) })} />
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
      {children}
    </div>
  )
}
