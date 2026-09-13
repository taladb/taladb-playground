import { z } from 'zod'
import type { TalaDB, Collection, CollectionOptions } from 'taladb'
import type { Entity, Memory, Relation, Attachment, Blob, AppMeta } from './types'

export const DB_NAME = 'keepsake.db'

/** Dimensions of all-MiniLM-L6-v2 — the model both the seeder and the browser use. */
export const VECTOR_DIM = 384
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'

/** Bump to force every device to re-seed its demo corpus. */
export const SEED_VERSION = 1

// ---------------------------------------------------------------------------
// Schemas
//
// `schema` is a strict Zod parse on the local write path: this is our own code
// calling insert with the caller three frames up, so a bad document should fail
// loudly and immediately rather than land on disk.
//
// `syncSchema` is mostly inert since 0.11.0 removed sync — but `version` is not.
// It still makes the engine stamp `_v` on every insert, which is what lets a
// future release recognise an older document shape and upgrade it on read via
// `migrateDocument`. Cheap now, and the only thing that makes the data format
// versioned rather than merely current.
// ---------------------------------------------------------------------------

export const ENTITY_V = 1
export const MEMORY_V = 1
export const RELATION_V = 1
export const ATTACHMENT_V = 1

const EntitySchema = z.object({
  _v: z.literal(ENTITY_V).optional(),
  entityType: z.enum(['thing', 'person', 'place', 'organization', 'project', 'document']),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  category: z.string(),
  icon: z.string(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  purchasePrice: z.number().nonnegative().optional(),
  purchasedAt: z.number().optional(),
  warrantyExpiresAt: z.number().optional(),
  condition: z.string().optional(),
  parentId: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()).optional(),
  searchText: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  archivedAt: z.number().optional(),
})

const MemorySchema = z.object({
  _v: z.literal(MEMORY_V).optional(),
  memoryType: z.enum([
    'note', 'purchase', 'maintenance', 'repair', 'loan', 'return', 'movement',
    'decision', 'expense', 'observation', 'conversation', 'appointment',
    'installation', 'replacement', 'warranty',
  ]),
  title: z.string().min(1),
  content: z.string(),
  occurredAt: z.number(),
  entityIds: z.array(z.string()),
  entityNames: z.array(z.string()),
  subjectId: z.string().optional(),
  actorId: z.string().optional(),
  placeId: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  loanClosedByMemoryId: z.string().optional(),
  sourceType: z.enum([
    'user_entered', 'document_extracted', 'photo_extracted', 'imported', 'system_inferred',
  ]),
  confidence: z.enum(['confirmed', 'extracted', 'inferred']),
  confidenceScore: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  // Length is checked rather than merely typed: a vector of the wrong width is
  // rejected by the engine at insert time anyway, but failing here names the
  // document instead of the index.
  embedding: z.array(z.number()).length(VECTOR_DIM).optional(),
  embeddingModel: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const RelationSchema = z.object({
  _v: z.literal(RELATION_V).optional(),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relationType: z.enum([
    'owns', 'stored_at', 'located_in', 'purchased_from', 'serviced_by',
    'borrowed_by', 'part_of', 'related_to',
  ]),
  memoryId: z.string().optional(),
  createdAt: z.number(),
})

const AttachmentSchema = z.object({
  _v: z.literal(ATTACHMENT_V).optional(),
  hash: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string(),
  size: z.number().nonnegative(),
  kind: z.enum(['photo', 'receipt', 'document', 'manual', 'audio', 'other']),
  memoryId: z.string().optional(),
  entityId: z.string().optional(),
  extractedText: z.string().optional(),
  createdAt: z.number(),
})

/**
 * Registered on `<TalaDBProvider collections={…}>` AND spread into
 * `collections(db)` below, so both access paths — hooks and direct handles —
 * resolve a *configured* collection. Before 0.9.3 the hooks silently bypassed
 * this, which is the kind of gap that only shows up as corrupt data much later.
 */
export const COLLECTION_OPTIONS = {
  entities: {
    schema: EntitySchema,
    syncSchema: { version: ENTITY_V },
  } satisfies CollectionOptions<Entity>,
  memories: {
    schema: MemorySchema,
    syncSchema: { version: MEMORY_V },
  } satisfies CollectionOptions<Memory>,
  relations: {
    schema: RelationSchema,
    syncSchema: { version: RELATION_V },
  } satisfies CollectionOptions<Relation>,
  attachments: {
    schema: AttachmentSchema,
    syncSchema: { version: ATTACHMENT_V },
  } satisfies CollectionOptions<Attachment>,
}

export interface Collections {
  entities: Collection<Entity>
  memories: Collection<Memory>
  relations: Collection<Relation>
  attachments: Collection<Attachment>
  blobs: Collection<Blob>
  meta: Collection<AppMeta>
}

export function collections(db: TalaDB): Collections {
  return {
    entities: db.collection<Entity>('entities', COLLECTION_OPTIONS.entities),
    memories: db.collection<Memory>('memories', COLLECTION_OPTIONS.memories),
    relations: db.collection<Relation>('relations', COLLECTION_OPTIONS.relations),
    attachments: db.collection<Attachment>('attachments', COLLECTION_OPTIONS.attachments),
    // Raw bytes. No schema — a Zod parse over a multi-megabyte Uint8Array on
    // every write buys nothing the hash doesn't already guarantee.
    blobs: db.collection<Blob>('blobs'),
    meta: db.collection<AppMeta>('app_meta'),
  }
}

// ---------------------------------------------------------------------------
// Indexes
//
// Two families, and the app leans on both:
//
//   Document engine — b-tree, compound and FTS indexes back the parts of the
//   product that must be exact. "How much did I spend on the bike this year"
//   is a `$group`/`$sum`, not a guess, and "warranties expiring in 30 days" is
//   a range scan. An answer that has to be right is never routed through a
//   vector.
//
//   Vector engine — one HNSW index over memory embeddings backs the part that
//   must be forgiving. "bike keeps making a clicking noise" shares no tokens
//   with "rear derailleur adjusted", and no amount of keyword tuning fixes
//   that.
//
// `hybridSearch` needs one of each on the SAME collection, which is why
// `memories` carries both an FTS index on `content` and a vector index on
// `embedding`.
// ---------------------------------------------------------------------------

/**
 * Create every document-side index. Cheap and idempotent, so it runs on every
 * open rather than hiding behind a marker that could drift out of sync with
 * the code that assumes the index exists.
 */
export async function ensureIndexes(db: TalaDB): Promise<void> {
  const { entities, memories, relations, attachments, blobs } = collections(db)

  await entities.createIndex('entityType')
  await entities.createIndex('slug')
  await entities.createIndex('category')
  await entities.createIndex('parentId')
  await entities.createIndex('warrantyExpiresAt')
  // Serves the entity browser's type+category facet in one scan.
  await entities.createCompoundIndex(['entityType', 'category'])
  await entities.createFtsIndex('searchText')

  await memories.createIndex('occurredAt')
  await memories.createIndex('memoryType')
  await memories.createIndex('subjectId')
  await memories.createIndex('actorId')
  await memories.createIndex('placeId')
  // Array membership: `{ entityIds: someId }` matches a document whose array
  // contains it, so an entity's full timeline — including memories where it is
  // a participant rather than the subject — is a single indexed lookup.
  await memories.createIndex('entityIds')
  await memories.createCompoundIndex(['subjectId', 'memoryType'])
  await memories.createFtsIndex('content')

  await relations.createIndex('sourceId')
  await relations.createIndex('targetId')
  await relations.createIndex('relationType')

  await attachments.createIndex('memoryId')
  await attachments.createIndex('entityId')
  await attachments.createIndex('hash')
  await attachments.createFtsIndex('extractedText')

  await blobs.createIndex('hash')
}

/**
 * Create the memory vector index, preferring a persistent HNSW graph.
 *
 * Worth spelling out because it changed recently: until 0.11.4 the browser had
 * no choice but an exact flat scan — HNSW needed native threads, so it was
 * Node/React-Native only. 0.11.4 replaced that with portable graphs that live
 * in the same database as the documents and are updated in the same
 * transaction as an embedding write. Reopening needs no rebuild.
 *
 * `storageInfo()` still reports whether this particular browser got HNSW, and
 * a flat index answers the same queries exactly (just by scanning), so the
 * fallback is a performance difference and not a feature difference.
 */
export async function ensureVectorIndex(db: TalaDB): Promise<'hnsw' | 'flat'> {
  const { memories } = collections(db)

  const existing = await memories.listIndexes()
  if (existing.vector.includes('embedding')) {
    const status = await memories.vectorIndexStatus('embedding')
    return status.state === 'flat' ? 'flat' : 'hnsw'
  }

  const info = await db.storageInfo?.()
  const indexType = info?.hnsw === false ? 'flat' : 'hnsw'

  await memories.createVectorIndex('embedding', {
    dimensions: VECTOR_DIM,
    metric: 'cosine',
    indexType,
    // Modest M: this is a personal corpus (thousands, not millions), and a
    // smaller graph builds faster on a phone without measurably hurting recall
    // at this scale.
    hnswM: 16,
    hnswEfConstruction: 200,
  })

  return indexType
}

// --- one-time local setup markers ------------------------------------------

export async function isSeeded(db: TalaDB, key: string, version: number): Promise<boolean> {
  const doc = await collections(db).meta.findOne({ key })
  return !!doc && doc.version === version
}

export async function markSeeded(db: TalaDB, key: string, version: number): Promise<void> {
  const { meta } = collections(db)
  await meta.deleteMany({ key })
  await meta.insert({ key, version })
}

/** Read a small local setting. Settings live in the DB so they survive a reload. */
export async function getSetting(db: TalaDB, key: string): Promise<string | null> {
  const doc = await collections(db).meta.findOne({ key })
  return doc?.value ?? null
}

export async function setSetting(db: TalaDB, key: string, value: string): Promise<void> {
  const { meta } = collections(db)
  await meta.deleteMany({ key })
  await meta.insert({ key, version: 0, value })
}
