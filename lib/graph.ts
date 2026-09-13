import type { TalaDB } from 'taladb'
import { collections } from './schema'
import { entitiesByIds } from './queries'
import type { Entity, MemoryRow, Relation, RelationType } from './types'

// ---------------------------------------------------------------------------
// The graph half.
//
// The spec is explicit that a separate graph database is unnecessary for V1,
// and it is right: a personal corpus has tens of thousands of edges, and every
// traversal the product needs is a handful of hops from a known starting point.
// The `relations` collection with indexes on both endpoints covers all of it.
//
// Users never see the word "graph". They see "Home → Garage → Cabinet → Shelf B".
// ---------------------------------------------------------------------------

/** Guard against a cycle introduced by bad data — a container inside itself. */
const MAX_DEPTH = 12

export interface Location {
  /** Innermost container first is confusing to read, so this is outermost-first:
   *  `[Home, Garage, Tool Cabinet, Shelf B]`. */
  path: Entity[]
  /** The memory that put it there, when a `movement` is what decided it. */
  via: MemoryRow | null
}

/**
 * Where something is now, and how we know.
 *
 * Two sources, and the order matters. An entity's `parentId` is where it
 * *lives* — the answer when nothing has ever moved it. A `movement` memory is
 * where it *went*, and the most recent one wins, because the whole point of an
 * append-only history is that the latest event is the current state.
 *
 * Returning the deciding memory alongside the path is what lets the UI cite
 * evidence instead of just asserting a shelf.
 */
export async function locateEntity(db: TalaDB, entityId: string): Promise<Location | null> {
  const { memories, entities } = collections(db)

  const entity = await entities.findOne({ _id: entityId } as never)
  if (!entity) return null

  // Most recent movement of this entity, if any.
  const [move] = await memories.aggregate<MemoryRow>([
    { $match: { subjectId: entityId, memoryType: 'movement' } as never },
    { $sort: { occurredAt: -1 } },
    { $limit: 1 },
    { $project: { embedding: 0 } },
  ])

  const startId = move?.placeId ?? entity.parentId
  if (!startId) return { path: [], via: null }

  const path = await containerChain(db, startId)
  return { path, via: move?.placeId ? move : null }
}

/**
 * Walk containment upward from a place and return it outermost-first.
 *
 * Recursive traversal, one indexed `_id` lookup per level. Materialising a path
 * string on each entity would make this a single read, but then moving the tool
 * cabinet would mean rewriting every descendant — the classic trade, and at
 * four levels deep the reads are free.
 */
export async function containerChain(db: TalaDB, startId: string): Promise<Entity[]> {
  const { entities } = collections(db)
  const chain: Entity[] = []
  const seen = new Set<string>()

  let currentId: string | undefined = startId
  for (let depth = 0; currentId && depth < MAX_DEPTH; depth++) {
    if (seen.has(currentId)) break // cycle
    seen.add(currentId)

    const node: Entity | null = await entities.findOne({ _id: currentId } as never)
    if (!node) break

    chain.push(node)
    currentId = node.parentId
  }

  return chain.reverse()
}

/** What is kept inside a place (or belongs to a collection). */
export async function contentsOf(db: TalaDB, entityId: string): Promise<Entity[]> {
  const rows = await collections(db).entities.find({ parentId: entityId } as never)
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export interface RelatedGroup {
  relationType: RelationType
  /** True when this entity is the target rather than the source, so the UI can
   *  render "serviced" vs "services". */
  inbound: boolean
  entities: Entity[]
}

const RELATION_LABEL: Record<RelationType, { out: string; in: string }> = {
  owns: { out: 'Owns', in: 'Owned by' },
  stored_at: { out: 'Kept at', in: 'Holds' },
  located_in: { out: 'Inside', in: 'Contains' },
  purchased_from: { out: 'Bought from', in: 'Sold' },
  serviced_by: { out: 'Serviced by', in: 'Services' },
  borrowed_by: { out: 'Lent to', in: 'Has borrowed' },
  part_of: { out: 'Part of', in: 'Includes' },
  related_to: { out: 'Related to', in: 'Related to' },
}

export function relationLabel(type: RelationType, inbound: boolean): string {
  return inbound ? RELATION_LABEL[type].in : RELATION_LABEL[type].out
}

/**
 * One hop out in both directions, grouped by edge type.
 *
 * Both endpoints are indexed, so this is two index scans regardless of how many
 * edges exist in total.
 */
export async function relatedEntities(db: TalaDB, entityId: string): Promise<RelatedGroup[]> {
  const { relations } = collections(db)

  const [outbound, inbound] = await Promise.all([
    relations.find({ sourceId: entityId }),
    relations.find({ targetId: entityId }),
  ])

  const ids = [
    ...new Set([...outbound.map((r) => r.targetId), ...inbound.map((r) => r.sourceId)]),
  ].filter((id) => id !== entityId)

  const byId = await entitiesByIds(db, ids)

  const groups = new Map<string, RelatedGroup>()
  const push = (rel: Relation, otherId: string, isInbound: boolean) => {
    const other = byId.get(otherId)
    if (!other) return
    const key = `${rel.relationType}|${isInbound}`
    let group = groups.get(key)
    if (!group) {
      group = { relationType: rel.relationType, inbound: isInbound, entities: [] }
      groups.set(key, group)
    }
    if (!group.entities.some((e) => e._id === other._id)) group.entities.push(other)
  }

  for (const rel of outbound) push(rel, rel.targetId, false)
  for (const rel of inbound) push(rel, rel.sourceId, true)

  return [...groups.values()].sort((a, b) => a.relationType.localeCompare(b.relationType))
}

/**
 * Everything reachable within `depth` hops, for the "show everything related to
 * the Cebu trip" case. Breadth-first so the nearest connections come first.
 */
export async function neighbourhood(
  db: TalaDB,
  entityId: string,
  depth = 2,
): Promise<Entity[]> {
  const { relations } = collections(db)
  const seen = new Set<string>([entityId])
  let frontier = [entityId]

  for (let d = 0; d < depth && frontier.length; d++) {
    const [outbound, inbound] = await Promise.all([
      relations.find({ sourceId: { $in: frontier } } as never),
      relations.find({ targetId: { $in: frontier } } as never),
    ])

    const next: string[] = []
    for (const id of [...outbound.map((r) => r.targetId), ...inbound.map((r) => r.sourceId)]) {
      if (!seen.has(id)) {
        seen.add(id)
        next.push(id)
      }
    }
    frontier = next
  }

  seen.delete(entityId)
  const byId = await entitiesByIds(db, [...seen])
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}
