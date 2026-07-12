import { z } from 'zod'
import type { TalaDB, Collection } from 'taladb'
import type { Listing, ListingSeed, ListingVector, Booking, Favorite, Review } from './types'

export const DB_NAME = 'hotels-v1.db'

// Bump to force a re-seed on all devices (e.g. when the catalog data changes).
// v2: cleared duplicate rows from a pre-lock concurrent double-seed.
// v3: full 10k-listing catalog.
// v4: embeddings moved out of `listings` into `listing_vectors`, so a catalog
//     read never drags 384 floats per row across the worker boundary.
const DOC_SEED_VERSION = 4
const VECTOR_SEED_VERSION = 2

/** Embedding dimensions (all-MiniLM-L6-v2). */
export const VECTOR_DIM = 384

// ---------------------------------------------------------------------------
// Schemas — per docs/guide/schema-and-sync-standards.md
//
// "Be strict where writes are local and reversible. Be tolerant where writes are
// distributed and irreversible. Version data per-document, never per-connection."
//
// So: a Zod `schema` hard-fails a bad LOCAL insert (we control that boundary and
// the caller is right there), while `syncSchema` stays TOLERANT on import —
// a peer on an older build must never have its writes hard-rejected, or the two
// replicas diverge permanently under LWW. Every synced document carries `_v`.
// ---------------------------------------------------------------------------

/** Current document version for the synced collections. */
export const BOOKING_V = 1
export const FAVORITE_V = 1
export const REVIEW_V = 1

const BookingSchema = z.object({
  // Stamped by the engine after validation (syncSchema.version), so it is
  // optional on the way in but validated whenever present.
  _v: z.literal(BOOKING_V).optional(),
  listingId: z.string(),
  listingName: z.string(),
  city: z.string(),
  image: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().int().positive(),
  nights: z.number().int().positive(),
  pricePerNight: z.number().nonnegative(),
  total: z.number().nonnegative(),
  status: z.enum(['upcoming', 'completed', 'cancelled']),
  createdAt: z.number(),
})

const FavoriteSchema = z.object({
  // Stamped by the engine after validation (syncSchema.version), so it is
  // optional on the way in but validated whenever present.
  _v: z.literal(FAVORITE_V).optional(),
  listingId: z.string(),
  listingName: z.string(),
  city: z.string(),
  image: z.string(),
  pricePerNight: z.number().nonnegative(),
  createdAt: z.number(),
})

const ReviewSchema = z.object({
  // Stamped by the engine after validation (syncSchema.version), so it is
  // optional on the way in but validated whenever present.
  _v: z.literal(REVIEW_V).optional(),
  listingId: z.string(),
  author: z.string().min(1),
  rating: z.number().min(1).max(5),
  body: z.string().min(1),
  createdAt: z.number(),
})

/**
 * The strict local-write validators, by collection name. Used both by
 * `collections()` below (the direct-handle path) and by `lib/mutations.ts` (the
 * `useMutation` path, which resolves its own unconfigured handle and would
 * otherwise skip validation entirely).
 */
export const WRITE_SCHEMAS = {
  bookings: BookingSchema,
  favorites: FavoriteSchema,
  reviews: ReviewSchema,
} as const

export interface Collections {
  listings: Collection<Listing>
  listingVectors: Collection<ListingVector>
  bookings: Collection<Booking>
  favorites: Collection<Favorite>
  reviews: Collection<Review>
}

export function collections(db: TalaDB): Collections {
  return {
    // Local-only catalog — seeded from a static asset, never synced, never
    // written at runtime. No schema/`_v` needed: it crosses no sync boundary.
    listings: db.collection<Listing>('listings'),
    listingVectors: db.collection<ListingVector>('listing_vectors'),

    bookings: db.collection<Booking>('bookings', {
      schema: BookingSchema,
      syncSchema: {
        version: BOOKING_V,
        required: ['listingId', 'checkIn', 'checkOut'],
        types: { listingId: 'str', guests: 'int', total: 'float', status: 'str' },
        defaults: { status: 'upcoming', guests: 1 },
      },
    }),
    favorites: db.collection<Favorite>('favorites', {
      schema: FavoriteSchema,
      syncSchema: {
        version: FAVORITE_V,
        required: ['listingId'],
        types: { listingId: 'str', pricePerNight: 'float' },
        defaults: { pricePerNight: 0 },
      },
    }),
    reviews: db.collection<Review>('reviews', {
      schema: ReviewSchema,
      syncSchema: {
        version: REVIEW_V,
        required: ['listingId', 'body'],
        types: { listingId: 'str', rating: 'int', body: 'str' },
        defaults: { rating: 5, author: 'Guest' },
      },
    }),
  }
}

// Tracks one-time local seeding per device. Not in the replication allowlist, so
// it never syncs. (Collection names can't start with '_' — reserved.)
function meta(db: TalaDB) {
  return db.collection<{ key: string; version: number }>('app_meta')
}

async function seedDone(db: TalaDB, key: string, version: number): Promise<boolean> {
  const doc = await meta(db).findOne({ key })
  return !!doc && doc.version === version
}

async function markSeeded(db: TalaDB, key: string, version: number): Promise<void> {
  await meta(db).deleteMany({ key })
  await meta(db).insert({ key, version })
}

/**
 * Create indexes for the user (synced) collections. Cheap and idempotent — safe
 * to run on every open. Runs before any Stage-A/Stage-B seeding.
 */
export async function ensureUserIndexes(db: TalaDB): Promise<void> {
  const { bookings, favorites, reviews } = collections(db)
  await bookings.createIndex('listingId')
  await bookings.createIndex('status')
  await bookings.createIndex('checkIn')
  await favorites.createIndex('listingId')
  await reviews.createIndex('listingId')
}

// Module-level locks dedupe concurrent seed calls. React StrictMode (and React
// 19 effect semantics) can invoke the SeedGate effect twice; without this the
// catalog would be inserted twice, producing duplicate rows.
let docSeedPromise: Promise<void> | null = null
let vectorSeedPromise: Promise<void> | null = null

/**
 * Has the catalog already been seeded on this device? Resolves in a single
 * indexed `app_meta` lookup, so a warm start can skip straight to querying
 * rather than showing a loading state while it works that out.
 */
export function isDocSeeded(db: TalaDB): Promise<boolean> {
  return seedDone(db, 'listings', DOC_SEED_VERSION)
}

/**
 * Stage A — the ~10k-row document catalog. Streams public/seed/listings.json in
 * batches so the UI stays responsive, then builds the document indexes in a
 * single backfill. Runs ONCE per device: the `app_meta` marker below is what
 * makes every subsequent visit a pure local read with zero network.
 */
export function ensureDocSeed(
  db: TalaDB,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (!docSeedPromise) {
    docSeedPromise = runDocSeed(db, onProgress).catch((e) => {
      docSeedPromise = null // allow retry on failure
      throw e
    })
  }
  return docSeedPromise
}

async function runDocSeed(
  db: TalaDB,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (await seedDone(db, 'listings', DOC_SEED_VERSION)) return

  const { listings } = collections(db)
  // If a partial seed exists (e.g. interrupted), start clean.
  if ((await listings.count()) > 0) await listings.deleteMany({})

  const res = await fetch('/seed/listings.json')
  if (!res.ok) throw new Error(`failed to load seed data (${res.status})`)
  const rows = (await res.json()) as ListingSeed[]
  const total = rows.length
  const BATCH = 400

  for (let i = 0; i < total; i += BATCH) {
    // `seedIndex` records each listing's position in the seed file. That is the
    // key the lazy vector seed later uses to line embeddings.bin up with the
    // right listings, without re-downloading the catalog or assuming scan order.
    await listings.insertMany(
      rows.slice(i, i + BATCH).map((row, j) => ({ ...row, seedIndex: i + j })),
    )
    onProgress?.(Math.min(i + BATCH, total), total)
    // Yield to the event loop so the progress banner can paint.
    await new Promise((r) => setTimeout(r))
  }

  // Build indexes AFTER bulk insert = one backfill instead of per-insert upkeep.
  // These back the Explore page's $match/$sort, so paging never scans.
  await listings.createIndex('city')
  await listings.createIndex('pricePerNight')
  await listings.createIndex('rating')
  await listings.createIndex('seedIndex')
  await listings.createCompoundIndex(['city', 'guests'])
  await listings.createFtsIndex('description')
  await listings.createFtsIndex('amenitiesText')

  await markSeeded(db, 'listings', DOC_SEED_VERSION)
}

/**
 * Stage B — lazy vector seed, only on first visit to /discover.
 *
 * Embeddings live in their OWN collection (`listing_vectors`), keyed by `slug`.
 * That is the whole point: the Explore catalog stays lean, so a listing read
 * never carries 384 floats it doesn't need. (The previous version attached the
 * embedding to every `listings` row — which meant deleting and re-inserting all
 * 10k documents here, and then dragging ~3.8M floats through every catalog
 * read for the rest of the session.)
 *
 * `city` is denormalised onto the vector row so hybrid search (vector + metadata
 * filter) is still a single `findNearest` call.
 */
export function ensureVectorSeed(
  db: TalaDB,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (!vectorSeedPromise) {
    vectorSeedPromise = runVectorSeed(db, onProgress).catch((e) => {
      vectorSeedPromise = null
      throw e
    })
  }
  return vectorSeedPromise
}

async function runVectorSeed(
  db: TalaDB,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (await seedDone(db, 'vectors', VECTOR_SEED_VERSION)) return

  const { listings, listingVectors } = collections(db)

  // `embeddings.bin` is a flat Float32 array in the seed file's row order, so
  // each vector must be paired with the listing at the SAME index. We recover
  // that pairing from the local catalog rather than re-downloading the 6.8 MB
  // listings.json for two fields already on disk — but we sort by the explicit
  // `seedIndex` stamped at seed time rather than trusting scan order to happen
  // to be insertion order. Get this wrong and every listing silently gets
  // someone else's embedding.
  const [rows, buf] = await Promise.all([
    listings.aggregate<{ slug: string; city: string; seedIndex: number }>([
      { $sort: { seedIndex: 1 } },
      { $project: { slug: 1, city: 1, seedIndex: 1 } },
    ]),
    fetch('/seed/embeddings.bin').then((r) => {
      if (!r.ok) throw new Error(`failed to load embeddings (${r.status})`)
      return r.arrayBuffer()
    }),
  ])
  const emb = new Float32Array(buf)
  const total = rows.length

  // Fail loudly rather than mis-pair vectors with listings.
  if (emb.length !== total * VECTOR_DIM) {
    throw new Error(
      `embeddings/catalog mismatch: ${emb.length / VECTOR_DIM} vectors vs ${total} listings`,
    )
  }
  if (rows.some((r, i) => r.seedIndex !== i)) {
    throw new Error('catalog seedIndex is not contiguous — refusing to pair embeddings')
  }
  // Only the vector side is rebuilt — the catalog is left completely untouched.
  if ((await listingVectors.count()) > 0) await listingVectors.deleteMany({})

  const BATCH = 250
  for (let i = 0; i < total; i += BATCH) {
    const docs = rows.slice(i, i + BATCH).map((row, j) => ({
      slug: row.slug,
      city: row.city,
      embedding: Array.from(emb.subarray((i + j) * VECTOR_DIM, (i + j) * VECTOR_DIM + VECTOR_DIM)),
    }))
    await listingVectors.insertMany(docs)
    onProgress?.(Math.min(i + BATCH, total), total)
    await new Promise((r) => setTimeout(r))
  }

  await listingVectors.createIndex('city')
  // Flat index — HNSW needs native threads, unavailable in the browser.
  await listingVectors.createVectorIndex('embedding', { dimensions: VECTOR_DIM })
  await markSeeded(db, 'vectors', VECTOR_SEED_VERSION)
}

export function isVectorSeeded(db: TalaDB): Promise<boolean> {
  return seedDone(db, 'vectors', VECTOR_SEED_VERSION)
}
