import type { TalaDB } from 'taladb'
import { collections } from './schema'
import type { Entity, MemoryType, SourceType } from './types'

// ---------------------------------------------------------------------------
// Capture extraction.
//
// The user types a sentence; this turns it into a structured memory proposal
// that they then confirm or correct. Nothing here is a model — it is date
// parsing, currency parsing, a verb table, and BM25 entity resolution against
// the things they already own.
//
// Two reasons it is deliberately deterministic. It runs instantly and offline
// on any device, which is the tier-1 promise. And every field it fills carries
// a confidence and a reason, so the confirm step can show *why* it thinks the
// bike is the Trek — which a generated guess cannot.
//
// Nothing is written until the user presses save. An extraction is a proposal.
// ---------------------------------------------------------------------------

export interface ExtractedField<T> {
  value: T
  confidence: number
  /** Short account of what in the text produced this. Shown on the confirm screen. */
  reason: string
}

export interface MemoryProposal {
  memoryType: ExtractedField<MemoryType>
  title: string
  content: string
  occurredAt: ExtractedField<number>
  subject: ExtractedField<Entity> | null
  actor: ExtractedField<Entity> | null
  place: ExtractedField<Entity> | null
  amount: ExtractedField<number> | null
  /** Entities named in the text beyond subject/actor/place. */
  mentioned: Entity[]
  sourceType: SourceType
}

// --- memory type ------------------------------------------------------------

// Order matters: the first match wins, so the more specific patterns come
// first. "Returned the drill" must not classify as a movement because it
// contains a direction.
const TYPE_RULES: Array<[MemoryType, RegExp]> = [
  ['return', /\b(returned|gave back|got .* back|brought back|came back)\b/i],
  ['loan', /\b(lent|loaned|borrow(ed)? (my|the)|let .* borrow|gave .* to borrow)\b/i],
  ['purchase', /\b(bought|purchased|ordered|picked up .* from|paid for)\b/i],
  // "changed the X" is a replacement for a wearing part but maintenance for a
  // fluid, so the part list is explicit here and `changed the oil` is left to
  // the maintenance rule below. Getting this wrong is how "changed the chain"
  // ends up filed as an untyped note.
  [
    'replacement',
    /\b(replaced|swapped|changed (the |my |out )?(\w+\s)?(chain|tyre|tire|battery|filter|belt|bulb|pad|pads|string|strings|gasket|blade|cartridge|hose)|new (chain|tyre|tire|battery|filter|belt|part))\b/i,
  ],
  ['repair', /\b(repaired|fixed|mended|sealed|resurfaced|straightened)\b/i],
  ['maintenance', /\b(serviced|cleaned|lubed|lubricated|maintained|tuned|descaled|changed the oil)\b/i],
  ['installation', /\b(installed|set up|mounted|fitted)\b/i],
  ['movement', /\b(moved|put|stored|relocated|transferred|took .* to)\b/i],
  ['decision', /\b(decided|chose|went with|picked .* over|instead of)\b/i],
  ['warranty', /\b(warrant(y|ies)|guarantee|applecare|covered until)\b/i],
  ['appointment', /\b(booked|scheduled|appointment|due for)\b/i],
  ['conversation', /\b(spoke|talked|called|asked|mentioned|told me)\b/i],
  ['expense', /\b(paid|spent|fee|rent|bill|subscription)\b/i],
  ['observation', /\b(noticed|noticing|seems|feels|sounds|smells|started (making|doing))\b/i],
]

function extractType(text: string): ExtractedField<MemoryType> {
  for (const [type, re] of TYPE_RULES) {
    const match = text.match(re)
    if (match) {
      return { value: type, confidence: 0.85, reason: `matched “${match[0].toLowerCase()}”` }
    }
  }
  return { value: 'note', confidence: 0.4, reason: 'no event verb found — saved as a note' }
}

// --- dates ------------------------------------------------------------------

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function startOfDay(d: Date): number {
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

function extractDate(text: string, now = new Date()): ExtractedField<number> {
  const lower = text.toLowerCase()

  if (/\btoday\b/.test(lower)) {
    return { value: startOfDay(new Date(now)), confidence: 0.95, reason: 'matched “today”' }
  }
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return { value: startOfDay(d), confidence: 0.95, reason: 'matched “yesterday”' }
  }

  const ago = lower.match(/\b(\d+)\s+(day|week|month|year)s?\s+ago\b/)
  if (ago) {
    const n = parseInt(ago[1], 10)
    const d = new Date(now)
    if (ago[2] === 'day') d.setDate(d.getDate() - n)
    else if (ago[2] === 'week') d.setDate(d.getDate() - n * 7)
    else if (ago[2] === 'month') d.setMonth(d.getMonth() - n)
    else d.setFullYear(d.getFullYear() - n)
    return { value: startOfDay(d), confidence: 0.9, reason: `matched “${ago[0]}”` }
  }

  const lastWeek = lower.match(/\blast\s+(week|month|year)\b/)
  if (lastWeek) {
    const d = new Date(now)
    if (lastWeek[1] === 'week') d.setDate(d.getDate() - 7)
    else if (lastWeek[1] === 'month') d.setMonth(d.getMonth() - 1)
    else d.setFullYear(d.getFullYear() - 1)
    return { value: startOfDay(d), confidence: 0.7, reason: `matched “${lastWeek[0]}” (approximate)` }
  }

  // "14 May", "May 14", either optionally followed by a year.
  const named = lower.match(
    new RegExp(
      `\\b(?:(\\d{1,2})\\s+(${MONTHS.join('|')})|(${MONTHS.join('|')})\\s+(\\d{1,2}))(?:,?\\s+(\\d{4}))?\\b`,
    ),
  )
  if (named) {
    const day = parseInt(named[1] ?? named[4], 10)
    const monthName = named[2] ?? named[3]
    const month = MONTHS.indexOf(monthName)
    const year = named[5] ? parseInt(named[5], 10) : now.getFullYear()
    const d = new Date(year, month, day)
    // A date with no year that lands in the future almost certainly meant last
    // year — "on December 3rd" said in January is not a prediction.
    if (!named[5] && d.getTime() > now.getTime()) d.setFullYear(year - 1)
    return {
      value: startOfDay(d),
      confidence: named[5] ? 0.95 : 0.8,
      reason: `matched “${named[0]}”${named[5] ? '' : ' (year assumed)'}`,
    }
  }

  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    return { value: startOfDay(d), confidence: 0.98, reason: `matched “${isoMatch[0]}”` }
  }

  return { value: startOfDay(new Date(now)), confidence: 0.3, reason: 'no date in the text — assumed today' }
}

// --- money ------------------------------------------------------------------

function extractAmount(text: string): ExtractedField<number> | null {
  // ₱1,200 / P1200 / PHP 1,200 / 1,200 pesos / $45.00
  const patterns: Array<[RegExp, number]> = [
    [/(?:₱|php\s*|p(?=\d))\s*([\d,]+(?:\.\d{1,2})?)/i, 0.95],
    [/([\d,]+(?:\.\d{1,2})?)\s*(?:pesos|php)\b/i, 0.9],
    [/\$\s*([\d,]+(?:\.\d{1,2})?)/, 0.9],
  ]

  for (const [re, confidence] of patterns) {
    const match = text.match(re)
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''))
      if (Number.isFinite(value) && value > 0) {
        return { value, confidence, reason: `matched “${match[0].trim()}”` }
      }
    }
  }
  return null
}

// --- entities ---------------------------------------------------------------

/**
 * Resolve the things, people and places a sentence names.
 *
 * BM25 over the flattened `searchText` field, run once and then split by entity
 * type, because the roles are decided by type and by the preposition in front
 * of them — "to Mark" is an actor, "in the garage" is a place, and the rest is
 * what the event happened to.
 */
async function resolveMentions(db: TalaDB, text: string): Promise<Entity[]> {
  // BM25 generates the candidates; it does not decide them.
  //
  // The earlier version filtered on an absolute score (>= 1.0), which is the
  // one thing a BM25 score cannot support: the value moves with the corpus,
  // because IDF and average document length are both corpus statistics. A
  // threshold tuned against a seeded 48-entity catalogue rejects *everything*
  // in an app that starts empty — measured, the correct subject scored 0.536
  // and its own service provider 0.979, so a sentence naming both resolved to
  // neither.
  //
  // So acceptance is an exact test instead: does the text actually name this
  // thing? That is stable at any corpus size, and it is also what the confirm
  // screen claims when it says "named in the text". When nothing is named the
  // answer is no subject, and the user is asked — which beats guessing.
  const hits = await collections(db).entities.searchText('searchText', text, 12)
  return hits.map((h) => h.document).filter((e) => namesEntity(text, e))
}

/** Does the text name this entity closely enough to act on without asking? */
/**
 * Does this sentence actually refer to this entity?
 *
 * Matched against the fields that carry identity — the name, and the words a
 * person uses *instead* of the name. "Changed the bicycle chain" names the
 * Trek FX 3 by its category, which is how people actually refer to the one
 * bicycle they own, so category counts. Description does not: it is prose, and
 * matching on it would make every entity a candidate for every sentence.
 *
 * Four characters is the floor, which keeps "FX" and "3" from matching half the
 * dictionary while still allowing "trek", "aircon" and "bicycle".
 */
export function namesEntity(text: string, entity: Entity): boolean {
  const lower = text.toLowerCase()
  if (lower.includes(entity.name.toLowerCase())) return true

  const identifiers = [
    ...entity.name.split(/\s+/),
    entity.category,
    entity.manufacturer,
    entity.model,
    entity.serialNumber,
  ]

  return identifiers.some(
    (word) => typeof word === 'string' && word.length >= 4 && lower.includes(word.toLowerCase()),
  )
}

const ACTOR_TYPES = new Set(['person', 'organization'])

export async function extractMemory(
  db: TalaDB,
  text: string,
  now = new Date(),
): Promise<MemoryProposal> {
  const trimmed = text.trim()
  const mentions = await resolveMentions(db, trimmed)

  const memoryType = extractType(trimmed)
  const occurredAt = extractDate(trimmed, now)
  const amount = extractAmount(trimmed)

  // A person or organization named after "to", "at", "from", "by" or "with" is
  // who it happened with, not what it happened to.
  const actorMatch = mentions.find(
    (e) =>
      ACTOR_TYPES.has(e.entityType) &&
      new RegExp(`\\b(to|at|from|by|with)\\s+(the\\s+)?${escape(e.name.split(/\s+/)[0])}`, 'i').test(
        trimmed,
      ),
  )
  const actor = actorMatch ?? mentions.find((e) => ACTOR_TYPES.has(e.entityType)) ?? null

  const placeMatch = mentions.find(
    (e) =>
      e.entityType === 'place' &&
      new RegExp(`\\b(in|into|on|at|to)\\s+(the\\s+)?${escape(e.name.split(/\s+/)[0])}`, 'i').test(
        trimmed,
      ),
  )
  const place = placeMatch ?? mentions.find((e) => e.entityType === 'place') ?? null

  const subject =
    mentions.find((e) => !ACTOR_TYPES.has(e.entityType) && e.entityType !== 'place') ?? null

  const title = buildTitle(trimmed, memoryType.value, subject)

  return {
    memoryType,
    title,
    content: trimmed,
    occurredAt,
    subject: subject
      ? {
          value: subject,
          confidence: namesEntity(trimmed, subject) ? 0.9 : 0.55,
          reason: namesEntity(trimmed, subject)
            ? `named in the text`
            : `closest match among your things`,
        }
      : null,
    actor: actor
      ? {
          value: actor,
          confidence: actorMatch ? 0.85 : 0.5,
          reason: actorMatch ? 'named after a preposition' : 'only person or place named',
        }
      : null,
    place: place
      ? {
          value: place,
          confidence: placeMatch ? 0.85 : 0.5,
          reason: placeMatch ? 'named after a preposition' : 'only place named',
        }
      : null,
    amount,
    mentioned: mentions.filter(
      (e) => e._id !== subject?._id && e._id !== actor?._id && e._id !== place?._id,
    ),
    sourceType: 'user_entered',
  }
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const TYPE_TITLE: Partial<Record<MemoryType, string>> = {
  purchase: 'Bought',
  maintenance: 'Serviced',
  repair: 'Repaired',
  replacement: 'Replaced part on',
  loan: 'Lent out',
  return: 'Returned',
  movement: 'Moved',
  installation: 'Installed',
  decision: 'Decision about',
  observation: 'Noticed something about',
  appointment: 'Appointment for',
  expense: 'Expense for',
  warranty: 'Warranty note for',
  conversation: 'Conversation about',
}

/**
 * A short label for the timeline. The first clause of what they wrote is almost
 * always the right one, so use it when it is a reasonable length and fall back
 * to a generated label only when it isn't.
 */
function buildTitle(text: string, type: MemoryType, subject: Entity | null): string {
  const firstClause = text.split(/[.,;\n]/)[0].trim()
  if (firstClause.length >= 8 && firstClause.length <= 70) {
    return firstClause.charAt(0).toUpperCase() + firstClause.slice(1)
  }

  const verb = TYPE_TITLE[type] ?? 'Note about'
  return subject ? `${verb} ${subject.name}` : verb
}

/**
 * Confidence band for the proposal as a whole — drives the ✓ / ◐ / ◇ marker.
 * An extraction is never `confirmed`; only a user pressing save makes it that.
 */
export function proposalConfidence(p: MemoryProposal): number {
  const fields = [p.memoryType.confidence, p.occurredAt.confidence, p.subject?.confidence ?? 0.5]
  return fields.reduce((a, b) => a + b, 0) / fields.length
}
