// ---------------------------------------------------------------------------
// Query terms, found in a result.
//
// This is presentation, not retrieval: it marks which of the visitor's own
// words appear in a memory so a result can show *why* it is on the list. It
// never decides what is on the list — BM25 and the vector index do that — and
// a result the vector index found by meaning will often contain none of them,
// which the UI then says plainly.
// ---------------------------------------------------------------------------

/** Words too common to be evidence of anything. Mirrors the spirit of the
 *  engine's query-time stopword filter, not its exact list. */
const STOPWORDS = new Set(
  `a an and are as at be been but by can did do does for from had has have how i if in into is it
  its me my of on or our so that the their them then there these they this to was we were what
  when where which who why will with you your yours i'm ive i've last much many`.split(/\s+/),
)

const WORD = /[\p{L}\p{N}]+/gu

/** Distinct meaningful words from a query, lowercased. */
export function queryTerms(query: string): string[] {
  const seen = new Set<string>()
  for (const m of query.toLowerCase().matchAll(WORD)) {
    const w = m[0]
    if ((w.length >= 2 || /\d/.test(w)) && !STOPWORDS.has(w)) seen.add(w)
  }
  return [...seen]
}

/** Strip the commonest English inflections: clicks, clicking, clicked → click. */
function stem(word: string): string {
  const cut = word.replace(/(ing|ed|es|e|s)$/, '')
  return cut.length >= 3 ? cut : word
}

/**
 * Does a word in the text count as one of the query terms?
 *
 * Same word, or the same stem once a common suffix is off, so "bike" marks
 * "bikes" and "clicking" marks "clicks" — but "chain" never marks "change".
 * Deliberately crude: it only has to agree with what a reader calls the same
 * word, and it never affects what is ranked.
 */
function matches(word: string, term: string): boolean {
  return word === term || stem(word) === stem(term)
}

export interface Segment {
  text: string
  hit: boolean
}

/** Split text into runs, marking the words that match a query term. */
export function highlight(text: string, terms: string[]): Segment[] {
  if (!terms.length) return [{ text, hit: false }]
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(WORD)) {
    const word = m[0].toLowerCase()
    if (!terms.some((t) => matches(word, t))) continue
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at), hit: false })
    out.push({ text: m[0], hit: true })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false })
  return out
}

/** Which of the query terms occur anywhere in these texts. */
export function termsFound(texts: string[], terms: string[]): string[] {
  const words = new Set<string>()
  for (const text of texts) for (const m of text.toLowerCase().matchAll(WORD)) words.add(m[0])
  return terms.filter((t) => [...words].some((w) => matches(w, t)))
}

/**
 * A window of a long text around its first matching word, so the evidence for
 * a hit is on screen rather than below a line clamp.
 */
export function snippet(text: string, terms: string[], max = 240): string {
  if (text.length <= max) return text
  let first = -1
  for (const m of text.matchAll(WORD)) {
    if (terms.some((t) => matches(m[0].toLowerCase(), t))) {
      first = m.index ?? 0
      break
    }
  }
  if (first < max * 0.6) return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`
  const start = text.lastIndexOf(' ', Math.max(0, first - 60)) + 1
  const body = text.slice(start, start + max).replace(/\s+\S*$/, '')
  return `…${body}${start + max < text.length ? '…' : ''}`
}
