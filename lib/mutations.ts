import type { TalaDB } from 'taladb'
import { collections } from './schema'
import { embed, isEmbedderReady, memoryEmbeddingText } from './embed'
import type { Entity, MemoryType, RelationType, SourceType } from './types'

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
      embeddingModel = 'Xenova/all-MiniLM-L6-v2'
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
    ...(input.amount !== undefined ? { amount: input.amount, currency: 'PHP' } : {}),
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

  let done = 0
  for (const row of pending) {
    if (signal?.aborted) break

    const vector = await embed(memoryEmbeddingText(row.title, row.content))
    await memories.updateOne(
      { _id: row._id } as never,
      { $set: { embedding: vector, embeddingModel: 'Xenova/all-MiniLM-L6-v2' } },
    )

    done++
    onProgress(done, pending.length)
    // Yield between documents so the main thread stays responsive.
    await new Promise((r) => setTimeout(r))
  }

  return done
}
