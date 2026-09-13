'use client'

import { useEffect, useState } from 'react'
import { useTalaDB } from '@taladb/react'
import { deriveDocId, type TalaDB } from 'taladb'
import {
  collections, ensureIndexes, ensureVectorIndex, isSeeded, markSeeded,
  SEED_VERSION, VECTOR_DIM,
} from './schema'
import type { Entity, Memory, Relation } from './types'

// ---------------------------------------------------------------------------
// First-run seeding.
//
// The corpus is a static asset, so this is a pure local import: fetch two
// files, write them to the device, build the indexes once. It happens exactly
// once per browser — every visit after this one opens straight onto data that
// is already on disk, with no network in the path at all.
// ---------------------------------------------------------------------------

interface Corpus {
  version: number
  embeddingModel: string
  dims: number
  // Spelled out rather than derived from `Entity` with `Omit`: `Entity` carries
  // a `Document` index signature, and `Omit` over one keeps the signature while
  // discarding every specific field type — `e.slug` would arrive as `Value`.
  entities: Array<{
    entityType: Entity['entityType']
    slug: string
    name: string
    description: string
    category: string
    icon: string
    manufacturer?: string
    model?: string
    serialNumber?: string
    purchasePrice?: number
    purchasedAt?: number
    warrantyExpiresAt?: number
    condition?: string
    parentSlug?: string
    attributes?: Record<string, string>
    tags?: string[]
    searchText: string
  }>
  memories: Array<{
    memoryType: Memory['memoryType']
    title: string
    content: string
    occurredAt: number
    entitySlugs: string[]
    subjectSlug?: string
    actorSlug?: string
    placeSlug?: string
    amount?: number
    tags?: string[]
    sourceType: Memory['sourceType']
    confidence: Memory['confidence']
  }>
  relations: Array<{ sourceSlug: string; targetSlug: string; relationType: Relation['relationType'] }>
}

export interface SeedProgress {
  phase: 'idle' | 'fetching' | 'entities' | 'memories' | 'relations' | 'indexing' | 'done'
  loaded: number
  total: number
}

/**
 * Stable document ids, derived from the slug rather than minted.
 *
 * This is what makes seeding idempotent: the same slug always maps to the same
 * ULID, so a re-run inserts nothing new — a duplicate id is refused rather than
 * silently creating a second copy. It also means the corpus can reference
 * entities by slug and have those references resolve without a lookup table.
 */
const entityId = (slug: string) => deriveDocId('entities', slug)

// React 19 effect semantics (and StrictMode) can run the gate's effect twice.
// Without this lock the second pass races the first and the corpus lands twice.
let seedPromise: Promise<void> | null = null

function runSeed(db: TalaDB, onProgress: (p: SeedProgress) => void): Promise<void> {
  if (!seedPromise) {
    seedPromise = seed(db, onProgress).catch((err) => {
      seedPromise = null // let a failed run be retried
      throw err
    })
  }
  return seedPromise
}

async function seed(db: TalaDB, onProgress: (p: SeedProgress) => void): Promise<void> {
  const alreadySeeded = await isSeeded(db, 'corpus', SEED_VERSION)

  if (!alreadySeeded) {
    onProgress({ phase: 'fetching', loaded: 0, total: 0 })

    const [corpus, vectorBuffer] = await Promise.all([
      fetch('/seed/corpus.json').then((r) => {
        if (!r.ok) throw new Error(`corpus.json (${r.status})`)
        return r.json() as Promise<Corpus>
      }),
      fetch('/seed/embeddings.bin').then((r) => (r.ok ? r.arrayBuffer() : null)),
    ])

    const vectors = vectorBuffer ? new Float32Array(vectorBuffer) : null
    // Fail loudly rather than pair a memory with someone else's vector. A
    // mismatch here would produce a search index that is subtly, silently wrong.
    if (vectors && vectors.length !== corpus.memories.length * VECTOR_DIM) {
      throw new Error(
        `embeddings/corpus mismatch: ${vectors.length / VECTOR_DIM} vectors, ${corpus.memories.length} memories`,
      )
    }

    const { entities, memories, relations } = collections(db)

    // A partial seed from an interrupted first run would otherwise merge with
    // this one. Derived ids make the inserts idempotent, but the marker is what
    // says the corpus is *complete*, so start clean when it is missing.
    await Promise.all([entities.deleteMany({}), memories.deleteMany({}), relations.deleteMany({})])

    const now = Date.now()

    // --- entities ---------------------------------------------------------
    onProgress({ phase: 'entities', loaded: 0, total: corpus.entities.length })
    await entities.insertMany(
      corpus.entities.map(({ parentSlug, ...e }) => ({
        ...e,
        _id: entityId(e.slug),
        ...(parentSlug ? { parentId: entityId(parentSlug) } : {}),
        createdAt: e.purchasedAt ?? now,
        updatedAt: now,
      })),
    )
    onProgress({ phase: 'entities', loaded: corpus.entities.length, total: corpus.entities.length })

    // --- memories ---------------------------------------------------------
    const nameBySlug = new Map(corpus.entities.map((e) => [e.slug, e.name]))
    const total = corpus.memories.length
    const BATCH = 100

    for (let i = 0; i < total; i += BATCH) {
      const docs = corpus.memories.slice(i, i + BATCH).map((m, j) => {
        const index = i + j
        return {
          _id: deriveDocId('memories', `${m.occurredAt}-${m.title}-${index}`),
          memoryType: m.memoryType,
          title: m.title,
          content: m.content,
          occurredAt: m.occurredAt,
          entityIds: m.entitySlugs.map(entityId),
          entityNames: m.entitySlugs.map((s) => nameBySlug.get(s) ?? s),
          ...(m.subjectSlug ? { subjectId: entityId(m.subjectSlug) } : {}),
          ...(m.actorSlug ? { actorId: entityId(m.actorSlug) } : {}),
          ...(m.placeSlug ? { placeId: entityId(m.placeSlug) } : {}),
          ...(m.amount !== undefined ? { amount: m.amount, currency: 'PHP' } : {}),
          ...(m.tags ? { tags: m.tags } : {}),
          sourceType: m.sourceType,
          confidence: m.confidence,
          ...(vectors
            ? {
                embedding: Array.from(
                  vectors.subarray(index * VECTOR_DIM, index * VECTOR_DIM + VECTOR_DIM),
                ),
                embeddingModel: corpus.embeddingModel,
              }
            : {}),
          createdAt: m.occurredAt,
          updatedAt: m.occurredAt,
        }
      })

      await memories.insertMany(docs)
      onProgress({ phase: 'memories', loaded: Math.min(i + BATCH, total), total })
      // Yield so the progress bar can actually paint between batches.
      await new Promise((r) => setTimeout(r))
    }

    // --- relations --------------------------------------------------------
    onProgress({ phase: 'relations', loaded: 0, total: corpus.relations.length })
    await relations.insertMany(
      corpus.relations.map((r) => ({
        _id: deriveDocId('relations', `${r.sourceSlug}|${r.targetSlug}|${r.relationType}`),
        sourceId: entityId(r.sourceSlug),
        targetId: entityId(r.targetSlug),
        relationType: r.relationType,
        createdAt: now,
      })),
    )
  }

  // Indexes are built LAST on a first run, so each one is a single backfill
  // over a populated collection rather than per-insert upkeep across 300
  // writes. On every later open both calls are cheap no-ops.
  onProgress({ phase: 'indexing', loaded: 0, total: 0 })
  await ensureIndexes(db)
  await ensureVectorIndex(db)

  if (!alreadySeeded) await markSeeded(db, 'corpus', SEED_VERSION)
  onProgress({ phase: 'done', loaded: 0, total: 0 })
}

const PHASE_LABEL: Record<SeedProgress['phase'], string> = {
  idle: 'Starting',
  fetching: 'Loading your memories',
  entities: 'Adding things, people and places',
  memories: 'Writing the timeline',
  relations: 'Connecting everything up',
  indexing: 'Building search indexes',
  done: 'Ready',
}

/**
 * Blocks children until the device has a populated database. Only the very
 * first visit ever sees this; afterwards the marker check resolves in one
 * indexed lookup and the gate opens in the same frame.
 */
export function SeedGate({ children }: { children: React.ReactNode }) {
  const db = useTalaDB()
  const [progress, setProgress] = useState<SeedProgress>({ phase: 'idle', loaded: 0, total: 0 })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    runSeed(db, (p) => {
      if (!cancelled) setProgress(p)
    })
      .then(() => !cancelled && setReady(true))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [db])

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-300 bg-rose-50 p-6 dark:border-rose-900 dark:bg-rose-950/40">
          <h2 className="font-serif text-lg font-semibold text-rose-900 dark:text-rose-200">Could not set up your memory</h2>
          <p className="mt-2 text-sm text-rose-800 dark:text-rose-300">{error}</p>
        </div>
      </div>
    )
  }

  if (!ready) {
    const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : null
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden>
          <rect width="32" height="32" rx="8" className="fill-amber-400" />
          <path
            d="M8 23 Q12 9 16 16 Q20 23 24 9"
            className="stroke-stone-900"
            strokeWidth="2.25"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="8" cy="23" r="2.4" className="fill-stone-900" />
          <circle cx="16" cy="16" r="2.4" className="fill-stone-900" />
          <circle cx="24" cy="9" r="2.4" className="fill-stone-900" />
        </svg>

        <div className="text-center">
          <p role="status" aria-live="polite" className="font-serif text-lg font-medium">
            {PHASE_LABEL[progress.phase]}
          </p>
          <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            Setting up once on this device. Nothing leaves it.
          </p>
        </div>

        <div
          className="h-1.5 w-64 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
          role="progressbar"
          aria-valuenow={pct ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
            style={{ width: pct === null ? '25%' : `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
