import type { Collection, Document, TalaDB, VectorCacheStats, VectorQuantization } from 'taladb'
import { HNSW_GRAPH, VECTOR_DIM } from './schema'

// ---------------------------------------------------------------------------
// The scale lab.
//
// Keepsake's corpus is 328 memories, which is the right size for a person and
// the wrong size for showing what the engine does at volume: at 328 vectors
// the exact scan is the answer, a graph cannot earn its keep, and every sorted
// page is cheap however it is served. The lab fills a *separate* database with
// tens of thousands of synthetic memories and measures the paths the real app
// would take at that size, on this device.
//
// The vectors are synthetic — clustered Gaussian noise around random centres,
// normalised like MiniLM's output — because embedding 25,000 sentences in a
// browser would take longer than anyone will wait, and because the engine's
// costs depend on the count and the dimension, not on what the numbers mean.
// Clusters matter: uniform random vectors are a known worst case for graph
// search that no real embedding resembles.
//
// Shared by app/lab/page.tsx and `bun run lab`, so the same code measures the
// browser (WASM, OPFS, 8 MiB cache) and native (Node, 64 MiB cache).
// ---------------------------------------------------------------------------

export const LAB_DB = 'keepsake-lab.db'
export const LAB_SIZES = [5_000, 10_000, 25_000] as const
/**
 * efSearch values the lab sweeps. The engine raises efSearch to at least
 * k × oversampling (4 by default) — 40 for a top-10 — so the sweep starts
 * there; anything lower would quietly run as 40.
 */
export const LAB_EF = [40, 60, 100, 200] as const

export interface LabMemory extends Document {
  memoryType: string
  occurredAt: number
  amount?: number
  embedding: number[]
}

export function labCollection(db: TalaDB): Collection<LabMemory> {
  return db.collection<LabMemory>('memories')
}

/** Small, fast, seedable — the same seed gives the same corpus everywhere. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), Number.EPSILON)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

function normalise(v: number[]): number[] {
  const norm = Math.hypot(...v) || 1
  return v.map((x) => x / norm)
}

const CLUSTERS = 64
/** Spread within a cluster, relative to a unit centre. Tight enough to cluster,
 *  loose enough that neighbours are not all near-duplicates. */
const SPREAD = 0.06

function centres(rand: () => number): number[][] {
  return Array.from({ length: CLUSTERS }, () =>
    normalise(Array.from({ length: VECTOR_DIM }, () => gaussian(rand))),
  )
}

function near(centre: number[], rand: () => number): number[] {
  return normalise(centre.map((x) => x + SPREAD * gaussian(rand)))
}

const TYPES = ['note', 'purchase', 'maintenance', 'repair', 'loan', 'return', 'movement', 'expense']
const FIVE_YEARS = 5 * 365 * 86_400_000

export interface PopulateProgress {
  phase: 'clearing' | 'writing' | 'indexing' | 'done'
  loaded: number
  total: number
}

/**
 * Replace the lab corpus with `count` synthetic memories, then index them the
 * way Keepsake indexes its own: a b-tree on `occurredAt` and an exact vector
 * index on `embedding`. Returns how long the writes and the indexing took.
 */
export async function populate(
  db: TalaDB,
  count: number,
  onProgress: (p: PopulateProgress) => void = () => {},
): Promise<{ writeMs: number; indexMs: number }> {
  const memories = labCollection(db)
  const rand = mulberry32(0x7a1ad8)
  const anchors = centres(rand)

  onProgress({ phase: 'clearing', loaded: 0, total: count })
  await clearLab(db)

  // Indexes go on after the writes, so each is one backfill rather than upkeep
  // on every insert — the same order Keepsake's first-run seed uses.
  const now = Date.now()
  const BATCH = 500
  const writeStart = performance.now()
  for (let i = 0; i < count; i += BATCH) {
    const docs = Array.from({ length: Math.min(BATCH, count - i) }, (): LabMemory => {
      const r = rand()
      return {
        memoryType: TYPES[Math.floor(r * TYPES.length)],
        occurredAt: Math.floor(now - rand() * FIVE_YEARS),
        // About a third carry an amount, like the real corpus.
        ...(r < 0.33 ? { amount: Math.round(100 + rand() * 20_000) } : {}),
        embedding: near(anchors[Math.floor(rand() * CLUSTERS)], rand),
      }
    })
    await memories.insertMany(docs)
    onProgress({ phase: 'writing', loaded: Math.min(i + BATCH, count), total: count })
  }
  const writeMs = performance.now() - writeStart

  onProgress({ phase: 'indexing', loaded: count, total: count })
  const indexStart = performance.now()
  await memories.createIndex('occurredAt')
  await memories.createVectorIndex('embedding', { dimensions: VECTOR_DIM, metric: 'cosine', indexType: 'flat' })
  const indexMs = performance.now() - indexStart

  onProgress({ phase: 'done', loaded: count, total: count })
  return { writeMs, indexMs }
}

/** Empty the lab database. Keepsake's own database is never touched. */
export async function clearLab(db: TalaDB): Promise<void> {
  const memories = labCollection(db)
  const indexes = await memories.listIndexes()
  if (indexes.vector.includes('embedding')) await memories.dropVectorIndex('embedding')
  if (indexes.btree.includes('occurredAt')) await memories.dropIndex('occurredAt')
  await memories.deleteMany({})
  await db.compact().catch(() => {})
}

/** Query vectors drawn from the same clusters as the corpus, but not in it. */
export function labQueries(n = 20): number[][] {
  const rand = mulberry32(0x7a1ad8)
  const anchors = centres(rand) // same centres as the corpus
  const queryRand = mulberry32(0x5eed)
  return Array.from({ length: n }, () => near(anchors[Math.floor(queryRand() * CLUSTERS)], queryRand))
}

// --- measuring ---------------------------------------------------------------

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Median wall time of `runs` calls, after one untimed warm-up. */
async function timed(runs: number, fn: (i: number) => Promise<unknown>): Promise<number> {
  await fn(0)
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    await fn(i)
    times.push(performance.now() - t)
  }
  return median(times)
}

export interface DocumentBench {
  /** `$sort: { occurredAt: 1 }, $limit: 10` — 0.13 stops reading the index at the page's end. */
  oldestPageMs: number
  /** Newest first: still walks the index, but holds only the page. */
  newestPageMs: number
  /** `occurredAt: { $gte, $lt }` over one month — a single range scan since 0.13. */
  monthRangeMs: number
  monthRangeRows: number
  /** Unindexed filter that matches nothing: 0.13 decodes only `amount`, not the vector. */
  unindexedMissMs: number
}

export async function benchDocuments(db: TalaDB, runs = 9): Promise<DocumentBench> {
  const memories = labCollection(db)
  const to = Date.now() - 365 * 86_400_000
  const from = to - 30 * 86_400_000
  let monthRangeRows = 0

  return {
    oldestPageMs: await timed(runs, () =>
      memories.aggregate([{ $sort: { occurredAt: 1 } }, { $limit: 10 }, { $project: { embedding: 0 } }]),
    ),
    newestPageMs: await timed(runs, () =>
      memories.aggregate([{ $sort: { occurredAt: -1 } }, { $limit: 10 }, { $project: { embedding: 0 } }]),
    ),
    monthRangeMs: await timed(runs, async () => {
      monthRangeRows = await memories.count({ occurredAt: { $gte: from, $lt: to } })
    }),
    monthRangeRows,
    unindexedMissMs: await timed(runs, () => memories.find({ amount: { $gt: 10_000_000 } })),
  }
}

export interface VectorRun {
  path: string
  medianMs: number
  /** Distances computed per query — the work the index actually did. */
  distances: number
  recallAt10: number | null
  efSearch: number | null
}

/** Exact search: every stored vector is compared. The ground truth. */
export async function benchExact(db: TalaDB, queries: number[][]): Promise<VectorRun> {
  const memories = labCollection(db)
  let distances = 0
  const medianMs = await timed(queries.length, async (i) => {
    const r = await memories.searchVectors('embedding', queries[i % queries.length], 10, undefined, { mode: 'exact' })
    distances = r.execution.distanceComputations
  })
  return { path: 'exact', medianMs, distances, recallAt10: 1, efSearch: null }
}

/**
 * Build the HNSW graph over the lab corpus. The live index keeps answering
 * (exactly) until the graph is published.
 */
export async function buildLabGraph(
  db: TalaDB,
  opts: { quantization?: VectorQuantization; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ buildMs: number }> {
  const start = performance.now()
  await labCollection(db).rebuildVectorIndex('embedding', {
    ...HNSW_GRAPH,
    quantization: opts.quantization ?? 'none',
    batchSize: 256,
    signal: opts.signal,
    onProgress: (p) => opts.onProgress?.(p.processed, p.total),
  })
  return { buildMs: performance.now() - start }
}

/** Graph search at one efSearch, with recall measured against exact. */
export async function benchAnn(db: TalaDB, queries: number[][], efSearch: number): Promise<VectorRun> {
  const memories = labCollection(db)
  let distances = 0
  let path = 'hnsw'
  let effective: number | null = efSearch
  const medianMs = await timed(queries.length, async (i) => {
    const r = await memories.searchVectors('embedding', queries[i % queries.length], 10, undefined, {
      mode: 'ann',
      efSearch,
    })
    distances = r.execution.distanceComputations
    path = r.execution.path
    effective = r.execution.efSearch
  })
  const recall = await memories.measureVectorRecall('embedding', queries, 10, undefined, { efSearch })
  return { path, medianMs, distances, recallAt10: recall.recallAtK, efSearch: effective }
}

export async function labCache(db: TalaDB): Promise<VectorCacheStats> {
  return labCollection(db).vectorCacheStats()
}
