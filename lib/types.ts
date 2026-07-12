import type { Document } from 'taladb'

/** A bookable stay. This is the ~10k-row catalog seeded from public/seed. */
export interface Listing extends Document {
  slug: string
  name: string
  city: string
  country: string
  type: ListingType
  pricePerNight: number
  guests: number
  bedrooms: number
  bathrooms: number
  rating: number
  reviewsCount: number
  amenities: string[]
  /** Lowercased space-joined amenities — FTS-indexed so amenity filters use $contains. */
  amenitiesText: string
  description: string
  lat: number
  lng: number
  image: string
  /**
   * Position of this listing in public/seed/listings.json. `embeddings.bin` is a
   * flat Float32 array in that same order, so this is what lets the lazy vector
   * seed pair each vector with the right listing without re-fetching the catalog.
   */
  seedIndex: number
}

/** Metadata rows shipped in public/seed/listings.json. */
export type ListingSeed = Omit<Listing, '_id' | 'seedIndex'>

/**
 * The projection the Explore grid actually reads — the shape `$project` returns.
 * Typing the paged query as full `Listing` would be a lie: the pipeline
 * deliberately leaves `description`/`amenities`/geo behind. A full `Listing` is
 * structurally assignable to this, so detail pages can pass one straight in.
 */
export type ListingCardDoc = Pick<
  Listing,
  | '_id'
  | 'slug'
  | 'name'
  | 'city'
  | 'country'
  | 'type'
  | 'rating'
  | 'reviewsCount'
  | 'pricePerNight'
  | 'guests'
  | 'image'
>

/**
 * A listing's 384-dim embedding, in its own collection so the catalog stays
 * lean — a document read on Explore must never carry vectors it doesn't use.
 * Seeded lazily on first visit to /discover. `city` is denormalised here so
 * hybrid search (vector + metadata filter) is one `findNearest` call.
 */
export interface ListingVector extends Document {
  slug: string
  city: string
  embedding: number[]
}

/** A user booking. Synced across devices/tabs. */
export interface Booking extends Document {
  /** Document shape version — stamped by the engine, travels with the doc. */
  _v?: number
  listingId: string
  listingName: string
  city: string
  image: string
  checkIn: string // ISO date (yyyy-mm-dd)
  checkOut: string
  guests: number
  nights: number
  pricePerNight: number
  total: number
  status: 'upcoming' | 'completed' | 'cancelled'
  createdAt: number
}

/** A saved/favorited listing. Synced. */
export interface Favorite extends Document {
  _v?: number
  listingId: string
  listingName: string
  city: string
  image: string
  pricePerNight: number
  createdAt: number
}

/** A guest review. Synced. */
export interface Review extends Document {
  _v?: number
  listingId: string
  author: string
  rating: number
  body: string
  createdAt: number
}

/** The listing categories, and the single source of truth for `Listing['type']`. */
export const LISTING_TYPES = [
  'Apartment', 'House', 'Villa', 'Cabin', 'Loft', 'Cottage', 'Studio', 'Bungalow',
] as const

export type ListingType = (typeof LISTING_TYPES)[number]

export const CITIES = [
  'Lisbon', 'Barcelona', 'Kyoto', 'Reykjavik', 'Cape Town', 'Queenstown',
  'Marrakech', 'Bali', 'Amsterdam', 'Oaxaca', 'Tbilisi', 'Hoi An',
  'Ljubljana', 'Cartagena', 'Chiang Mai', 'Porto',
] as const

export const AMENITIES = [
  'Wifi', 'Pool', 'Kitchen', 'Air conditioning', 'Hot tub', 'Free parking',
  'Washer', 'Pets allowed', 'Ocean view', 'Fireplace', 'Gym', 'EV charger',
  'Workspace', 'Breakfast', 'Balcony', 'Beachfront',
] as const
