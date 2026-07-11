/**
 * Offline seed generator. Produces two artifacts consumed at first-load:
 *   public/seed/listings.json   — ~10k listing metadata rows (no embeddings)
 *   public/seed/embeddings.bin  — Float32 [N x 384] row-major, same order
 *
 * Run: pnpm seed                 (full: metadata + embeddings, downloads model)
 *      pnpm seed --count 500     (smaller catalog)
 *      pnpm seed --no-embeddings (metadata only — fast, for quick iteration)
 *
 * Embeddings use Xenova/all-MiniLM-L6-v2 (mean-pooled + normalized, 384-dim) —
 * the SAME model the browser uses at query time on /discover. Model parity is
 * mandatory or findNearest scores are meaningless.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CITIES: Array<{ city: string; country: string; lat: number; lng: number }> = [
  { city: 'Lisbon', country: 'Portugal', lat: 38.72, lng: -9.14 },
  { city: 'Barcelona', country: 'Spain', lat: 41.39, lng: 2.17 },
  { city: 'Kyoto', country: 'Japan', lat: 35.01, lng: 135.77 },
  { city: 'Reykjavik', country: 'Iceland', lat: 64.15, lng: -21.94 },
  { city: 'Cape Town', country: 'South Africa', lat: -33.92, lng: 18.42 },
  { city: 'Queenstown', country: 'New Zealand', lat: -45.03, lng: 168.66 },
  { city: 'Marrakech', country: 'Morocco', lat: 31.63, lng: -7.99 },
  { city: 'Bali', country: 'Indonesia', lat: -8.34, lng: 115.09 },
  { city: 'Amsterdam', country: 'Netherlands', lat: 52.37, lng: 4.9 },
  { city: 'Oaxaca', country: 'Mexico', lat: 17.07, lng: -96.72 },
  { city: 'Tbilisi', country: 'Georgia', lat: 41.72, lng: 44.79 },
  { city: 'Hoi An', country: 'Vietnam', lat: 15.88, lng: 108.34 },
  { city: 'Ljubljana', country: 'Slovenia', lat: 46.06, lng: 14.51 },
  { city: 'Cartagena', country: 'Colombia', lat: 10.39, lng: -75.51 },
  { city: 'Chiang Mai', country: 'Thailand', lat: 18.79, lng: 98.98 },
  { city: 'Porto', country: 'Portugal', lat: 41.16, lng: -8.63 },
]

const TYPES = ['Apartment', 'House', 'Villa', 'Cabin', 'Loft', 'Cottage', 'Studio', 'Bungalow'] as const
const AMENITIES = [
  'Wifi', 'Pool', 'Kitchen', 'Air conditioning', 'Hot tub', 'Free parking',
  'Washer', 'Pets allowed', 'Ocean view', 'Fireplace', 'Gym', 'EV charger',
  'Workspace', 'Breakfast', 'Balcony', 'Beachfront',
]
const VIBES = [
  'a sun-drenched', 'a cozy', 'a minimalist', 'a rustic', 'an elegant', 'a bohemian',
  'a modern', 'a charming', 'a secluded', 'a bright', 'a stylish', 'a peaceful',
]
const SETTINGS = [
  'in the historic old town', 'steps from the beach', 'overlooking the harbour',
  'nestled in the hills', 'in a quiet residential lane', 'beside a leafy park',
  'in the buzzing arts district', 'with sweeping mountain views',
  'a short walk from the night market', 'on a tranquil canal',
  'surrounded by vineyards', 'in the heart of downtown',
]
const EXTRAS = [
  'Wake up to fresh coffee on the terrace and watch the city come alive.',
  'Perfect for remote work, with fast wifi and a dedicated desk.',
  'Families love the space, the garden, and the nearby playground.',
  'Unwind in the hot tub after a day of exploring.',
  'Local cafes, bakeries, and galleries are all within a few minutes.',
  'Floor-to-ceiling windows flood the rooms with natural light.',
  'A romantic hideaway for couples seeking peace and quiet.',
  'Cook a feast in the fully equipped kitchen and dine al fresco.',
  'Beach towels, bikes, and a cooler are yours to use.',
  'Sunsets from the balcony are simply unforgettable.',
]

// Deterministic PRNG so re-running the seed yields the same catalog.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  let count = 10000
  let embeddings = true
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') count = parseInt(args[++i], 10)
    else if (args[i] === '--no-embeddings') embeddings = false
  }
  return { count, embeddings }
}

interface Row {
  slug: string
  name: string
  city: string
  country: string
  type: string
  pricePerNight: number
  guests: number
  bedrooms: number
  bathrooms: number
  rating: number
  reviewsCount: number
  amenities: string[]
  amenitiesText: string
  description: string
  lat: number
  lng: number
  image: string
}

function generate(count: number): Row[] {
  const rand = mulberry32(1337)
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
  const rows: Row[] = []

  for (let i = 0; i < count; i++) {
    const loc = pick(CITIES)
    const type = pick(TYPES)
    const bedrooms = 1 + Math.floor(rand() * 4)
    const guests = bedrooms * 2 + Math.floor(rand() * 2)
    const vibe = pick(VIBES)
    const setting = pick(SETTINGS)
    const extra = pick(EXTRAS)
    const amenityCount = 3 + Math.floor(rand() * 6)
    const amenities = [...AMENITIES].sort(() => rand() - 0.5).slice(0, amenityCount)
    const name = `${vibe.replace(/^an? /, (m) => m.charAt(0).toUpperCase() + m.slice(1))} ${type.toLowerCase()} ${setting}`
    const description =
      `${vibe.charAt(0).toUpperCase() + vibe.slice(1)} ${type.toLowerCase()} ${setting} in ${loc.city}, ${loc.country}. ` +
      `Sleeps ${guests} across ${bedrooms} ${bedrooms === 1 ? 'bedroom' : 'bedrooms'}. ` +
      `${extra} Amenities include ${amenities.slice(0, 4).join(', ').toLowerCase()}.`
    const price = 45 + Math.floor(rand() * 420)
    const seedNo = String(i).padStart(5, '0')

    rows.push({
      slug: `${loc.city.toLowerCase().replace(/\s+/g, '-')}-${type.toLowerCase()}-${seedNo}`,
      name,
      city: loc.city,
      country: loc.country,
      type,
      pricePerNight: price,
      guests,
      bedrooms,
      bathrooms: Math.max(1, Math.round(bedrooms * 0.75)),
      rating: Math.round((3.8 + rand() * 1.2) * 100) / 100,
      reviewsCount: Math.floor(rand() * 480),
      amenities,
      amenitiesText: amenities.join(' ').toLowerCase(),
      description,
      lat: loc.lat + (rand() - 0.5) * 0.1,
      lng: loc.lng + (rand() - 0.5) * 0.1,
      image: `https://picsum.photos/seed/${encodeURIComponent(`${loc.city}-${i}`)}/800/600`,
    })
  }
  // Stable order by slug — MUST match the Stage-B embedding row order.
  rows.sort((a, b) => a.slug.localeCompare(b.slug))
  return rows
}

async function embed(rows: Row[]): Promise<Float32Array> {
  const { pipeline } = await import('@huggingface/transformers')
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  const DIM = 384
  const out = new Float32Array(rows.length * DIM)
  const BATCH = 64
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => `${r.name}. ${r.description}`)
    const t = await extractor(batch, { pooling: 'mean', normalize: true })
    const data = t.data as Float32Array
    out.set(data.subarray(0, batch.length * DIM), i * DIM)
    if (i % (BATCH * 10) === 0) {
      process.stdout.write(`\r  embedding ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
    }
  }
  process.stdout.write('\n')
  return out
}

async function main() {
  const { count, embeddings } = parseArgs()
  const outDir = join(process.cwd(), 'public', 'seed')
  await mkdir(outDir, { recursive: true })

  console.log(`Generating ${count.toLocaleString()} listings…`)
  const rows = generate(count)
  await writeFile(join(outDir, 'listings.json'), JSON.stringify(rows))
  console.log(`  wrote listings.json (${rows.length} rows)`)

  if (embeddings) {
    console.log('Generating embeddings (Xenova/all-MiniLM-L6-v2, 384-dim)…')
    const emb = await embed(rows)
    await writeFile(join(outDir, 'embeddings.bin'), Buffer.from(emb.buffer))
    console.log(`  wrote embeddings.bin (${(emb.byteLength / 1e6).toFixed(2)} MB)`)
  } else {
    console.log('Skipping embeddings (--no-embeddings).')
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
