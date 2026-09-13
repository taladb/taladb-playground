/**
 * Offline seed generator.
 *
 *   public/seed/corpus.json     entities, memories and relations (no vectors)
 *   public/seed/embeddings.bin  Float32 [memories × 384], row-major, same order
 *
 *   bun run seed                    full run; downloads the model, embeds everything
 *   bun run seed --no-embeddings    metadata only — fast, for iterating on content
 *
 * Embeddings are precomputed rather than built in the browser on first run for
 * one reason: a visitor should be able to type a semantic query into /recall in
 * the first ten seconds without waiting on a 25 MB model download. The model is
 * still downloaded later, on demand, when they write a memory of their own and
 * it has to be embedded on-device — which is the pipeline the product actually
 * uses. This file just means the demo does not open on a loading bar.
 *
 * The model here and the model in lib/embed.ts must stay identical. Two
 * different encoders put their vectors in unrelated coordinate systems, and the
 * failure is silent: no error, just similarity scores that mean nothing.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ALL_ENTITIES, type SeedEntity } from './seed/entities'
import { MEMORIES, type SeedMemory } from './seed/memories'
import { ROUTINE } from './seed/routine'

const MODEL = 'Xenova/all-MiniLM-L6-v2'
const DIMS = 384
const OUT_DIR = join(import.meta.dirname ?? '.', '..', 'public', 'seed')

type RelationType =
  | 'owns' | 'stored_at' | 'located_in' | 'purchased_from'
  | 'serviced_by' | 'borrowed_by' | 'part_of' | 'related_to'

interface OutEntity extends Omit<SeedEntity, 'purchasedAt' | 'warrantyExpiresAt'> {
  purchasedAt?: number
  warrantyExpiresAt?: number
  searchText: string
}

interface OutMemory {
  memoryType: SeedMemory['memoryType']
  title: string
  content: string
  occurredAt: number
  entitySlugs: string[]
  subjectSlug?: string
  actorSlug?: string
  placeSlug?: string
  amount?: number
  tags?: string[]
  sourceType: string
  confidence: string
}

interface OutRelation {
  sourceSlug: string
  targetSlug: string
  relationType: RelationType
}

function ts(iso: string): number {
  return Date.parse(`${iso}T09:00:00Z`)
}

/**
 * Everything about an entity worth matching a keyword against, flattened into
 * one string. The FTS index is per-field, so without this a search for a serial
 * number would need its own index and a search for an attribute value would be
 * unreachable entirely.
 */
function entitySearchText(e: SeedEntity): string {
  return [
    e.name,
    e.description,
    e.category,
    e.manufacturer,
    e.model,
    e.serialNumber,
    e.condition,
    ...(e.tags ?? []),
    ...Object.entries(e.attributes ?? {}).flatMap(([k, v]) => [k, v]),
  ]
    .filter(Boolean)
    .join(' ')
}

function buildEntities(): OutEntity[] {
  return ALL_ENTITIES.map((e) => {
    const { purchasedAt, warrantyExpiresAt, ...rest } = e
    return {
      ...rest,
      ...(purchasedAt ? { purchasedAt: ts(purchasedAt) } : {}),
      ...(warrantyExpiresAt ? { warrantyExpiresAt: ts(warrantyExpiresAt) } : {}),
      searchText: entitySearchText(e),
    }
  })
}

function buildMemories(): OutMemory[] {
  const all = [...MEMORIES, ...ROUTINE].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))

  return all.map((m) => {
    // Deduped union of every entity the memory touches. This is what becomes
    // `entityIds` on the document, and what makes an entity's timeline a single
    // indexed array-membership lookup instead of a fan-out over three fields.
    const slugs = new Set<string>()
    for (const s of [m.subjectSlug, m.actorSlug, m.placeSlug, ...(m.alsoSlugs ?? [])]) {
      if (s) slugs.add(s)
    }

    return {
      memoryType: m.memoryType,
      title: m.title,
      content: m.content,
      occurredAt: ts(m.occurredAt),
      entitySlugs: [...slugs],
      ...(m.subjectSlug ? { subjectSlug: m.subjectSlug } : {}),
      ...(m.actorSlug ? { actorSlug: m.actorSlug } : {}),
      ...(m.placeSlug ? { placeSlug: m.placeSlug } : {}),
      ...(m.amount !== undefined ? { amount: m.amount } : {}),
      ...(m.tags ? { tags: m.tags } : {}),
      sourceType: m.sourceType ?? 'user_entered',
      confidence: m.confidence ?? 'confirmed',
    }
  })
}

/**
 * Relations are derived, not authored — an edge that contradicts the memory it
 * came from is a bug waiting to happen, so there is only one source of truth.
 */
function buildRelations(entities: OutEntity[], memories: OutMemory[]): OutRelation[] {
  const bySlug = new Map(entities.map((e) => [e.slug, e]))
  const seen = new Set<string>()
  const rels: OutRelation[] = []

  const add = (sourceSlug: string, targetSlug: string, relationType: RelationType) => {
    const key = `${sourceSlug}|${targetSlug}|${relationType}`
    if (seen.has(key) || sourceSlug === targetSlug) return
    seen.add(key)
    rels.push({ sourceSlug, targetSlug, relationType })
  }

  // Containment: a place inside a place is `located_in`; anything else sitting
  // in a place is `stored_at`. The distinction is what lets the location walk
  // stop at the right level when answering "where is my drill?".
  for (const e of entities) {
    if (!e.parentSlug) continue
    add(e.slug, e.parentSlug, e.entityType === 'place' ? 'located_in' : 'stored_at')
  }

  for (const m of memories) {
    const subject = m.subjectSlug
    if (!subject) continue

    for (const slug of m.entitySlugs) {
      const other = bySlug.get(slug)
      if (!other || slug === subject) continue

      if (other.entityType === 'organization') {
        if (m.memoryType === 'purchase') add(subject, slug, 'purchased_from')
        else if (['maintenance', 'repair', 'replacement', 'installation'].includes(m.memoryType)) {
          add(subject, slug, 'serviced_by')
        }
      }
      if (other.entityType === 'project') add(subject, slug, 'part_of')
    }

    if (m.memoryType === 'loan' && m.actorSlug) add(subject, m.actorSlug, 'borrowed_by')
  }

  return rels
}

async function embedAll(texts: string[]): Promise<Float32Array> {
  const { pipeline } = await import('@huggingface/transformers')
  const extractor = await pipeline('feature-extraction', MODEL)

  const out = new Float32Array(texts.length * DIMS)
  const BATCH = 32

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const result = await extractor(batch, { pooling: 'mean', normalize: true })
    const data = result.data as Float32Array
    out.set(data.subarray(0, batch.length * DIMS), i * DIMS)
    process.stdout.write(`\r  embedded ${Math.min(i + BATCH, texts.length)}/${texts.length}`)
  }
  process.stdout.write('\n')

  return out
}

async function main() {
  const withEmbeddings = !process.argv.includes('--no-embeddings')

  const entities = buildEntities()
  const memories = buildMemories()
  const relations = buildRelations(entities, memories)

  console.log(`entities:  ${entities.length}`)
  console.log(`memories:  ${memories.length}`)
  console.log(`relations: ${relations.length}`)

  await mkdir(OUT_DIR, { recursive: true })

  await writeFile(
    join(OUT_DIR, 'corpus.json'),
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        embeddingModel: MODEL,
        dims: DIMS,
        entities,
        memories,
        relations,
      },
      null,
      0,
    ),
  )
  console.log(`wrote ${join(OUT_DIR, 'corpus.json')}`)

  if (!withEmbeddings) {
    console.log('skipped embeddings (--no-embeddings)')
    return
  }

  // Title and body together. The title carries the classification ("Chain
  // replaced") and the body carries the detail; embedding the body alone loses
  // the short, high-signal phrase that a query most often resembles.
  console.log(`embedding ${memories.length} memories with ${MODEL}…`)
  const vectors = await embedAll(memories.map((m) => `${m.title}. ${m.content}`))

  await writeFile(join(OUT_DIR, 'embeddings.bin'), Buffer.from(vectors.buffer))
  console.log(
    `wrote ${join(OUT_DIR, 'embeddings.bin')} (${(vectors.byteLength / 1024 / 1024).toFixed(2)} MB)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
