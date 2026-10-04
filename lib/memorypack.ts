import type { TalaDB } from 'taladb'
import { collections, SEED_VERSION, VECTOR_DIM, EMBEDDING_MODEL } from './schema'
import type { Attachment, Entity, Memory, Relation } from './types'

// ---------------------------------------------------------------------------
// Export and import.
//
// The spec asks for one thing above all here: the application must never make
// the user's own data inaccessible. So the export is plain JSON with no
// proprietary container, no key required to read it, and no part of it that
// only this app can interpret.
//
// Embeddings are excluded by default and that is deliberate. They are derived
// data — regenerable from the text with the model named in the manifest — and
// including them would multiply the file size by roughly twenty for information
// the file already contains.
// ---------------------------------------------------------------------------

export const PACK_FORMAT = 'keepsake.memorypack'
export const PACK_VERSION = 1

export interface MemoryPack {
  format: typeof PACK_FORMAT
  version: number
  exportedAt: string
  /** Everything needed to rebuild the vectors this export left out. */
  embedding: { model: string; dimensions: number; included: boolean }
  seedVersion: number
  counts: Record<string, number>
  entities: Entity[]
  memories: Memory[]
  relations: Relation[]
  attachments: Attachment[]
}

export async function exportPack(
  db: TalaDB,
  opts: { includeEmbeddings?: boolean } = {},
): Promise<MemoryPack> {
  const { entities, memories, relations, attachments } = collections(db)

  const [entityRows, memoryRows, relationRows, attachmentRows] = await Promise.all([
    entities.find(),
    opts.includeEmbeddings
      ? memories.find()
      : memories.aggregate<Memory>([{ $project: { embedding: 0, embeddingModel: 0 } }]),
    relations.find(),
    attachments.find(),
  ])

  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    exportedAt: new Date().toISOString(),
    embedding: {
      model: EMBEDDING_MODEL,
      dimensions: VECTOR_DIM,
      included: !!opts.includeEmbeddings,
    },
    seedVersion: SEED_VERSION,
    counts: {
      entities: entityRows.length,
      memories: memoryRows.length,
      relations: relationRows.length,
      attachments: attachmentRows.length,
    },
    entities: entityRows,
    memories: memoryRows,
    relations: relationRows,
    attachments: attachmentRows,
  }
}

/** Hand the pack to the browser as a file. */
export function downloadPack(pack: MemoryPack): void {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `keepsake-${new Date().toISOString().slice(0, 10)}.memorypack.json`
  link.click()

  URL.revokeObjectURL(url)
}

export interface ImportReport {
  entities: number
  memories: number
  relations: number
  attachments: number
  skipped: number
}

/**
 * Merge a pack into this device.
 *
 * Documents keep their original `_id`, so re-importing the same pack is a no-op
 * rather than a duplication — the engine refuses an id that already exists.
 * That makes import safe to retry and safe to run against a database that
 * already holds some of the same memories.
 */
export async function importPack(db: TalaDB, pack: unknown): Promise<ImportReport> {
  if (!isPack(pack)) {
    throw new Error('That file is not a Keepsake memory pack.')
  }
  if (pack.version > PACK_VERSION) {
    throw new Error(
      `This pack was written by a newer version (format ${pack.version}, this build reads ${PACK_VERSION}).`,
    )
  }

  const { entities, memories, relations, attachments } = collections(db)
  const report: ImportReport = { entities: 0, memories: 0, relations: 0, attachments: 0, skipped: 0 }

  // In chunks, because every write is its own durable commit: one insert per
  // row took 4.1 s for the 422 documents of the seeded corpus. `insertMany` is
  // all-or-nothing, so a chunk that hits an id already on this device writes
  // nothing — and only that chunk is retried row by row, skipping the
  // duplicates. A fresh import never pays for the fallback; a re-import pays
  // only for rows that fail fast.
  for (const [rows, col, key] of [
    [pack.entities, entities, 'entities'],
    [pack.memories, memories, 'memories'],
    [pack.relations, relations, 'relations'],
    [pack.attachments, attachments, 'attachments'],
  ] as const) {
    const writer = col as unknown as {
      insert: (doc: never) => Promise<string>
      insertMany: (docs: never[]) => Promise<string[]>
    }
    const all = (rows ?? []) as Array<Record<string, unknown>>

    for (let i = 0; i < all.length; i += IMPORT_CHUNK) {
      const chunk = all.slice(i, i + IMPORT_CHUNK)
      try {
        await writer.insertMany(chunk as never[])
        report[key as keyof ImportReport] += chunk.length
        continue
      } catch {
        // Fall through to one at a time for this chunk only.
      }
      for (const row of chunk) {
        try {
          await writer.insert(row as never)
          report[key as keyof ImportReport]++
        } catch {
          report.skipped++
        }
      }
    }
  }

  return report
}

const IMPORT_CHUNK = 100

function isPack(value: unknown): value is MemoryPack {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as MemoryPack).format === PACK_FORMAT &&
    Array.isArray((value as MemoryPack).entities) &&
    Array.isArray((value as MemoryPack).memories)
  )
}
