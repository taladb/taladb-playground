import type { TalaDB } from 'taladb'
import { collections } from './schema'
import { embed, isEmbedderReady } from './embed'
import {
  entitiesByIds, openLoans, spendForEntity, warrantiesExpiring, warrantiesExpired,
} from './queries'
import { locateEntity } from './graph'
import { namesEntity } from './extract'
import type { Entity, MemoryRow, MemoryType } from './types'

// ---------------------------------------------------------------------------
// Retrieval.
//
// The pipeline runs in this order, and the order is the whole argument:
//
//     query → classify → structured → keyword → vector → graph → answer
//
// A question with an exact answer gets the exact answer. "How much have I spent
// on the bike this year" is a `$sum`; "who has my camera" is a set difference
// over two indexed reads; "when does the warranty expire" is a stored date.
// Ranking is what happens when the question does not have a computable answer —
// and then it is hybrid, because keyword and vector fail differently.
//
// Every result carries which engine produced it, so the UI can show its work
// rather than asking to be trusted.
// ---------------------------------------------------------------------------

export type Engine = 'structured' | 'keyword' | 'vector' | 'hybrid' | 'graph'

export type Intent =
  | 'loans' | 'location' | 'spend' | 'warranty' | 'last_event' | 'decision' | 'open'

export interface Evidence {
  memory: MemoryRow
  score: number
  /** Position in the BM25 ranking, or null if keyword search didn't find it. */
  textRank: number | null
  /** Position in the vector ranking, or null if similarity search didn't find it. */
  vectorRank: number | null
}

export interface Answer {
  headline: string
  lines: string[]
  entity: Entity | null
  engine: Engine
  /** Plain-language account of how this was worked out. Shown in the UI. */
  method: string
}

export interface RecallResult {
  query: string
  intent: Intent
  answer: Answer | null
  evidence: Evidence[]
  /** Which engines contributed, in the order they ran. */
  engines: Engine[]
  semanticUsed: boolean
  timings: { totalMs: number; structuredMs: number; retrievalMs: number }
  /** Vector execution detail, when the vector engine ran. */
  execution: { path: string; reason: string; distanceComputations: number; efSearch: number | null } | null
}

// --- classification ---------------------------------------------------------

const PATTERNS: Array<[Intent, RegExp]> = [
  ['loans', /\b(lent|loaned|lend|borrow(ed|ing)?|who has|out on loan|not returned)\b/i],
  ['location', /\b(where('?s| is| are| did)?|which (shelf|box|drawer|room)|stored|kept|put)\b/i],
  ['spend', /\b(how much|spent|spend|cost(s|ing)?|total|budget|paid)\b/i],
  ['warranty', /\b(warrant(y|ies)|guarantee|expir(e|es|ing|ation)|covered|applecare)\b/i],
  ['decision', /\b(why did i|why do i|reason(s)? (i|for)|instead of|chose|choose|decided)\b/i],
  ['last_event', /\b(when (did|was|were)|last (time|serviced|replaced|cleaned|changed)|how long since)\b/i],
]

export function classify(query: string): Intent {
  for (const [intent, re] of PATTERNS) {
    if (re.test(query)) return intent
  }
  return 'open'
}

// --- entity resolution ------------------------------------------------------

/**
 * Which thing is the question about?
 *
 * BM25 over the entity's flattened `searchText`, which is why that field exists:
 * a query naming a serial number, a model code or an attribute value resolves
 * to the right entity through the same index as one naming it outright.
 *
 * Deliberately keyword-only. Entity resolution wants precision — "the Samsung"
 * should match the Samsung and nothing else — and a vector will happily decide
 * that a Daikin aircon is quite like a Samsung refrigerator.
 */
export async function resolveEntity(db: TalaDB, query: string): Promise<Entity | null> {
  const hits = await collections(db).entities.searchText('searchText', query, 3)
  if (!hits.length) return null

  // BM25 ranks the candidates; it does not decide them. An absolute score floor
  // is not portable across corpus sizes — the value moves with IDF and average
  // document length, both corpus statistics — so acceptance is the same exact
  // test the capture extractor uses: does the question actually name this
  // thing? Below that, answering about a specific entity would be a guess
  // dressed as a fact.
  return hits.map((h) => h.document).find((e) => namesEntity(query, e)) ?? null
}

// --- ranked retrieval -------------------------------------------------------

const TOP_K = 8

interface Ranked {
  evidence: Evidence[]
  engines: Engine[]
  semanticUsed: boolean
  execution: RecallResult['execution']
}

/**
 * The ranking step.
 *
 * With the model loaded this is a single `hybridSearch`: BM25 over `content`
 * and cosine over `embedding`, fused by reciprocal rank. Without it, BM25
 * alone — which is a smaller answer, not a broken one, and is why the app is
 * usable before anyone downloads anything.
 *
 * `textRank`/`vectorRank` come back per hit and are passed straight through to
 * the UI. They are the evidence that the fusion is real.
 */
async function rank(db: TalaDB, query: string, filter?: Record<string, unknown>): Promise<Ranked> {
  const { memories } = collections(db)

  if (!isEmbedderReady()) {
    const hits = await memories.searchText('content', query, TOP_K, filter as never)
    return {
      evidence: hits.map((h, i) => ({
        memory: stripVector(h.document),
        score: h.score,
        textRank: i,
        vectorRank: null,
      })),
      engines: ['keyword'],
      semanticUsed: false,
      execution: null,
    }
  }

  const vector = await embed(query)

  const [hits, probe] = await Promise.all([
    memories.hybridSearch(
      { textField: 'content', text: query },
      { vectorField: 'embedding', vector },
      TOP_K,
      filter as never,
    ),
    // Run the vector side once more on its own purely to capture the execution
    // record — which index path was taken, and how many distances it actually
    // computed. `hybridSearch` doesn't surface that, and it is the single most
    // interesting number in the whole pipeline.
    memories
      .searchVectors('embedding', vector, TOP_K, filter as never)
      .catch(() => null),
  ])

  return {
    evidence: hits.map((h) => ({
      memory: stripVector(h.document),
      score: h.score,
      textRank: h.textRank,
      vectorRank: h.vectorRank,
    })),
    engines: ['keyword', 'vector', 'hybrid'],
    semanticUsed: true,
    execution: probe
      ? {
          path: probe.execution.path,
          reason: probe.execution.reason,
          distanceComputations: probe.execution.distanceComputations,
          efSearch: probe.execution.efSearch,
        }
      : null,
  }
}

/** `hybridSearch` returns whole documents, vectors included. Don't hold them. */
function stripVector(doc: MemoryRow & { embedding?: number[] }): MemoryRow {
  const { embedding, ...rest } = doc
  return rest
}

// --- deterministic answers --------------------------------------------------

const money = (n: number) => `₱${Math.round(n).toLocaleString()}`
const when = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

async function answerLoans(db: TalaDB, entity: Entity | null): Promise<Answer | null> {
  const loans = await openLoans(db)
  const scoped = entity ? loans.filter((l) => l.memory.entityIds.includes(entity._id!)) : loans

  if (!scoped.length) {
    return {
      headline: entity ? `${entity.name} is not lent out` : 'Nothing is lent out',
      lines: entity
        ? ['No loan without a matching return.']
        : ['Every loan in your history has a return recorded against it.'],
      entity,
      engine: 'structured',
      method: 'Loans with no later return for the same thing — two indexed reads, no ranking.',
    }
  }

  return {
    headline:
      scoped.length === 1
        ? `${scoped[0].entity?.name ?? 'It'} is with ${scoped[0].borrower?.name ?? 'someone'}`
        : `${scoped.length} things are lent out`,
    lines: scoped.map(
      (l) =>
        `${l.entity?.name ?? 'Unknown'} → ${l.borrower?.name ?? 'unknown'}, since ${when(
          l.memory.occurredAt,
        )} (${l.daysOut} days)`,
    ),
    entity: scoped.length === 1 ? scoped[0].entity : entity,
    engine: 'structured',
    method: 'Loans with no later return for the same thing — two indexed reads, no ranking.',
  }
}

async function answerLocation(db: TalaDB, entity: Entity | null): Promise<Answer | null> {
  if (!entity) return null

  const located = await locateEntity(db, entity._id!)
  if (!located || !located.path.length) {
    return {
      headline: `No location recorded for ${entity.name}`,
      lines: ['Record a movement and it will show here.'],
      entity,
      engine: 'graph',
      method: 'Containment walk over the relations collection.',
    }
  }

  const path = located.path.map((p) => p.name).join(' → ')
  return {
    headline: path,
    lines: located.via
      ? [`Moved there on ${when(located.via.occurredAt)}.`, located.via.content]
      : [`Where ${entity.name} is normally kept.`],
    entity,
    engine: 'graph',
    method: located.via
      ? 'Most recent movement memory, then a containment walk up the place hierarchy.'
      : 'Containment walk up the place hierarchy from the recorded parent.',
  }
}

/** Maintenance-shaped spend, when the question says so; otherwise everything. */
const MAINTENANCE_TYPES: MemoryType[] = ['maintenance', 'repair', 'replacement', 'installation']

async function answerSpend(db: TalaDB, entity: Entity | null, query: string): Promise<Answer | null> {
  if (!entity) return null

  const thisYear = /\bthis year\b/i.test(query)
  const maintenanceOnly = /\b(maintain|maintaining|maintenance|repair|servic)/i.test(query)

  const from = thisYear ? new Date(new Date().getFullYear(), 0, 1).getTime() : undefined
  const { total, n } = await spendForEntity(db, entity._id!, {
    from,
    ...(maintenanceOnly ? { types: MAINTENANCE_TYPES } : {}),
  })

  const scope = [
    maintenanceOnly ? 'maintenance' : 'recorded spend',
    thisYear ? `in ${new Date().getFullYear()}` : 'all time',
  ].join(' ')

  return {
    headline: money(total),
    lines: [
      `${entity.name} — ${scope}.`,
      `${n} ${n === 1 ? 'memory' : 'memories'} with an amount.`,
    ],
    entity,
    engine: 'structured',
    method: '$match on the entity, then $group/$sum inside the engine. Computed, not generated.',
  }
}

async function answerWarranty(db: TalaDB, entity: Entity | null): Promise<Answer | null> {
  if (entity) {
    if (!entity.warrantyExpiresAt) {
      return {
        headline: `No warranty date on ${entity.name}`,
        lines: ['Add one and it will appear in reminders.'],
        entity,
        engine: 'structured',
        method: 'Direct field read.',
      }
    }
    const days = Math.ceil((entity.warrantyExpiresAt - Date.now()) / 86_400_000)
    return {
      headline:
        days >= 0
          ? `Covered until ${when(entity.warrantyExpiresAt)}`
          : `Expired on ${when(entity.warrantyExpiresAt)}`,
      lines: [days >= 0 ? `${days} days left.` : `${Math.abs(days)} days ago.`],
      entity,
      engine: 'structured',
      method: 'Stored date on the entity. No inference.',
    }
  }

  const [soon, lapsed] = await Promise.all([warrantiesExpiring(db, 120), warrantiesExpired(db, 120)])
  if (!soon.length && !lapsed.length) return null

  return {
    headline: soon.length ? `${soon.length} expiring in the next 120 days` : 'Nothing expiring soon',
    lines: [
      ...soon.map((w) => `${w.entity.name} — ${w.daysLeft} days left (${when(w.entity.warrantyExpiresAt!)})`),
      ...lapsed.map((w) => `${w.entity.name} — expired ${Math.abs(w.daysLeft)} days ago`),
    ],
    entity: null,
    engine: 'structured',
    method: 'Two-sided range scan on the warrantyExpiresAt index.',
  }
}

async function answerLastEvent(
  db: TalaDB,
  entity: Entity | null,
  query: string,
  evidence: Evidence[],
): Promise<Answer | null> {
  if (!entity) return null

  // Which kind of event the question is about, inferred from its own words. A
  // narrow $match beats ranking here: "when did I last replace the chain" wants
  // the most recent replacement, not the most relevant sentence about chains.
  const typeHints: Array<[MemoryType[], RegExp]> = [
    [['replacement', 'repair'], /\b(replac|chang|swap|fix|repair)/i],
    [['maintenance'], /\b(servic|clean|maintain|tune)/i],
    [['purchase'], /\b(buy|bought|purchas)/i],
  ]
  const types = typeHints.find(([, re]) => re.test(query))?.[0]

  const [latest] = await collections(db).memories.aggregate<MemoryRow>([
    {
      $match: {
        entityIds: entity._id!,
        ...(types ? { memoryType: { $in: types } } : {}),
      } as never,
    },
    { $sort: { occurredAt: -1 } },
    { $limit: 1 },
    { $project: { embedding: 0 } },
  ])

  // Nothing of that shape on record — fall through to the ranked passages
  // rather than inventing a date.
  if (!latest) return null

  const top = evidence[0]
  return {
    headline: when(latest.occurredAt),
    lines: [
      latest.title,
      latest.content,
      ...(latest.amount ? [`Cost: ${money(latest.amount)}`] : []),
    ],
    entity,
    engine: 'structured',
    method: types
      ? 'Newest memory of that kind for this thing — indexed $match, sorted by date.'
      : 'Newest memory for this thing — indexed $match, sorted by date.',
    ...(top ? {} : {}),
  }
}

async function answerDecision(db: TalaDB, entity: Entity | null, evidence: Evidence[]): Promise<Answer | null> {
  // Decisions are prose — the reasoning is the answer, and no amount of
  // structure captures "the freezer was the deciding factor". So this one is
  // genuinely a retrieval question; all the structured step does is narrow the
  // candidate set to decision-typed memories.
  const filter = entity
    ? { memoryType: 'decision', entityIds: entity._id! }
    : { memoryType: 'decision' }

  const [decision] = await collections(db).memories.aggregate<MemoryRow>([
    { $match: filter as never },
    { $sort: { occurredAt: -1 } },
    { $limit: 1 },
    { $project: { embedding: 0 } },
  ])

  const best = evidence.find((e) => e.memory.memoryType === 'decision')?.memory ?? decision
  if (!best) return null

  return {
    headline: best.title,
    lines: [best.content, `Decided on ${when(best.occurredAt)}.`],
    entity,
    engine: evidence.some((e) => e.memory._id === best._id) ? 'hybrid' : 'structured',
    method: 'Narrowed to decision memories, then ranked. The reasoning is prose, so retrieval owns this one.',
  }
}

// --- the pipeline -----------------------------------------------------------

/**
 * Answer a question about the user's own history.
 *
 * Never fabricates. When no deterministic answer exists and nothing ranks
 * convincingly, `answer` is null and the caller shows the passages it found —
 * which is the honest outcome, and better than a confident sentence assembled
 * out of nothing.
 */
export async function recall(db: TalaDB, query: string): Promise<RecallResult> {
  const started = performance.now()
  const trimmed = query.trim()

  const intent = classify(trimmed)

  const structuredStart = performance.now()
  const entity = await resolveEntity(db, trimmed)
  const structuredMs = performance.now() - structuredStart

  const retrievalStart = performance.now()
  const ranked = await rank(db, trimmed)
  const retrievalMs = performance.now() - retrievalStart

  let answer: Answer | null = null
  switch (intent) {
    case 'loans':
      answer = await answerLoans(db, entity)
      break
    case 'location':
      answer = await answerLocation(db, entity)
      break
    case 'spend':
      answer = await answerSpend(db, entity, trimmed)
      break
    case 'warranty':
      answer = await answerWarranty(db, entity)
      break
    case 'last_event':
      answer = await answerLastEvent(db, entity, trimmed, ranked.evidence)
      break
    case 'decision':
      answer = await answerDecision(db, entity, ranked.evidence)
      break
    case 'open':
      break
  }

  const engines: Engine[] = answer
    ? [answer.engine, ...ranked.engines.filter((e) => e !== answer!.engine)]
    : ranked.engines

  return {
    query: trimmed,
    intent,
    answer,
    evidence: ranked.evidence,
    engines,
    semanticUsed: ranked.semanticUsed,
    timings: {
      totalMs: performance.now() - started,
      structuredMs,
      retrievalMs,
    },
    execution: ranked.execution,
  }
}

/**
 * Memories similar to a given one — "you have seen this before".
 *
 * Pure vector, and the one place in the app where that is unambiguously right:
 * there is no query text to keyword-match against, only a document, and the
 * question is literally "what is near this in meaning".
 */
export async function similarMemories(
  db: TalaDB,
  memoryId: string,
  limit = 5,
): Promise<Array<{ memory: MemoryRow; score: number }>> {
  const { memories } = collections(db)

  const source = await memories.findOne({ _id: memoryId } as never)
  if (!source?.embedding) return []

  const hits = await memories.findNearest('embedding', source.embedding, limit + 1)
  return hits
    .filter((h) => h.document._id !== memoryId)
    .slice(0, limit)
    .map((h) => ({ memory: stripVector(h.document), score: h.score }))
}

/** Entity names for a set of ids, for rendering evidence rows. */
export async function evidenceEntities(
  db: TalaDB,
  evidence: Evidence[],
): Promise<Map<string, Entity>> {
  const ids = [...new Set(evidence.flatMap((e) => e.memory.entityIds))]
  return entitiesByIds(db, ids)
}
