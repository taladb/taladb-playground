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
import { openDB, type TalaDB } from 'taladb'
import {
  buildGraphIndex, collections, ensureIndexes, ensureVectorIndex, HNSW_GRAPH, returnToExactIndex,
} from '../lib/schema'
import { rebaseOffset, writeCorpus, type Corpus } from '../lib/corpus'
import {
  benchAnn, benchDocuments, benchExact, buildLabGraph, labCollection, labQueries, populate,
} from '../lib/lab'
import {
  openLoans, spendForEntity, warrantiesExpiring, entityTimelinePipeline, stats, listEntities,
} from '../lib/queries'
import { locateEntity, relatedEntities, contentsOf } from '../lib/graph'
import { classify, resolveEntity } from '../lib/retrieval'
import { extractMemory } from '../lib/extract'
import { exportPack, importPack } from '../lib/memorypack'
import { createEntity, saveMemory } from '../lib/mutations'

const SEED = join(import.meta.dirname ?? '.', '..', 'public', 'seed')
const DB_FILE = join(import.meta.dirname ?? '.', '..', '.verify.db')
const IMPORT_FILE = join(import.meta.dirname ?? '.', '..', '.verify-import.db')
const LAB_FILE = join(import.meta.dirname ?? '.', '..', '.verify-lab.db')

let failures = 0

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function loadCorpus(): Promise<{ corpus: Corpus; vectors: Float32Array }> {
  const corpus = JSON.parse(await readFile(join(SEED, 'corpus.json'), 'utf8')) as Corpus
  const buf = await readFile(join(SEED, 'embeddings.bin'))
  return { corpus, vectors: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4) }
}

/** The same write the browser's first run does, via the same module. */
async function seed(db: TalaDB) {
  const { corpus, vectors } = await loadCorpus()
  await writeCorpus(db, corpus, vectors)
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
  check('embedded count read from the vector index matches a full count',
    counts.embedded === await collections(db).memories.count({ embedding: { $exists: true } } as never))

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

  console.log('\nDemo corpus is anchored to today')
  const [newest] = await collections(db).memories.aggregate<{ occurredAt: number }>([
    { $sort: { occurredAt: -1 } }, { $limit: 1 }, { $project: { occurredAt: 1 } },
  ])
  const newestAgo = Math.floor((Date.now() - newest.occurredAt) / 86_400_000)
  check('newest memory is recent, however old the corpus file is', newestAgo >= 0 && newestAgo <= 7,
    `${newestAgo} days ago`)
  const homeWarranties = await warrantiesExpiring(db, 60)
  check('home screen has a warranty ending within 60 days', homeWarranties.length > 0,
    homeWarranties.map((w) => `${w.entity.name} in ${w.daysLeft}d`).join(', '))
  const washer = await collections(db).entities.findOne({ slug: 'washing-machine' })
  const washerNote = await collections(db).memories.findOne({
    title: 'Washing machine warranty expires this month',
  })
  const washerDate = new Date(washer!.warrantyExpiresAt!)
  const spelled = `${washerDate.getUTCDate()} ${washerDate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${washerDate.getUTCFullYear()}`
  check('dates in prose moved with the date fields', washerNote!.content.includes(spelled),
    `field ${washerDate.toISOString().slice(0, 10)}, text says "${spelled}"`)

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

  console.log('\nSettings: the graph experiment and the cache')
  const built = await buildGraphIndex(db)
  const graph = await collections(db).memories.vectorIndexStatus('embedding')
  check('"Try an HNSW graph" builds one with the app\'s shape',
    built.state === 'ready' && graph.state === 'ready' && graph.options?.m === HNSW_GRAPH.m,
    `${graph.state}, M=${graph.options?.m}, ${graph.indexedVectors} indexed`)
  const viaGraph = await collections(db).memories.searchVectors('embedding', probe!.embedding as number[], 5)
  check('search now walks the graph', viaGraph.execution.path === 'hnsw',
    `path=${viaGraph.execution.path}, distances=${viaGraph.execution.distanceComputations}`)
  const recallReport = await collections(db).memories.measureVectorRecall(
    'embedding', [probe!.embedding as number[]], 10, undefined, { efSearch: 100 })
  check('recall vs exact is measurable on the graph', recallReport.recallAtK > 0,
    `recall@10 ${(recallReport.recallAtK * 100).toFixed(0)}%`)
  const back = await returnToExactIndex(db)
  const afterBack = await collections(db).memories.searchVectors('embedding', probe!.embedding as number[], 5)
  check('"Back to exact index" restores the exact scan',
    back === 'flat' && afterBack.execution.path === 'exact', `path=${afterBack.execution.path}`)

  // Prime the cache with one exact search, then squeeze it.
  const baseline = await collections(db).memories.vectorCacheStats()
  const squeezed = await collections(db).memories.notifyMemoryPressure('critical')
  const recovered = await collections(db).memories.notifyMemoryPressure('normal')
  check('memory pressure shrinks the budget and recovery restores it',
    squeezed.budgetBytes < baseline.budgetBytes && recovered.budgetBytes === baseline.budgetBytes,
    `${baseline.budgetBytes} → ${squeezed.budgetBytes} → ${recovered.budgetBytes} bytes, held ${baseline.retainedBytes} → ${squeezed.retainedBytes}`)

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

  console.log('\nEntity resolution survives a thin, user-created entity')
  // A characterisation test, not a regression guard — and the distinction is
  // worth writing down, because it was checked rather than assumed.
  //
  // Resolution used to accept a candidate on an absolute BM25 score, which is
  // not portable across corpus sizes: the value moves with IDF and average
  // document length, both corpus statistics. That breaks badly in an app that
  // starts empty (the Android build, where the correct subject scored 0.536
  // against a floor of 1.0 and resolved to nothing).
  //
  // It does *not* reproduce here. With 49 seeded entities the scores run 4–6,
  // far above the old floor, so this check passes with or without the fix. The
  // failure the old rule actually had in this corpus was the opposite one —
  // "descaled the appliance" accepted four candidates that the sentence never
  // named, including a person — which the exact-naming rule also narrows.
  //
  // Kept because a user-created entity resolving is worth asserting either way.
  const kettle = await createEntity(db, {
    entityType: 'thing',
    name: 'Hario Kettle',
    category: 'Kettle',
    description: 'Gooseneck pouring kettle',
  })
  const thin = await extractMemory(
    db,
    'Descaled the kettle today for ₱350.',
    new Date('2026-09-14T10:00:00Z'),
  )
  check('resolves an entity named only by its category', thin.subject?.value._id === kettle._id,
    thin.subject ? `${thin.subject.value.name} — ${thin.subject.reason}` : 'no subject resolved')
  check('and the amount still parses alongside it', thin.amount?.value === 350, thin.amount?.reason)

  console.log('\nRe-seeding keeps what the visitor wrote')
  const own = await saveMemory(db, {
    memoryType: 'note', title: 'My own note', content: 'Written by the visitor, not the corpus.',
    occurredAt: Date.now(), subject: bike, actor: null, place: null, mentioned: [],
    sourceType: 'user_entered',
  })
  const before = await collections(db).memories.count()
  const { corpus, vectors } = await loadCorpus()
  await writeCorpus(db, corpus, vectors)
  check('visitor memory survives a re-seed', !!(await collections(db).memories.findOne({ _id: own } as never)))
  check('visitor entity survives a re-seed', !!(await collections(db).entities.findOne({ _id: kettle._id } as never)))
  check('re-seed replaces the corpus rather than duplicating it',
    (await collections(db).memories.count()) === before, `${before} memories before and after`)
  check('rebase offset is whole days', rebaseOffset(corpus) % 86_400_000 === 0)

  console.log('\nExport')
  const pack = await exportPack(db)
  check('pack excludes vectors by default', !pack.memories.some((m) => 'embedding' in m))
  check('pack carries rebuild metadata', pack.embedding.model.includes('MiniLM'),
    `${pack.embedding.model}, ${pack.embedding.dimensions}d`)
  check('pack counts match', pack.counts.memories === await collections(db).memories.count())

  console.log('\nImport')
  await rm(IMPORT_FILE, { force: true, recursive: true }).catch(() => {})
  const fresh = await openDB(IMPORT_FILE)
  const roundTrip = JSON.parse(JSON.stringify(pack))
  const t1 = performance.now()
  const first = await importPack(fresh, roundTrip)
  check('import into an empty device writes everything',
    first.memories === pack.counts.memories && first.entities === pack.counts.entities &&
      first.relations === pack.counts.relations && first.skipped === 0,
    `${first.entities} entities, ${first.memories} memories, ${first.relations} relations in ${(performance.now() - t1).toFixed(0)} ms`)
  const again = await importPack(fresh, roundTrip)
  check('re-importing the same pack skips every row',
    again.entities + again.memories + again.relations === 0 &&
      again.skipped === pack.counts.entities + pack.counts.memories + pack.counts.relations,
    `${again.skipped} skipped`)
  check('re-import reports nothing as invalid', again.invalid === 0)

  // A pack edited by hand: one memory loses its required title.
  const damaged = JSON.parse(JSON.stringify(pack))
  damaged.entities = []
  damaged.relations = []
  damaged.memories = damaged.memories.slice(0, 3).map((m: Record<string, unknown>, i: number) =>
    i === 1 ? { ...m, _id: undefined, title: '' } : { ...m, _id: undefined })
  const partial = await importPack(fresh, damaged)
  check('a damaged row is reported as invalid, not as already here',
    partial.memories === 2 && partial.invalid === 1 && partial.skipped === 0,
    `${partial.memories} written, ${partial.invalid} invalid, ${partial.skipped} skipped`)
  await fresh.close()
  await rm(IMPORT_FILE, { force: true, recursive: true }).catch(() => {})

  console.log('\nScale lab (the /lab page, at 2,000)')
  await rm(LAB_FILE, { force: true, recursive: true }).catch(() => {})
  const lab = await openDB(LAB_FILE)
  await populate(lab, 2_000)
  check('lab writes into its own database', (await labCollection(lab).count()) === 2_000 &&
    (await collections(db).memories.count()) < 1_000)
  const labDocs = await benchDocuments(lab, 3)
  check('lab document benchmarks run', labDocs.monthRangeRows > 0,
    `oldest page ${labDocs.oldestPageMs.toFixed(2)} ms, ${labDocs.monthRangeRows} rows in a month`)
  const labQ = labQueries(5)
  const labExact = await benchExact(lab, labQ)
  check('lab exact scan compares every vector', labExact.distances === 2_000)
  await buildLabGraph(lab, { quantization: 'binary' })
  const labAnn = await benchAnn(lab, labQ, 40)
  check('lab graph search runs on the graph and reports its recall',
    labAnn.path === 'hnsw' && labAnn.recallAt10 !== null && labAnn.distances < 2_000,
    `ef ${labAnn.efSearch}, ${labAnn.distances} distances, recall@10 ${((labAnn.recallAt10 ?? 0) * 100).toFixed(0)}%`)
  await lab.close()
  await rm(LAB_FILE, { force: true, recursive: true }).catch(() => {})

  await db.close()
  await rm(DB_FILE, { force: true, recursive: true }).catch(() => {})

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
