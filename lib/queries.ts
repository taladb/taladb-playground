import type { Filter } from 'taladb'
import type { Listing } from './types'

export interface ExploreFilters {
  keyword: string
  cities: string[]
  types: string[]
  amenities: string[]
  minPrice: number
  maxPrice: number
  minGuests: number
}

export const DEFAULT_FILTERS: ExploreFilters = {
  keyword: '',
  cities: [],
  types: [],
  amenities: [],
  minPrice: 0,
  maxPrice: 500,
  minGuests: 1,
}

export const PRICE_FLOOR = 0
export const PRICE_CEIL = 500

/**
 * Translate UI filter state into a TalaDB Mongo-style `Filter`. Everything the
 * document engine can do natively is expressed here — `$and`, `$in`, `$gte`/
 * `$lte` range, and `$contains` full-text. The query planner uses the b-tree
 * indexes on `city`/`pricePerNight`, the compound `city+guests` index, and the
 * FTS indexes on `description`/`amenitiesText`.
 */
export function buildFilter(f: ExploreFilters): Filter<Listing> | undefined {
  const clauses: Filter<Listing>[] = []

  if (f.cities.length) clauses.push({ city: { $in: f.cities } })
  if (f.types.length) clauses.push({ type: { $in: f.types } } as Filter<Listing>)

  if (f.minPrice > PRICE_FLOOR || f.maxPrice < PRICE_CEIL) {
    const price: Record<string, number> = {}
    if (f.minPrice > PRICE_FLOOR) price.$gte = f.minPrice
    if (f.maxPrice < PRICE_CEIL) price.$lte = f.maxPrice
    clauses.push({ pricePerNight: price } as Filter<Listing>)
  }

  if (f.minGuests > 1) clauses.push({ guests: { $gte: f.minGuests } })

  const kw = f.keyword.trim()
  if (kw) clauses.push({ description: { $contains: kw } })

  // Amenities: one FTS token-set match on the joined amenitiesText field.
  // $contains requires ALL tokens present ⇒ AND semantics across selections.
  if (f.amenities.length) {
    clauses.push({ amenitiesText: { $contains: f.amenities.join(' ').toLowerCase() } })
  }

  if (!clauses.length) return undefined
  if (clauses.length === 1) return clauses[0]
  // `Listing` inherits Document's string index signature, which makes the
  // structural `$and` key clash with it — a known quirk of the generic Filter
  // type. The value is correct at runtime; cast past the index-signature check.
  return { $and: clauses } as Filter<Listing>
}

export type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'rating'

export function sortListings(rows: Listing[], key: SortKey): Listing[] {
  const out = rows.slice()
  switch (key) {
    case 'price-asc':
      return out.sort((a, b) => a.pricePerNight - b.pricePerNight)
    case 'price-desc':
      return out.sort((a, b) => b.pricePerNight - a.pricePerNight)
    case 'rating':
      return out.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount)
    default:
      return out.sort((a, b) => b.rating * Math.log10(b.reviewsCount + 10) - a.rating * Math.log10(a.reviewsCount + 10))
  }
}
