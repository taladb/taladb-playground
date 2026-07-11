import type { Document } from 'taladb'

/** A bookable stay. This is the ~10k-row catalog seeded from public/seed. */
export interface Listing extends Document {
  slug: string
  name: string
  city: string
  country: string
  type: 'Apartment' | 'House' | 'Villa' | 'Cabin' | 'Loft' | 'Cottage' | 'Studio' | 'Bungalow'
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
  /** 384-dim embedding — only populated lazily on the /discover page (Stage B). */
  embedding?: number[]
}

/** Metadata rows shipped in public/seed/listings.json (no embedding). */
export type ListingSeed = Omit<Listing, '_id' | 'embedding'>

/** A user booking. Synced across devices/tabs. */
export interface Booking extends Document {
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
  listingId: string
  listingName: string
  city: string
  image: string
  pricePerNight: number
  createdAt: number
}

/** A guest review. Synced. */
export interface Review extends Document {
  listingId: string
  author: string
  rating: number
  body: string
  createdAt: number
}

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
