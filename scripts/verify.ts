/**
 * End-to-end verification against the real engine.
 *
 * The app runs its database in the browser, which makes the data path awkward
 * to test — but every module under lib/ takes a `TalaDB` handle and knows
 * nothing about which binding produced it, so the identical code can be driven
 * against `@taladb/node` here. This seeds the shipped corpus, builds the same
 * indexes the browser builds, and then exercises the actual query, graph and
 * retrieval functions the pages call.
 *
 *   bun run verify
 */
import { readFile } from 'node:fs/promises'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { openDB, deriveDocId, type TalaDB } from 'taladb'
import { collections, ensureIndexes, ensureVectorIndex, VECTOR_DIM } from '../lib/schema'
import {
  openLoans, spendForEntity, warrantiesExpiring, entityTimelinePipeline, stats, listEntities,
} from '../lib/queries'
import { locateEntity, relatedEntities, contentsOf } from '../lib/graph'
import { classify, resolveEntity } from '../lib/retrieval'
import { extractMemory } from '../lib/extract'
import { exportPack } from '../lib/memorypack'

const SEED = join(import.meta.dirname ?? '.', '..', 'public', 'seed')
const DB_FILE = join(import.meta.dirname ?? '.', '..', '.verify.db')

let failures = 0

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function seed(db: TalaDB) {
  const corpus = JSON.parse(await readFile(join(SEED, 'corpus.json'), 'utf8'))
  const buf = await readFile(join(SEED, 'embeddings.bin'))
  const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)

  const { entities, memories, relations } = collections(db)
  const entityId = (slug: string) => deriveDocId('entities', slug)

  await entities.insertMany(
    corpus.entities.map(({ parentSlug, ...e }: Record<string, unknown> & { parentSlug?: string }) => ({
      ...e,
      _id: entityId(e.slug as string),
      ...(parentSlug ? { parentId: entityId(parentSlug) } : {}),
      createdAt: (e.purchasedAt as number) ?? Date.now(),
      updatedAt: Date.now(),
    })),
  )

  const nameBySlug = new Map<string, string>(
    corpus.entities.map((e: { slug: string; name: string }) => [e.slug, e.name]),
  )

  await memories.insertMany(
    corpus.memories.map((m: Record<string, unknown>, i: number) => ({
      _id: deriveDocId('memories', `${m.occurredAt}-${m.title}-${i}`),
      memoryType: m.memoryType,
      title: m.title,
      content: m.content,
      occurredAt: m.occurredAt,
      entityIds: (m.entitySlugs as string[]).map(entityId),
      entityNames: (m.entitySlugs as string[]).map((s) => nameBySlug.get(s) ?? s),
      ...(m.subjectSlug ? { subjectId: entityId(m.subjectSlug as string) } : {}),
      ...(m.actorSlug ? { actorId: entityId(m.actorSlug as string) } : {}),
      ...(m.placeSlug ? { placeId: entityId(m.placeSlug as string) } : {}),
      ...(m.amount !== undefined ? { amount: m.amount, currency: 'PHP' } : {}),
      ...(m.tags ? { tags: m.tags } : {}),
      sourceType: m.sourceType,
      confidence: m.confidence,
      embedding: Array.from(vectors.subarray(i * VECTOR_DIM, (i + 1) * VECTOR_DIM)),
      embeddingModel: corpus.embeddingModel,
      createdAt: m.occurredAt,
      updatedAt: m.occurredAt,
    })),
  )

  await relations.insertMany(
    corpus.relations.map((r: { sourceSlug: string; targetSlug: string; relationType: string }) => ({
      _id: deriveDocId('relations', `${r.sourceSlug}|${r.targetSlug}|${r.relationType}`),
      sourceId: entityId(r.sourceSlug),
      targetId: entityId(r.targetSlug),
      relationType: r.relationType,
      createdAt: Date.now(),
    })),
  )
}

async function main() {
  await rm(DB_FILE, { force: true, recursive: true }).catch(() => {})
  const db = await openDB(DB_FILE)

  console.log('\nSeeding + indexing')
  const t0 = performance.now()
  await seed(db)
  await ensureIndexes(db)
  const indexType = await ensureVectorIndex(db)
  check('seeded and indexed', true, `${(performance.now() - t0).toFixed(0)} ms, vector index: ${indexType}`)
  check('index type suits the corpus size', indexType === 'flat',
    'a few hundred memories scan faster than a graph traverses')

  const counts = await stats(db)
  check('corpus counts', counts.memoryCount > 300 && counts.entityCount > 40,
    `${counts.entityCount} entities, ${counts.memoryCount} memories, ${counts.embedded} embedded`)

  const bike = await collections(db).entities.findOne({ slug: 'trek-fx3' })
  const drill = await collections(db).entities.findOne({ slug: 'power-drill' })
  const camera = await collections(db).entities.findOne({ slug: 'sony-a6400' })

  console.log('\nDocument engine')
  const timeline = await collections(db).memories.aggregate(entityTimelinePipeline(bike!._id!))
  check('entity timeline (array-membership index)', timeline.length > 20, `${timeline.length} memories on the bike`)
  check('timeline projects the vector away', !('embedding' in (timeline[0] ?? {})))

  const spend = await spendForEntity(db, bike!._id!)
  check('spend aggregation', spend.total > 0, `₱${spend.total.toLocaleString()} over ${spend.n} entries`)

  const things = await listEntities(db, { entityType: 'thing' })
  check('compound-index browse', things.length > 15, `${things.length} things`)

  const warranties = await warrantiesExpiring(db, 400)
  check('warranty range scan', warranties.length > 0,
    warranties.map((w) => `${w.entity.name} in ${w.daysLeft}d`).join(', '))

  console.log('\nLoans (set difference, append-only)')
  const loans = await openLoans(db)
  check('open loans found', loans.length >= 2,
    loans.map((l) => `${l.entity?.name} → ${l.borrower?.name}`).join(', '))
  check('returned items are closed', !loans.some((l) => l.entity?.slug === 'power-drill'),
    'drill was returned, so it is not listed')
  check('camera still out', loans.some((l) => l.entity?._id === camera!._id))

  console.log('\nGraph engine')
  const location = await locateEntity(db, drill!._id!)
  check('location walk follows the latest movement',
    location?.path.map((p) => p.name).join(' → ') === 'Home → Garage → Tool Cabinet → Shelf B',
    location?.path.map((p) => p.name).join(' → '))
  check('location cites the memory that moved it', !!location?.via, location?.via?.title)

  const related = await relatedEntities(db, bike!._id!)
  check('related entities', related.length > 0,
    related.map((g) => `${g.relationType}(${g.entities.length})`).join(' '))

  const inside = await contentsOf(db, (await collections(db).entities.findOne({ slug: 'garage' }))!._id!)
  check('containment listing', inside.length > 0, inside.map((e) => e.name).join(', '))

  console.log('\nFull-text engine (BM25)')
  const byModel = await collections(db).entities.searchText('searchText', 'RT38K5930S8', 3)
  check('serial/model lookup', byModel[0]?.document.slug === 'refrigerator',
    `top hit: ${byModel[0]?.document.name} (${byModel[0]?.score.toFixed(2)})`)

  const bm25 = await collections(db).memories.searchText('content', 'derailleur hanger', 3)
  check('BM25 ranking', bm25.length > 0, `top: ${bm25[0]?.document.title}`)

  console.log('\nVector engine')
  const probe = await collections(db).memories.findOne({ title: 'Rattle from the back when climbing' })
  const nearest = await collections(db).memories.findNearest('embedding', probe!.embedding as number[], 3)
  check('findNearest returns self first', nearest[0]?.document._id === probe!._id,
    `score ${nearest[0]?.score.toFixed(3)}`)

  const vstatus = await collections(db).memories.vectorIndexStatus('embedding')
  // At this corpus size `ensureVectorIndex` picks the exact index on purpose,
  // so there is no graph to populate — `indexedVectors` is 0 and that is right.
  check('vector index covers every memory', vstatus.totalVectors === counts.memoryCount,
    `${vstatus.state}, ${vstatus.totalVectors} vectors, persistent=${vstatus.persistent}`)

  const exec = await collections(db).memories.searchVectors('embedding', probe!.embedding as number[], 5)
  // One distance per stored vector is what makes the result exact rather than
  // approximate: nothing was skipped, so nothing can have been missed.
  check('search is exhaustive, so results are exact',
    exec.execution.path === 'exact' && exec.execution.distanceComputations === vstatus.totalVectors,
    `path=${exec.execution.path}, distances=${exec.execution.distanceComputations}`)

  console.log('\nHybrid (RRF fusion)')
  const hybrid = await collections(db).memories.hybridSearch(
    { textField: 'content', text: 'chain replacement' },
    { vectorField: 'embedding', vector: probe!.embedding as number[] },
    5,
  )
  check('hybrid returns fused hits', hybrid.length > 0, `${hybrid.length} hits`)
  check('per-retriever ranks are reported',
    hybrid.some((h) => h.textRank !== null) && hybrid.some((h) => h.vectorRank !== null),
    hybrid.map((h) => `kw${h.textRank ?? '-'}/vec${h.vectorRank ?? '-'}`).join(' '))
  check('fusion surfaces vector-only hits',
    hybrid.some((h) => h.textRank === null && h.vectorRank !== null),
    'at least one document keyword search never returned')

  console.log('\nQuery classification')
  for (const [q, expected] of [
    ['who has my camera?', 'loans'],
    ['where is my drill?', 'location'],
    ['how much have I spent on the bike?', 'spend'],
    ['when does the warranty expire?', 'warranty'],
    ['why did I choose the Samsung?', 'decision'],
    ['when was the aircon last serviced?', 'last_event'],
    ['tell me about the guitar', 'open'],
  ] as const) {
    check(`classify: "${q}"`, classify(q) === expected, `→ ${classify(q)}`)
  }

  const resolved = await resolveEntity(db, 'when did I last replace the bicycle chain?')
  check('entity resolution from a question', resolved?.slug === 'trek-fx3', resolved?.name)

  console.log('\nCapture extraction')
  const proposal = await extractMemory(
    db,
    'Changed the bicycle chain today at CycleHouse for ₱1,200.',
    new Date('2026-09-13T10:00:00Z'),
  )
  check('classified the event', proposal.memoryType.value === 'replacement', proposal.memoryType.reason)
  check('parsed the date', new Date(proposal.occurredAt.value).toISOString().slice(0, 10) === '2026-09-13',
    proposal.occurredAt.reason)
  check('parsed the amount', proposal.amount?.value === 1200, proposal.amount?.reason)
  check('resolved the subject', proposal.subject?.value.slug === 'trek-fx3', proposal.subject?.value.name)
  check('resolved the provider', proposal.actor?.value.slug === 'cyclehouse', proposal.actor?.value.name)

  const moved = await extractMemory(db, 'Moved the passport to the bedroom safe yesterday.',
    new Date('2026-09-13T10:00:00Z'))
  check('movement extraction', moved.memoryType.value === 'movement', moved.memoryType.reason)
  check('movement resolves the place', moved.place?.value.slug === 'bedroom-safe', moved.place?.value.name)

  console.log('\nExport')
  const pack = await exportPack(db)
  check('pack excludes vectors by default', !pack.memories.some((m) => 'embedding' in m))
  check('pack carries rebuild metadata', pack.embedding.model.includes('MiniLM'),
    `${pack.embedding.model}, ${pack.embedding.dimensions}d`)
  check('pack counts match', pack.counts.memories === counts.memoryCount)

  await db.close()
  await rm(DB_FILE, { force: true, recursive: true }).catch(() => {})

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
