import { deriveDocId, type TalaDB } from 'taladb'
import { CURRENCY } from './format'
import { collections, VECTOR_DIM } from './schema'
import type { Entity, Memory, Relation } from './types'

// ---------------------------------------------------------------------------
// The demo corpus, turned into documents.
//
// Shared by the browser's first-run seed (lib/seed.tsx) and `bun run verify`,
// so the harness exercises the same mapping the app writes rather than a copy
// of it.
// ---------------------------------------------------------------------------

export interface Corpus {
  version: number
  /** When `bun run seed` wrote the file. Every date in it is relative to this. */
  generatedAt: string
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

const DAY = 86_400_000

/**
 * How far to move the corpus so it ends today rather than on the day it was
 * generated.
 *
 * Without this the demo rots. The corpus was written in September 2026, so by
 * November no warranty fell inside the home screen's 60-day window, the camera
 * had been "lent out" for two months, and "spent this year" would read $0 every
 * January. Whole days, so every memory keeps its time of day.
 */
export function rebaseOffset(corpus: Pick<Corpus, 'generatedAt'>, now = Date.now()): number {
  const generated = Date.parse(corpus.generatedAt)
  if (!Number.isFinite(generated)) return 0
  return Math.max(0, Math.floor(now / DAY) - Math.floor(generated / DAY)) * DAY
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * "18 February 2027", "Feb 2027" and "January 2027". A bare year is left alone:
 * in this corpus those are model years and the like ("2021 Civic RS Turbo"),
 * which are facts about the thing, not points on the timeline.
 */
const DATE_IN_TEXT =
  /\b(?:(\d{1,2}) )?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) (\d{4})\b/g

/**
 * Move the dates written in prose by the same offset as the date fields, so a
 * memory that says "coverage expires 18 February 2027" still agrees with the
 * warranty date stored next to it.
 *
 * The embeddings were computed from the unshifted text. A date is a few tokens
 * of a sentence-level vector, so moving it does not move the memory in any way
 * that matters to similarity search.
 */
export function shiftDatesInText(text: string, offset: number): string {
  if (!offset) return text
  return text.replace(DATE_IN_TEXT, (_match, day: string | undefined, month: string, year: string) => {
    const index = MONTHS.findIndex((m) => m.startsWith(month.slice(0, 3)))
    const at = new Date(Date.UTC(Number(year), index, day ? Number(day) : 15) + offset)
    // Keep the corpus's own spelling: "Feb" stays abbreviated, "February" does not.
    const abbreviated = month.length === 3 && month !== 'May'
    const name = abbreviated ? MONTHS[at.getUTCMonth()].slice(0, 3) : MONTHS[at.getUTCMonth()]
    return `${day ? `${at.getUTCDate()} ` : ''}${name} ${at.getUTCFullYear()}`
  })
}

/**
 * Stable document ids, derived from the corpus rather than minted.
 *
 * This is what makes seeding idempotent: the same slug always maps to the same
 * ULID, so a re-run inserts nothing new — a duplicate id is refused rather than
 * silently creating a second copy. It also means the corpus can reference
 * entities by slug and have those references resolve without a lookup table,
 * and that a re-seed can remove exactly the documents it wrote and nothing the
 * user wrote.
 *
 * Memory ids use the corpus's own, unshifted date and title, so a memory keeps
 * its id however far the corpus is moved.
 */
export const entityId = (slug: string) => deriveDocId('entities', slug)
const memoryId = (m: Corpus['memories'][number], index: number) =>
  deriveDocId('memories', `${m.occurredAt}-${m.title}-${index}`)
const relationId = (r: Corpus['relations'][number]) =>
  deriveDocId('relations', `${r.sourceSlug}|${r.targetSlug}|${r.relationType}`)

/** Every id the corpus writes, per collection. */
export function corpusIds(corpus: Corpus) {
  return {
    entities: corpus.entities.map((e) => entityId(e.slug)),
    memories: corpus.memories.map(memoryId),
    relations: corpus.relations.map(relationId),
  }
}

export function entityDocs(corpus: Corpus, offset: number, now = Date.now()) {
  const shift = (ts: number | undefined) => (ts === undefined ? undefined : ts + offset)
  const text = (s: string) => shiftDatesInText(s, offset)

  return corpus.entities.map(({ parentSlug, purchasedAt, warrantyExpiresAt, attributes, ...e }) => ({
    ...e,
    _id: entityId(e.slug),
    description: text(e.description),
    searchText: text(e.searchText),
    ...(purchasedAt !== undefined ? { purchasedAt: shift(purchasedAt) } : {}),
    ...(warrantyExpiresAt !== undefined ? { warrantyExpiresAt: shift(warrantyExpiresAt) } : {}),
    ...(attributes
      ? { attributes: Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k, text(v)])) }
      : {}),
    ...(parentSlug ? { parentId: entityId(parentSlug) } : {}),
    createdAt: shift(purchasedAt) ?? now,
    updatedAt: now,
  }))
}

/**
 * Memory documents for `corpus.memories.slice(from, to)`, so a caller can write
 * them in batches and paint progress between them.
 */
export function memoryDocs(
  corpus: Corpus,
  vectors: Float32Array | null,
  offset: number,
  from = 0,
  to = corpus.memories.length,
) {
  const nameBySlug = new Map(corpus.entities.map((e) => [e.slug, e.name]))

  return corpus.memories.slice(from, to).map((m, j) => {
    const index = from + j
    const occurredAt = m.occurredAt + offset
    return {
      _id: memoryId(m, index),
      memoryType: m.memoryType,
      title: shiftDatesInText(m.title, offset),
      content: shiftDatesInText(m.content, offset),
      occurredAt,
      entityIds: m.entitySlugs.map(entityId),
      entityNames: m.entitySlugs.map((s) => nameBySlug.get(s) ?? s),
      ...(m.subjectSlug ? { subjectId: entityId(m.subjectSlug) } : {}),
      ...(m.actorSlug ? { actorId: entityId(m.actorSlug) } : {}),
      ...(m.placeSlug ? { placeId: entityId(m.placeSlug) } : {}),
      ...(m.amount !== undefined ? { amount: m.amount, currency: CURRENCY } : {}),
      ...(m.tags ? { tags: m.tags } : {}),
      sourceType: m.sourceType,
      confidence: m.confidence,
      sample: true as const,
      ...(vectors
        ? {
            embedding: Array.from(vectors.subarray(index * VECTOR_DIM, (index + 1) * VECTOR_DIM)),
            embeddingModel: corpus.embeddingModel,
          }
        : {}),
      createdAt: occurredAt,
      updatedAt: occurredAt,
    }
  })
}

export function relationDocs(corpus: Corpus, now = Date.now()) {
  return corpus.relations.map((r) => ({
    _id: relationId(r),
    sourceId: entityId(r.sourceSlug),
    targetId: entityId(r.targetSlug),
    relationType: r.relationType,
    createdAt: now,
  }))
}

export type CorpusPhase = 'entities' | 'memories' | 'relations'

/**
 * Write the corpus, moved so that it ends on `now`, replacing any copy of it
 * already on this device.
 *
 * A partial seed from an interrupted first run, or an older corpus version,
 * would otherwise collide with this one. So it removes exactly what the corpus
 * writes — never `deleteMany({})`, which took the visitor's own memories with
 * it whenever SEED_VERSION moved. Anything the visitor wrote themselves stays.
 */
export async function writeCorpus(
  db: TalaDB,
  corpus: Corpus,
  vectors: Float32Array | null,
  opts: { now?: number; onProgress?: (phase: CorpusPhase, loaded: number, total: number) => void } = {},
): Promise<void> {
  // Fail loudly rather than pair a memory with someone else's vector. A
  // mismatch here would produce a search index that is subtly, silently wrong.
  if (vectors && vectors.length !== corpus.memories.length * VECTOR_DIM) {
    throw new Error(
      `embeddings/corpus mismatch: ${vectors.length / VECTOR_DIM} vectors, ${corpus.memories.length} memories`,
    )
  }

  const { entities, memories, relations } = collections(db)
  const now = opts.now ?? Date.now()
  const offset = rebaseOffset(corpus, now)
  const progress = opts.onProgress ?? (() => {})

  const ids = corpusIds(corpus)
  await Promise.all([
    entities.deleteMany({ _id: { $in: ids.entities } } as never),
    memories.deleteMany({ _id: { $in: ids.memories } } as never),
    relations.deleteMany({ _id: { $in: ids.relations } } as never),
  ])

  progress('entities', 0, corpus.entities.length)
  await entities.insertMany(entityDocs(corpus, offset, now))
  progress('entities', corpus.entities.length, corpus.entities.length)

  const total = corpus.memories.length
  const BATCH = 100
  for (let i = 0; i < total; i += BATCH) {
    await memories.insertMany(memoryDocs(corpus, vectors, offset, i, i + BATCH))
    progress('memories', Math.min(i + BATCH, total), total)
    // Yield so a progress bar can actually paint between batches.
    await new Promise((r) => setTimeout(r))
  }

  progress('relations', 0, corpus.relations.length)
  await relations.insertMany(relationDocs(corpus, now))
}
