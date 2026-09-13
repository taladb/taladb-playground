import type { TalaDB, AggregatePipeline, Document, Filter } from 'taladb'
import { collections } from './schema'
import type { Entity, EntityType, Memory, MemoryRow } from './types'

// ---------------------------------------------------------------------------
// The document half.
//
// Everything here is exact. Spend totals, warranty dates, loan status and
// locations are things the user will act on — call a service centre, claim
// under warranty, go and look on a shelf — so none of them are ever answered by
// ranking. They are indexed lookups, range scans and aggregation pipelines that
// either find the row or say there isn't one.
//
// The semantic layer sits next to this, not underneath it. See lib/retrieval.ts.
// ---------------------------------------------------------------------------

/**
 * Drop the 384-float vector from any list-shaped read.
 *
 * The embedding has to live on the memory document for `hybridSearch` to fuse
 * both rankings in one call, but a timeline rendering forty rows has no use for
 * ~61 KB of floats. `$project` exclusion leaves them in the engine.
 */
const WITHOUT_EMBEDDING = { $project: { embedding: 0 } } as const

/** Newest first. The order every timeline in the app reads in. */
const NEWEST_FIRST = { $sort: { occurredAt: -1 } } as const

/**
 * Match memories whose `entityIds` array contains this id.
 *
 * A comparison against an array field matches when any element satisfies it, so
 * `{ entityIds: id }` is the whole query and the b-tree index on `entityIds`
 * (one entry per element) makes it a point lookup. The cast is needed only
 * because the `Filter` type models the field by its declared type — `string[]`
 * — and cannot express "or one element of it". Named once here rather than
 * cast at every call site.
 */
export const mentions = (entityId: string) =>
  ({ entityIds: entityId }) as unknown as Filter<Memory>

/**
 * Everything that ever happened to an entity — including memories where it was
 * a participant rather than the subject.
 *
 * `{ entityIds: id }` is an array-membership match against the b-tree index on
 * `entityIds`, so this stays one indexed lookup no matter how large the corpus
 * grows. Modelling it as a join collection would have meant fetching the join
 * rows and then fanning out to fetch the memories.
 */
export function entityTimelinePipeline(entityId: string, limit = 200): AggregatePipeline<Memory> {
  return [{ $match: mentions(entityId) }, NEWEST_FIRST, { $limit: limit }, WITHOUT_EMBEDDING]
}

export function recentMemoriesPipeline(limit = 12): AggregatePipeline<Memory> {
  return [NEWEST_FIRST, { $limit: limit }, WITHOUT_EMBEDDING]
}

export function timelinePipeline(
  filter: { memoryType?: Memory['memoryType']; from?: number; to?: number },
  limit: number,
  skip = 0,
): AggregatePipeline<Memory> {
  const match: Record<string, unknown> = {}
  if (filter.memoryType) match.memoryType = filter.memoryType
  if (filter.from !== undefined || filter.to !== undefined) {
    match.occurredAt = {
      ...(filter.from !== undefined ? { $gte: filter.from } : {}),
      ...(filter.to !== undefined ? { $lte: filter.to } : {}),
    }
  }

  return [
    ...(Object.keys(match).length ? [{ $match: match as never }] : []),
    NEWEST_FIRST,
    { $skip: skip },
    { $limit: limit },
    WITHOUT_EMBEDDING,
  ]
}

/** Entities of a type, newest activity irrelevant — this is the browse view. */
export async function listEntities(
  db: TalaDB,
  opts: { entityType?: EntityType; category?: string; includeArchived?: boolean } = {},
): Promise<Entity[]> {
  const { entities } = collections(db)

  // A type+category pair is exactly what the compound index covers, so the
  // planner serves it with one index scan instead of scanning and filtering.
  const filter: Record<string, unknown> = {}
  if (opts.entityType) filter.entityType = opts.entityType
  if (opts.category) filter.category = opts.category
  if (!opts.includeArchived) filter.archivedAt = { $exists: false }

  const rows = await entities.find(filter as never)
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

/** Distinct categories for a type, for the browse filters. */
export async function categoriesFor(db: TalaDB, entityType: EntityType): Promise<string[]> {
  const rows = await collections(db).entities.aggregate<{ _id: string; n: number }>([
    { $match: { entityType } as never },
    { $group: { _id: '$category', n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])
  return rows.map((r) => r._id).filter(Boolean)
}

// --- money ------------------------------------------------------------------

export interface SpendRow extends Document {
  _id: string
  total: number
  n: number
}

/**
 * Total spend per entity over a window. `$group` + `$sum` inside the engine —
 * the alternative is pulling every matching memory across the worker boundary
 * to add up a column in JS.
 */
export async function spendByEntity(
  db: TalaDB,
  opts: { from?: number; to?: number } = {},
): Promise<SpendRow[]> {
  const match: Record<string, unknown> = { amount: { $gt: 0 } }
  if (opts.from !== undefined || opts.to !== undefined) {
    match.occurredAt = {
      ...(opts.from !== undefined ? { $gte: opts.from } : {}),
      ...(opts.to !== undefined ? { $lte: opts.to } : {}),
    }
  }

  return collections(db).memories.aggregate<SpendRow>([
    { $match: match as never },
    { $group: { _id: '$subjectId', total: { $sum: '$amount' }, n: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ])
}

/** Spend on one entity, optionally within a window. The "how much have I spent
 *  maintaining the bike this year" answer — computed, never generated. */
export async function spendForEntity(
  db: TalaDB,
  entityId: string,
  opts: { from?: number; to?: number; types?: Memory['memoryType'][] } = {},
): Promise<{ total: number; n: number }> {
  const match: Record<string, unknown> = { ...mentions(entityId), amount: { $gt: 0 } }
  if (opts.types?.length) match.memoryType = { $in: opts.types }
  if (opts.from !== undefined || opts.to !== undefined) {
    match.occurredAt = {
      ...(opts.from !== undefined ? { $gte: opts.from } : {}),
      ...(opts.to !== undefined ? { $lte: opts.to } : {}),
    }
  }

  const [row] = await collections(db).memories.aggregate<{ total: number; n: number }>([
    { $match: match as never },
    { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } },
  ])
  return { total: row?.total ?? 0, n: row?.n ?? 0 }
}

export async function spendByType(
  db: TalaDB,
  opts: { from?: number; to?: number } = {},
): Promise<SpendRow[]> {
  const match: Record<string, unknown> = { amount: { $gt: 0 } }
  if (opts.from !== undefined || opts.to !== undefined) {
    match.occurredAt = {
      ...(opts.from !== undefined ? { $gte: opts.from } : {}),
      ...(opts.to !== undefined ? { $lte: opts.to } : {}),
    }
  }

  return collections(db).memories.aggregate<SpendRow>([
    { $match: match as never },
    { $group: { _id: '$memoryType', total: { $sum: '$amount' }, n: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ])
}

// --- loans ------------------------------------------------------------------

export interface OpenLoan {
  memory: MemoryRow
  entity: Entity | null
  borrower: Entity | null
  daysOut: number
}

/**
 * What is currently lent out.
 *
 * Append-only by design: a loan is never mutated into a return. A `return`
 * memory for the same subject, dated after the loan, closes it. That keeps the
 * history honest — you can still see that the camera was out for six weeks in
 * 2025 — and it means "what have I lent out?" is a set difference over two
 * indexed reads rather than a status column somebody has to remember to update.
 */
export async function openLoans(db: TalaDB): Promise<OpenLoan[]> {
  const { memories, entities } = collections(db)

  const [loans, returns] = await Promise.all([
    memories.aggregate<MemoryRow>([
      { $match: { memoryType: 'loan' } as never },
      NEWEST_FIRST,
      WITHOUT_EMBEDDING,
    ]),
    memories.aggregate<MemoryRow>([
      { $match: { memoryType: 'return' } as never },
      WITHOUT_EMBEDDING,
    ]),
  ])

  const open = loans.filter(
    (loan) =>
      !returns.some((r) => r.subjectId === loan.subjectId && r.occurredAt >= loan.occurredAt),
  )
  if (!open.length) return []

  const ids = [...new Set(open.flatMap((l) => [l.subjectId, l.actorId].filter(Boolean) as string[]))]
  const people = await entities.find({ _id: { $in: ids } } as never)
  const byId = new Map(people.map((e) => [e._id!, e]))

  const now = Date.now()
  return open.map((memory) => ({
    memory,
    entity: memory.subjectId ? byId.get(memory.subjectId) ?? null : null,
    borrower: memory.actorId ? byId.get(memory.actorId) ?? null : null,
    daysOut: Math.floor((now - memory.occurredAt) / 86_400_000),
  }))
}

// --- warranties -------------------------------------------------------------

export interface ExpiringWarranty {
  entity: Entity
  daysLeft: number
}

/**
 * Warranties running out inside a window. A two-sided range scan on the
 * `warrantyExpiresAt` index — the sort of question that is trivial when the
 * date is a real indexed field and impossible when it is a sentence in a note.
 */
export async function warrantiesExpiring(db: TalaDB, withinDays = 90): Promise<ExpiringWarranty[]> {
  const now = Date.now()
  const until = now + withinDays * 86_400_000

  const rows = await collections(db).entities.find({
    warrantyExpiresAt: { $gte: now, $lte: until },
  } as never)

  return rows
    .map((entity) => ({
      entity,
      daysLeft: Math.ceil((entity.warrantyExpiresAt! - now) / 86_400_000),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/** Already lapsed, most recent first. Shown separately so it reads as history. */
export async function warrantiesExpired(db: TalaDB, withinDays = 365): Promise<ExpiringWarranty[]> {
  const now = Date.now()
  const since = now - withinDays * 86_400_000

  const rows = await collections(db).entities.find({
    warrantyExpiresAt: { $gte: since, $lt: now },
  } as never)

  return rows
    .map((entity) => ({
      entity,
      daysLeft: Math.ceil((entity.warrantyExpiresAt! - now) / 86_400_000),
    }))
    .sort((a, b) => b.daysLeft - a.daysLeft)
}

// --- lookups ----------------------------------------------------------------

export async function entityById(db: TalaDB, id: string): Promise<Entity | null> {
  return collections(db).entities.findOne({ _id: id } as never)
}

export async function entityBySlug(db: TalaDB, slug: string): Promise<Entity | null> {
  return collections(db).entities.findOne({ slug })
}

export async function entitiesByIds(db: TalaDB, ids: string[]): Promise<Map<string, Entity>> {
  if (!ids.length) return new Map()
  const rows = await collections(db).entities.find({ _id: { $in: ids } } as never)
  return new Map(rows.map((e) => [e._id!, e]))
}

export async function memoryById(db: TalaDB, id: string): Promise<Memory | null> {
  return collections(db).memories.findOne({ _id: id } as never)
}

/** Corpus counts for the settings and insights screens. */
export async function stats(db: TalaDB) {
  const { entities, memories, relations, attachments } = collections(db)
  const [entityCount, memoryCount, relationCount, attachmentCount, embedded] = await Promise.all([
    entities.count(),
    memories.count(),
    relations.count(),
    attachments.count(),
    memories.count({ embedding: { $exists: true } } as never),
  ])
  return { entityCount, memoryCount, relationCount, attachmentCount, embedded }
}
