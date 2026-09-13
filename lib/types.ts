import type { Document } from 'taladb'

// ---------------------------------------------------------------------------
// The domain is entity-first, not note-first: things, people, places, projects —
// and a timeline of what happened to each. Everything below is one of three
// shapes: an Entity (something in your world), a Memory (something that
// happened), or a Relation (how two of them connect).
// ---------------------------------------------------------------------------

export type EntityType =
  | 'thing'
  | 'person'
  | 'place'
  | 'organization'
  | 'project'
  | 'document'

export const ENTITY_TYPES: EntityType[] = [
  'thing',
  'person',
  'place',
  'organization',
  'project',
  'document',
]

/**
 * Something meaningful in the user's world.
 *
 * Core attributes are columns; everything category-specific lives in
 * `attributes`. Hardcoding a field per category (tyre size, battery model,
 * lens mount, …) is how an inventory app ends up with 200 nullable columns, so
 * the schema stays deliberately thin and the long tail is a free-form map.
 */
export interface Entity extends Document {
  entityType: EntityType
  /** Stable human key. Drives `deriveDocId`, the QR payload, and URLs. */
  slug: string
  name: string
  description: string
  /** Free-form, e.g. 'Bicycle', 'Laptop', 'Contractor'. Not an enum on purpose. */
  category: string
  icon: string

  // --- Thing attributes. All optional; a Person has none of them. -----------
  manufacturer?: string
  model?: string
  serialNumber?: string
  purchasePrice?: number
  purchasedAt?: number
  warrantyExpiresAt?: number
  condition?: string

  /**
   * Parent entity. Gives places their hierarchy (Home → Garage → Cabinet →
   * Shelf B) and lets a Thing hang off a Collection. Traversed recursively by
   * `lib/graph.ts` rather than stored as a materialised path, so moving a
   * cabinet doesn't require rewriting every descendant.
   */
  parentId?: string

  /** Category-specific fields the core schema deliberately doesn't know about. */
  attributes?: Record<string, string>

  /** Queryable array — `{ tags: 'loanable' }` matches an element (taladb 0.11). */
  tags?: string[]

  /** Denormalised for the entity browser's FTS index. */
  searchText: string

  createdAt: number
  updatedAt: number
  archivedAt?: number
}

/**
 * What happened. The 16 types come from the spec's capture vocabulary; `note`
 * is the fallback when the extractor can't classify and the user didn't say.
 */
export type MemoryType =
  | 'note'
  | 'purchase'
  | 'maintenance'
  | 'repair'
  | 'loan'
  | 'return'
  | 'movement'
  | 'decision'
  | 'expense'
  | 'observation'
  | 'conversation'
  | 'appointment'
  | 'installation'
  | 'replacement'
  | 'warranty'

export const MEMORY_TYPES: MemoryType[] = [
  'note',
  'purchase',
  'maintenance',
  'repair',
  'loan',
  'return',
  'movement',
  'decision',
  'expense',
  'observation',
  'conversation',
  'appointment',
  'installation',
  'replacement',
  'warranty',
]

/** Where a fact came from. Shown in the UI so an extraction is never silent. */
export type SourceType =
  | 'user_entered'
  | 'document_extracted'
  | 'photo_extracted'
  | 'imported'
  | 'system_inferred'

/** Three user-facing confidence bands, per the spec's provenance model. */
export type Confidence = 'confirmed' | 'extracted' | 'inferred'

/**
 * A single remembered event.
 *
 * ## Why the embedding lives on this document
 *
 * The instinct — and what the previous demo did with listings — is to keep
 * vectors in their own collection so an ordinary read never drags 384 floats
 * per row across the worker boundary. That instinct is right, but `hybridSearch`
 * fuses a BM25 ranking over `content` with a vector ranking over `embedding`,
 * and it can only do that when **both indexes are on the same collection**.
 * Splitting them would mean two queries and hand-rolled rank fusion in JS,
 * which is precisely the part worth not writing.
 *
 * So the vector stays here and every list-shaped read projects it away with
 * `$project: { embedding: 0 }` (see `lib/queries.ts`). The cost is paid only by
 * the queries that actually rank.
 */
export interface MemoryFields {
  memoryType: MemoryType
  title: string
  /** The prose. FTS-indexed, and the text that gets embedded. */
  content: string
  occurredAt: number

  /**
   * Every entity this memory touches, denormalised onto the document as a
   * queryable array. A join collection would be the textbook answer, but
   * taladb 0.11 indexes array membership directly — `{ entityIds: id }` matches
   * a document whose array contains `id` — so an entity's whole timeline is one
   * indexed lookup instead of a two-step fetch-then-fan-out.
   */
  entityIds: string[]
  /** Denormalised names, so a timeline row renders without resolving entities. */
  entityNames: string[]

  /** The subject — the thing the event happened *to*. First-class for timelines. */
  subjectId?: string
  /** Who performed or received it: a Person or Organization. */
  actorId?: string
  /** Where it happened, or where the subject ended up (for `movement`). */
  placeId?: string

  amount?: number
  currency?: string

  /** Loan bookkeeping. A `loan` opens; the matching `return` closes it. */
  loanClosedByMemoryId?: string

  sourceType: SourceType
  confidence: Confidence
  /** 0–1. Only meaningful for `extracted` / `inferred`. */
  confidenceScore?: number

  tags?: string[]

  createdAt: number
  updatedAt: number
}

/**
 * A single remembered event.
 *
 * ## Why the embedding lives on this document
 *
 * The instinct — and what the previous demo did with listings — is to keep
 * vectors in their own collection so an ordinary read never drags 384 floats
 * per row across the worker boundary. That instinct is right, but `hybridSearch`
 * fuses a BM25 ranking over `content` with a vector ranking over `embedding`,
 * and it can only do that when **both indexes are on the same collection**.
 * Splitting them would mean two queries and hand-rolled rank fusion in JS,
 * which is precisely the part worth not writing.
 *
 * So the vector stays here and every list-shaped read projects it away with
 * `$project: { embedding: 0 }` (see `lib/queries.ts`). The cost is paid only by
 * the queries that actually rank.
 */
export interface Memory extends MemoryFields, Document {
  /** 384 floats when the semantic layer is on; absent when it is off. */
  embedding?: number[]
  /** Model that produced `embedding`. Vectors are never canonical — see §46. */
  embeddingModel?: string
}

/**
 * A memory with its vector projected away — what every list view reads.
 *
 * Spelled out rather than written as `Omit<Memory, 'embedding'>`, because
 * `Omit` over a type carrying an index signature keeps the signature and drops
 * every specific field type with it: `row.occurredAt` would come back as
 * `Value | undefined` instead of `number`, and every arithmetic use of it would
 * need a cast.
 */
export interface MemoryRow extends MemoryFields, Document {}

/**
 * A typed edge. Entity→Entity and Memory→Entity links both live here, so graph
 * traversal is one collection scan regardless of what is being connected.
 */
export type RelationType =
  | 'owns'
  | 'stored_at'
  | 'located_in'
  | 'purchased_from'
  | 'serviced_by'
  | 'borrowed_by'
  | 'part_of'
  | 'related_to'

export interface Relation extends Document {
  sourceId: string
  targetId: string
  relationType: RelationType
  /** Set when this edge was asserted by a memory, so it can be cited. */
  memoryId?: string
  createdAt: number
}

/**
 * Attachment metadata. Bytes live in `blobs`, addressed by SHA-256, so the same
 * receipt photographed twice is stored once and a corrupt file is detectable.
 */
export interface Attachment extends Document {
  /** SHA-256 of the bytes, hex. The blob's `_id` is derived from this. */
  hash: string
  filename: string
  mimeType: string
  size: number
  kind: 'photo' | 'receipt' | 'document' | 'manual' | 'audio' | 'other'
  memoryId?: string
  entityId?: string
  /** OCR or user caption — FTS-indexed, so a receipt's text is searchable. */
  extractedText?: string
  createdAt: number
}

/** Content-addressed bytes, split out so attachment metadata reads stay cheap. */
export interface Blob extends Document {
  hash: string
  bytes: Uint8Array
  size: number
}

/** One-time local setup markers. Never leaves the device. */
export interface AppMeta extends Document {
  key: string
  version: number
  value?: string
}
