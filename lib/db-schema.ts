import type { TalaDB, Collection } from 'taladb'
import type { Listing, Booking, Favorite, Review } from './types'

export const DB_NAME = 'hotels-v1.db'

// Bump to force a re-seed on all devices (e.g. when the catalog data changes).
// v2: cleared duplicate rows from a pre-lock concurrent double-seed.
// v3: full 10k-listing catalog.
const DOC_SEED_VERSION = 3
const VECTOR_SEED_VERSION = 1

export interface Collections {
  listings: Collection<Listing>
  bookings: Collection<Booking>
  favorites: Collection<Favorite>
  reviews: Collection<Review>
}

export function collections(db: TalaDB): Collections {
  return {
    listings: db.collection<Listing>('listings'),
    bookings: db.collection<Booking>('bookings'),
    favorites: db.collection<Favorite>('favorites'),
    reviews: db.collection<Review>('reviews'),
  }
}

// Tracks one-time local seeding per device. Not in the SyncProvider allowlist,
// so it never syncs. (Collection names can't start with '_' — reserved.)
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
 * Stage A — the ~10k-row document catalog. Streams public/seed/listings.json in
 * batches (each batch is one worker postMessage) so the UI stays responsive,
 * then builds the document indexes in a single backfill. Runs once per device.
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
  const rows = (await res.json()) as Omit<Listing, '_id'>[]
  const total = rows.length
  const BATCH = 400

  for (let i = 0; i < total; i += BATCH) {
    await listings.insertMany(rows.slice(i, i + BATCH))
    onProgress?.(Math.min(i + BATCH, total), total)
    // Yield to the event loop so the progress banner can paint.
    await new Promise((r) => setTimeout(r))
  }

  // Build indexes AFTER bulk insert = one backfill instead of per-insert upkeep.
  await listings.createIndex('city')
  await listings.createIndex('pricePerNight')
  await listings.createCompoundIndex(['city', 'guests'])
  await listings.createFtsIndex('description')
  await listings.createFtsIndex('amenitiesText')

  await markSeeded(db, 'listings', DOC_SEED_VERSION)
}

/**
 * Stage B — lazy vector seed, only invoked on first visit to /discover. Loads
 * public/seed/{listings.json, embeddings.bin} (both in the same row order),
 * rebuilds the catalog with embeddings attached via batched insertMany, then
 * builds the (flat) vector index. HNSW is unavailable in the browser.
 *
 * We rebuild rather than updateOne-per-row (10k round-trips) because listings
 * are referenced everywhere by `slug` (a stable field we control), never by the
 * DB-generated `_id`, so re-inserting is safe. Document indexes persist across
 * the delete/insert and are repopulated automatically.
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

  const DIM = 384
  const [rows, buf] = await Promise.all([
    fetch('/seed/listings.json').then((r) => {
      if (!r.ok) throw new Error(`failed to load seed data (${r.status})`)
      return r.json() as Promise<Omit<Listing, '_id' | 'embedding'>[]>
    }),
    fetch('/seed/embeddings.bin').then((r) => {
      if (!r.ok) throw new Error(`failed to load embeddings (${r.status})`)
      return r.arrayBuffer()
    }),
  ])
  const emb = new Float32Array(buf)
  const total = rows.length

  const { listings } = collections(db)
  await listings.deleteMany({})

  const BATCH = 250
  for (let i = 0; i < total; i += BATCH) {
    const docs = rows.slice(i, i + BATCH).map((row, j) => ({
      ...row,
      embedding: Array.from(emb.subarray((i + j) * DIM, (i + j) * DIM + DIM)),
    }))
    await listings.insertMany(docs)
    onProgress?.(Math.min(i + BATCH, total), total)
    await new Promise((r) => setTimeout(r))
  }

  await listings.createVectorIndex('embedding', { dimensions: DIM }) // flat
  await markSeeded(db, 'vectors', VECTOR_SEED_VERSION)
}

export async function isVectorSeeded(db: TalaDB): Promise<boolean> {
  return seedDone(db, 'vectors', VECTOR_SEED_VERSION)
}
