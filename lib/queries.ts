import type { AggregatePipeline, Filter } from 'taladb'
import type { Listing, ListingCardDoc, ListingType } from './types'

export interface ExploreFilters {
  keyword: string
  cities: string[]
  types: ListingType[]
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
export const PAGE_SIZE = 24

/**
 * Translate UI filter state into a TalaDB Mongo-style `Filter`. Everything the
 * document engine can do natively is expressed here — `$and`, `$in`, `$gte`/
 * `$lte` range, and `$contains` full-text. The query planner uses the b-tree
 * indexes on `city`/`pricePerNight`/`rating`, the compound `city+guests` index,
 * and the FTS indexes on `description`/`amenitiesText`.
 */
export function buildFilter(f: ExploreFilters): Filter<Listing> | undefined {
  const clauses: Filter<Listing>[] = []

  if (f.cities.length) clauses.push({ city: { $in: f.cities } })
  // `type` is a union field. This needed an `as Filter<Listing>` cast until
  // taladb 0.9.3 stopped making `FieldOps<T>` a distributive conditional.
  if (f.types.length) clauses.push({ type: { $in: f.types } })

  if (f.minPrice > PRICE_FLOOR || f.maxPrice < PRICE_CEIL) {
    const price: { $gte?: number; $lte?: number } = {}
    if (f.minPrice > PRICE_FLOOR) price.$gte = f.minPrice
    if (f.maxPrice < PRICE_CEIL) price.$lte = f.maxPrice
    clauses.push({ pricePerNight: price })
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
  // type. This is a type-level workaround, not a cast over untrusted data.
  return { $and: clauses } as Filter<Listing>
}

export type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'rating'

/**
 * Sort specs the ENGINE executes, not JavaScript. Each is index-backed.
 * (`recommended` is rating-then-popularity; it used to be a JS-computed score,
 * which is impossible to push down and forced every row into the client.)
 */
const SORTS: Record<SortKey, Record<string, 1 | -1>> = {
  recommended: { rating: -1, reviewsCount: -1 },
  'price-asc': { pricePerNight: 1 },
  'price-desc': { pricePerNight: -1 },
  rating: { rating: -1, reviewsCount: -1 },
}

/**
 * Exactly the fields a ListingCard renders. Naming what we want (rather than
 * excluding what we don't) keeps the projection honest as the card evolves, and
 * it is what `ListingCardDoc` is derived from. Notably this leaves `description`
 * behind: the single heaviest field, FTS-indexed and searchable, never shown in
 * the grid.
 */
const CARD_FIELDS: ReadonlyArray<Exclude<keyof ListingCardDoc, '_id'>> = [
  'slug',
  'name',
  'city',
  'country',
  'type',
  'rating',
  'reviewsCount',
  'pricePerNight',
  'guests',
  'image',
]

/**
 * The page of listings to render, as a pipeline the engine runs end-to-end.
 *
 * This is the whole local-first point: `$match` → `$sort` → `$skip` → `$limit`
 * → `$project` all execute inside TalaDB, so exactly `PAGE_SIZE` trimmed
 * documents cross the worker boundary — not the 10,000 full ones the page used
 * to pull in order to display 24.
 */
export function buildPagePipeline(
  filters: ExploreFilters,
  sort: SortKey,
  page: number,
  pageSize = PAGE_SIZE,
): AggregatePipeline<Listing> {
  const match = buildFilter(filters)
  const project: Record<string, 0 | 1> = {}
  for (const f of CARD_FIELDS) project[f] = 1

  const pipeline: AggregatePipeline<Listing> = []
  if (match) pipeline.push({ $match: match })
  pipeline.push({ $sort: SORTS[sort] })
  pipeline.push({ $skip: (page - 1) * pageSize })
  pipeline.push({ $limit: pageSize })
  pipeline.push({ $project: project })
  return pipeline
}

/** Human-readable echo of what the engine is running, for the demo panel. */
export function explainPipeline(
  filters: ExploreFilters,
  sort: SortKey,
  page: number,
): string {
  return `listings.aggregate(${JSON.stringify(buildPagePipeline(filters, sort, page), null, 2)})`
}

export function activeFilterCount(f: ExploreFilters): number {
  return (
    f.cities.length +
    f.types.length +
    f.amenities.length +
    (f.keyword.trim() ? 1 : 0) +
    (f.minGuests > 1 ? 1 : 0) +
    (f.maxPrice < PRICE_CEIL ? 1 : 0) +
    (f.minPrice > PRICE_FLOOR ? 1 : 0)
  )
}
