import type { TalaDB } from 'taladb'
import { collections, EMBEDDING_MODEL } from './schema'
import { embed, embedMany, isEmbedderReady, memoryEmbeddingText } from './embed'
import { openLoans } from './queries'
import { CURRENCY } from './format'
import type { Entity, MemoryRow, MemoryType, RelationType, SourceType } from './types'

// ---------------------------------------------------------------------------
// Writes.
//
// A write here is local, immediate and durable — it either committed or it
// threw. There is no optimistic update to reconcile and no rollback to reason
// about, because there is no server on the other side of it.
// ---------------------------------------------------------------------------

export interface NewMemory {
  memoryType: MemoryType
  title: string
  content: string
  occurredAt: number
  subject: Entity | null
  actor: Entity | null
  place: Entity | null
  mentioned: Entity[]
  amount?: number
  tags?: string[]
  sourceType: SourceType
}

/**
 * Save a memory, and let it change the world around it.
 *
 * Three things happen beyond the insert, and all three are what separates a
 * memory system from a notes app:
 *
 *  - the memory is embedded if the model is loaded, so it is immediately
 *    findable by meaning rather than only by the words it happens to contain;
 *  - a `movement` re-parents its subject, because the latest movement *is* the
 *    current location;
 *  - a `loan` records who has it, and a `return` retires that edge.
 *
 * The embedding is best-effort on purpose. A failure to encode must never cost
 * the user their memory — the document is written either way, and an
 * un-embedded memory is still fully searchable by keyword and fully visible on
 * every timeline. Vectors are derived data and can always be rebuilt.
 */
export async function saveMemory(db: TalaDB, input: NewMemory): Promise<string> {
  const { memories } = collections(db)

  const participants = [input.subject, input.actor, input.place, ...input.mentioned].filter(
    (e): e is Entity => !!e,
  )

  // Dedupe while preserving order — subject first is what timelines read.
  const seen = new Set<string>()
  const unique = participants.filter((e) => {
    if (!e._id || seen.has(e._id)) return false
    seen.add(e._id)
    return true
  })

  let embedding: number[] | undefined
  let embeddingModel: string | undefined
  if (isEmbedderReady()) {
    try {
      embedding = await embed(memoryEmbeddingText(input.title, input.content))
      embeddingModel = EMBEDDING_MODEL
    } catch {
      // Deliberately swallowed — see the note above.
    }
  }

  const now = Date.now()
  const id = await memories.insert({
    memoryType: input.memoryType,
    title: input.title,
    content: input.content,
    occurredAt: input.occurredAt,
    entityIds: unique.map((e) => e._id!),
    entityNames: unique.map((e) => e.name),
    ...(input.subject?._id ? { subjectId: input.subject._id } : {}),
    ...(input.actor?._id ? { actorId: input.actor._id } : {}),
    ...(input.place?._id ? { placeId: input.place._id } : {}),
    ...(input.amount !== undefined ? { amount: input.amount, currency: CURRENCY } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    sourceType: input.sourceType,
    // A memory the user reviewed and saved is confirmed by definition — that
    // is exactly what the confirm step is for.
    confidence: 'confirmed',
    ...(embedding ? { embedding, embeddingModel } : {}),
    createdAt: now,
    updatedAt: now,
  })

  await applySideEffects(db, id, input)
  return id
}

async function applySideEffects(db: TalaDB, memoryId: string, input: NewMemory): Promise<void> {
  const { entities, relations } = collections(db)

  if (input.memoryType === 'movement' && input.subject?._id && input.place?._id) {
    await entities.updateOne(
      { _id: input.subject._id } as never,
      { $set: { parentId: input.place._id, updatedAt: Date.now() } },
    )
    await addRelation(db, input.subject._id, input.place._id, 'stored_at', memoryId)
  }

  if (input.memoryType === 'loan' && input.subject?._id && input.actor?._id) {
    await addRelation(db, input.subject._id, input.actor._id, 'borrowed_by', memoryId)
  }

  if (input.memoryType === 'return' && input.subject?._id && input.actor?._id) {
    // The loan event stays in the history; only the live edge goes.
    await relations.deleteMany({
      sourceId: input.subject._id,
      targetId: input.actor._id,
      relationType: 'borrowed_by',
    })
  }

  if (input.memoryType === 'purchase' && input.subject?._id && input.actor?._id) {
    await addRelation(db, input.subject._id, input.actor._id, 'purchased_from', memoryId)
  }

  const servicing: MemoryType[] = ['maintenance', 'repair', 'replacement', 'installation']
  if (servicing.includes(input.memoryType) && input.subject?._id && input.actor?._id) {
    await addRelation(db, input.subject._id, input.actor._id, 'serviced_by', memoryId)
  }
}

export interface MemoryEdit {
  title: string
  content: string
  occurredAt: number
  /** `null` clears the amount. */
  amount: number | null
}

/**
 * Edit a memory's words, date or amount.
 *
 * The kind and the things it names are not editable here, on purpose: those
 * drive side effects (a loan's edge, a move's location), and rewiring them
 * from an edit form would make the history say something nobody recorded.
 *
 * When the text changes, the old vector no longer describes it. With the model
 * loaded the memory is embedded again in the same write; without it the stale
 * vector is removed, so search by meaning can never match words the memory no
 * longer contains. Settings → "Embed remaining memories" puts one back.
 */
export async function updateMemory(db: TalaDB, id: string, edit: MemoryEdit): Promise<void> {
  const { memories } = collections(db)

  const [current] = await memories.aggregate<{ title: string; content: string }>([
    { $match: { _id: id } as never },
    { $project: { _id: 1, title: 1, content: 1 } },
  ])
  if (!current) throw new Error('That memory is no longer on this device.')

  const title = edit.title.trim()
  const content = edit.content.trim()
  if (!title) throw new Error('A memory needs a title.')

  const textChanged = title !== current.title || content !== current.content
  let embedding: number[] | undefined
  if (textChanged && isEmbedderReady()) {
    try {
      embedding = await embed(memoryEmbeddingText(title, content))
    } catch {
      // Same rule as saveMemory: an embedding failure never costs the edit.
    }
  }

  const $set: Record<string, unknown> = {
    title,
    content,
    occurredAt: edit.occurredAt,
    updatedAt: Date.now(),
    ...(edit.amount !== null ? { amount: edit.amount, currency: CURRENCY } : {}),
    ...(embedding ? { embedding, embeddingModel: EMBEDDING_MODEL } : {}),
  }
  const $unset: Record<string, true> = {
    ...(edit.amount === null ? { amount: true, currency: true } : {}),
    ...(textChanged && !embedding ? { embedding: true, embeddingModel: true } : {}),
  }

  await memories.updateOne(
    { _id: id } as never,
    { $set, ...(Object.keys($unset).length ? { $unset } : {}) } as never,
  )
}

/**
 * Delete a memory, and undo what saving it did to the world around it.
 *
 * Loans and locations are read from the history, so most of this happens on
 * its own: delete a return and the loan it closed is open again; delete a move
 * and the move before it is the latest. Two things are stored rather than
 * derived and are put right here — the edges this memory asserted, and a
 * thing's `parentId` when this move was what set it.
 */
export async function deleteMemory(db: TalaDB, id: string): Promise<void> {
  const { memories, relations, entities } = collections(db)

  const [memory] = await memories.aggregate<MemoryRow>([
    { $match: { _id: id } as never },
    { $project: { embedding: 0 } },
  ])
  if (!memory) return

  await relations.deleteMany({ memoryId: id })
  await memories.deleteOne({ _id: id } as never)

  if (memory.memoryType === 'movement' && memory.subjectId && memory.placeId) {
    const subject = await entities.findOne({ _id: memory.subjectId } as never)
    if (subject?.parentId === memory.placeId) {
      const [previous] = await memories.aggregate<MemoryRow>([
        { $match: { subjectId: memory.subjectId, memoryType: 'movement' } as never },
        { $sort: { occurredAt: -1 } },
        { $limit: 1 },
        { $project: { embedding: 0 } },
      ])
      // With no earlier move on record there is nowhere better to point, so
      // the thing stays where this move put it.
      if (previous?.placeId) {
        await entities.updateOne(
          { _id: memory.subjectId } as never,
          { $set: { parentId: previous.placeId, updatedAt: Date.now() } },
        )
        await addRelation(db, memory.subjectId, previous.placeId, 'stored_at', previous._id)
      }
    }
  }

  // Saving a return removed the live "borrowed by" edge. If deleting it leaves
  // the loan open again, the edge comes back with it.
  if (memory.memoryType === 'return' && memory.subjectId && memory.actorId) {
    const reopened = (await openLoans(db)).find(
      (l) => l.memory.subjectId === memory.subjectId && l.memory.actorId === memory.actorId,
    )
    if (reopened) {
      await addRelation(db, memory.subjectId, memory.actorId, 'borrowed_by', reopened.memory._id)
    }
  }
}

/** Idempotent edge insert — the same connection asserted twice stays one edge. */
export async function addRelation(
  db: TalaDB,
  sourceId: string,
  targetId: string,
  relationType: RelationType,
  memoryId?: string,
): Promise<void> {
  const { relations } = collections(db)

  const existing = await relations.findOne({ sourceId, targetId, relationType })
  if (existing) return

  await relations.insert({
    sourceId,
    targetId,
    relationType,
    ...(memoryId ? { memoryId } : {}),
    createdAt: Date.now(),
  })
}

export interface NewEntity {
  entityType: Entity['entityType']
  name: string
  description?: string
  category?: string
  icon?: string
}

/** Create an entity on the fly — capture should never dead-end on a missing thing. */
export async function createEntity(db: TalaDB, input: NewEntity): Promise<Entity> {
  const { entities } = collections(db)

  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  const now = Date.now()
  const doc = {
    entityType: input.entityType,
    slug,
    name: input.name,
    description: input.description ?? '',
    category: input.category ?? '',
    icon: input.icon ?? DEFAULT_ICON[input.entityType],
    searchText: [input.name, input.description, input.category].filter(Boolean).join(' '),
    createdAt: now,
    updatedAt: now,
  }

  const id = await entities.insert(doc)
  return { ...doc, _id: id } as Entity
}

const DEFAULT_ICON: Record<Entity['entityType'], string> = {
  thing: '📦',
  person: '🧑',
  place: '📍',
  organization: '🏢',
  project: '🗂️',
  document: '📄',
}

/**
 * Backfill vectors for memories that have none.
 *
 * Runs when the user turns the semantic tier on after having written memories
 * without it. Batched and cancellable, because on a phone this is the most
 * expensive thing the app ever does and it must not be the reason the UI
 * stutters.
 */
export async function backfillEmbeddings(
  db: TalaDB,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  const { memories } = collections(db)

  const pending = await memories.aggregate<{ _id: string; title: string; content: string }>([
    { $match: { embedding: { $exists: false } } as never },
    { $project: { _id: 1, title: 1, content: 1 } },
  ])

  // A batch is one forward pass in the embedding worker, so the model is busy
  // in bigger, fewer steps and the page in between only applies the writes.
  const BATCH = 16
  let done = 0
  for (let i = 0; i < pending.length; i += BATCH) {
    if (signal?.aborted) break

    const rows = pending.slice(i, i + BATCH)
    const vectors = await embedMany(rows.map((row) => memoryEmbeddingText(row.title, row.content)))
    for (const [j, row] of rows.entries()) {
      await memories.updateOne(
        { _id: row._id } as never,
        { $set: { embedding: vectors[j], embeddingModel: EMBEDDING_MODEL } },
      )
    }

    done += rows.length
    onProgress(done, pending.length)
  }

  return done
}
