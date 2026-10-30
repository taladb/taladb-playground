'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTalaDB } from '@taladb/react'
import {
  ModelRequiredError, recall, type Evidence, type RecallResult, type SearchMode,
} from '@/lib/retrieval'
import { useEmbedderState } from '@/lib/embed'
import { queryTerms, termsFound } from '@/lib/highlight'
import { useDesktopFocus } from '@/lib/use-desktop-focus'
import { clearHandoff, peekHandoff } from '@/lib/handoff'
import { MemoryCard, MemoryThread } from '../components/MemoryCard'
import { EngineBadge, RankMarks } from '../components/EngineBadge'
import { ModelCard } from '../components/ModelStatus'
import { Segmented } from '../components/Segmented'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { MemorySkeleton } from '../components/Skeleton'
import { Icon } from '../components/Icon'

/**
 * Search — ask a question about your own history.
 *
 * The page is built around showing its work. Every answer says which engine
 * produced it and why, every result carries the engine's own score and where
 * each retriever ranked it, and the technical view reports the execution path
 * the vector index took and how many distance computations it did.
 *
 * The four modes exist so the retrievers can be compared on the same query.
 * "Smart" is what the app would do on its own; the other three run one
 * retriever alone, which is how you see that BM25 nails a model number and
 * misses a paraphrase, and a vector does the opposite.
 */

const MODES: Array<{ value: SearchMode; label: string; needsModel: boolean; explain: string }> = [
  {
    value: 'auto',
    label: 'Smart',
    needsModel: false,
    explain:
      'Answers exactly when the question has an answer — a total, a location, a loan — then ranks the memories behind it with the best search available.',
  },
  {
    value: 'keyword',
    label: 'Keyword',
    needsModel: false,
    explain: 'BM25 full-text ranking. Finds the words you typed, and rewards rare ones. Great for names and model numbers.',
  },
  {
    value: 'semantic',
    label: 'Semantic',
    needsModel: true,
    explain:
      'Vector similarity. Your query becomes an embedding on this device and is compared to every memory’s. Finds meaning, even with no words in common.',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    needsModel: true,
    explain:
      'Both rankings in one TalaDB call, fused by reciprocal rank fusion. Keyword precision plus semantic recall.',
  },
]

const EXAMPLES: Array<{ title: string; hint: string; mode: SearchMode; queries: string[] }> = [
  {
    title: 'Exact answers',
    hint: 'Computed by the document engine, never guessed',
    mode: 'auto',
    queries: ['who has my camera?', 'how much have I spent maintaining the bike?', 'where is my drill?'],
  },
  {
    title: 'Search by meaning',
    hint: 'The answer uses different words',
    mode: 'hybrid',
    queries: ['bike keeps making a clicking noise', 'that camera I lent someone', 'why did I choose the Samsung refrigerator?'],
  },
  {
    title: 'Keyword precision',
    hint: 'Codes and names a vector can’t tell apart',
    mode: 'keyword',
    queries: ['RT38K5930S8', 'CycleHouse', 'Shimano'],
  },
]

const DETAILS_KEY = 'keepsake.search.details'

export default function SearchPage() {
  return (
    <Suspense fallback={<MemorySkeleton rows={3} />}>
      <Search />
    </Suspense>
  )
}

function Search() {
  const db = useTalaDB()
  const params = useSearchParams()
  const embedder = useEmbedderState()
  const modelReady = embedder.status === 'ready'

  const initialMode = (MODES.find((m) => m.value === params.get('mode'))?.value ?? 'auto') as SearchMode
  // Typed elsewhere in the app: by hand-off. From an example link: the URL.
  const [query, setQuery] = useState(() => peekHandoff('q') ?? params.get('q') ?? '')
  const [mode, setMode] = useState<SearchMode>(initialMode)
  const [result, setResult] = useState<RecallResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState(false)
  const inputRef = useDesktopFocus<HTMLInputElement>()
  // Queries overlap — typing fires one per pause, and a chip can fire another —
  // and a slower one must not land on top of the one asked last.
  const latest = useRef(0)

  useEffect(() => {
    clearHandoff('q')
    try {
      setDetails(localStorage.getItem(DETAILS_KEY) === '1')
    } catch {}
  }, [])

  const modeInfo = MODES.find((m) => m.value === mode)!
  const blocked = modeInfo.needsModel && !modelReady

  const run = useCallback(
    async (text: string, which: SearchMode) => {
      const trimmed = text.trim()
      const ticket = ++latest.current
      if (!trimmed) {
        setResult(null)
        setBusy(false)
        setError(null)
        return
      }
      const needsModel = MODES.find((m) => m.value === which)!.needsModel
      if (needsModel && embedder.status !== 'ready') return

      setBusy(true)
      setError(null)
      try {
        const next = await recall(db, trimmed, { mode: which })
        if (ticket !== latest.current) return
        setResult(next)
        // The query is deliberately not written back into the URL: changing
        // it makes the router fetch a server payload for the new URL, and the
        // words would travel with it. Searches stay in this tab.
      } catch (err) {
        if (ticket !== latest.current) return
        if (!(err instanceof ModelRequiredError)) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (ticket === latest.current) setBusy(false)
      }
    },
    [db, embedder.status],
  )

  // Search as you type, after a short pause. Enter runs at once.
  useEffect(() => {
    const t = setTimeout(() => void run(query, mode), query.trim() ? 280 : 0)
    return () => clearTimeout(t)
    // `run` changes when the model becomes ready, which re-runs the current
    // query on purpose: switching semantic search on visibly upgrades the
    // answer in front of the user.
  }, [query, mode, run])

  const terms = useMemo(() => queryTerms(result?.query ?? ''), [result?.query])

  function pick(q: string, m: SearchMode) {
    setQuery(q)
    // An example written for hybrid still runs without the model — in Smart
    // mode, which says it is keyword-only — rather than not running at all.
    setMode(MODES.find((x) => x.value === m)!.needsModel && !modelReady ? 'auto' : m)
  }

  function toggleDetails() {
    setDetails((d) => {
      try {
        localStorage.setItem(DETAILS_KEY, d ? '0' : '1')
      } catch {}
      return !d
    })
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Search playground"
        title="Ask your memory anything"
        description="Every search runs inside this browser, against the TalaDB database on this device. Questions with an exact answer get one; everything else is ranked — and you can see exactly how."
      />

      <section className="space-y-4">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            void run(query, mode)
          }}
        >
          <label htmlFor="recall-query" className="sr-only">
            Search your memories
          </label>
          <div
            className="flex items-center gap-3 rounded-[16px] px-4 transition-shadow focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ios-blue)_22%,transparent)]"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border-strong)', boxShadow: 'var(--shadow-card)' }}
          >
            <Icon name="search" className="muted h-5 w-5 shrink-0" strokeWidth={2.2} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) {
                  e.preventDefault()
                  setQuery('')
                }
              }}
              placeholder="When did I last replace the bicycle chain?"
              ref={inputRef}
              id="recall-query"
              name="q"
              type="text"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              className="h-14 min-w-0 flex-1 bg-transparent text-[17px] outline-none md:h-16 md:text-[19px]"
            />
            {busy && <span className="spinner h-4 w-4 shrink-0 muted" aria-hidden />}
            {query && !busy && (
              <button type="button" onClick={() => setQuery('')} className="btn-icon -mr-2 h-9 w-9" aria-label="Clear search">
                <Icon name="close" className="h-4 w-4" strokeWidth={2.2} />
              </button>
            )}
          </div>
        </form>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <Segmented
            label="Search mode"
            value={mode}
            onChange={setMode}
            options={MODES.map((m) => ({
              value: m.value,
              label: (
                <>
                  {m.label}
                  {m.needsModel && !modelReady && (
                    <Icon name="sparkle" className="h-3 w-3 opacity-60" strokeWidth={2.4} />
                  )}
                </>
              ),
            }))}
          />
          <button
            type="button"
            role="switch"
            aria-checked={details}
            onClick={toggleDetails}
            className="flex items-center gap-2 self-start text-[13px] font-medium muted hover:text-[var(--color-label)] sm:self-auto"
          >
            <span
              aria-hidden
              className="relative h-5 w-8 rounded-full transition-colors"
              style={{ background: details ? 'var(--color-ios-blue)' : 'var(--color-border-strong)' }}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]"
                style={{ left: details ? '14px' : '2px' }}
              />
            </span>
            Technical details
          </button>
        </div>
        <p className="muted max-w-3xl text-[13.5px] leading-relaxed">{modeInfo.explain}</p>
      </section>

      {(blocked || (mode === 'auto' && !modelReady)) && (
        <ModelCard
          compact={!blocked}
          reason={
            blocked
              ? `${modeInfo.label} search compares meaning, so it needs an embedding model on this device: all-MiniLM-L6-v2 (23 MB) and its WebAssembly runtime (22 MB).`
              : undefined
          }
        />
      )}

      {error && (
        <div role="alert" className="card flex items-start gap-3 p-4 text-[14px]" style={{ color: 'var(--color-ios-red)' }}>
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
          <span>Search failed: {error}. Nothing was changed — try again.</span>
        </div>
      )}

      {!result && !query.trim() && <Examples onPick={pick} />}

      {!result && busy && <MemorySkeleton rows={3} />}

      {/* A result from another mode would sit under a label it no longer
          matches, so a mode waiting for the model shows nothing instead. */}
      {result && !blocked && (
        <div className={`transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
          <Results result={result} terms={terms} details={details} />
        </div>
      )}
    </div>
  )
}

function Examples({ onPick }: { onPick: (q: string, mode: SearchMode) => void }) {
  return (
    <section aria-label="Example searches" className="grid gap-3 md:grid-cols-3">
      {EXAMPLES.map((group) => (
        <div key={group.title} className="card min-w-0 p-4">
          <p className="text-[14px] font-semibold">{group.title}</p>
          <p className="muted mt-0.5 text-[12.5px]">{group.hint}</p>
          <ul className="mt-3 space-y-1">
            {group.queries.map((q) => (
              <li key={q}>
                <button
                  onClick={() => onPick(q, group.mode)}
                  className="group flex w-full items-center gap-2 rounded-[9px] px-2 py-1.5 text-left text-[14px] transition-colors hover:bg-[var(--color-fill)]"
                >
                  <span className="min-w-0 flex-1 truncate">{q}</span>
                  <Icon name="arrow" className="muted-more h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2.2} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

const RANKER_LABEL = {
  keyword: 'keyword (BM25)',
  semantic: 'semantic (vector)',
  hybrid: 'hybrid (BM25 + vector, fused)',
} as const

function Results({ result, terms, details }: { result: RecallResult; terms: string[]; details: boolean }) {
  const top = result.evidence[0]?.score ?? 0
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="muted tnum text-[13px]" aria-live="polite">
          {result.evidence.length === 0 ? 'No memories ranked' : `${result.evidence.length} ${result.evidence.length === 1 ? 'memory' : 'memories'}`}{' '}
          · ranked by {RANKER_LABEL[result.ranker]} · {result.timings.totalMs.toFixed(1)} ms on this device
          {result.mode === 'auto' && !result.semanticUsed && ' · semantic search is off'}
        </p>
        <ShareSearch query={result.query} mode={result.mode} />
      </div>

      {result.answer && <AnswerCard answer={result.answer} />}

      <section className="space-y-3">
        {result.answer && <h2 className="eyebrow">The memories behind it</h2>}

        {result.evidence.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Icon name="search" className="muted-more h-7 w-7" strokeWidth={1.8} />
            <p className="mt-1 text-[16px] font-semibold">No memory matched</p>
            <p className="muted max-w-sm text-[14px]">
              {result.ranker === 'keyword'
                ? 'None of these words appear in any memory. Semantic search can find a memory that says the same thing in other words.'
                : 'Nothing on this device is close to that. Try fewer words, or the name of a thing.'}
            </p>
          </div>
        ) : (
          <MemoryThread>
            {result.evidence.map((item, i) => (
              <MemoryCard key={item.memory._id} memory={item.memory} index={i} terms={terms}>
                <Relevance item={item} position={i} top={top} result={result} terms={terms} details={details} />
              </MemoryCard>
            ))}
          </MemoryThread>
        )}
      </section>

      {details && <Inspector result={result} />}
    </div>
  )
}

/**
 * Opt-in: a link that reopens this search.
 *
 * Searches are kept out of the address bar on purpose (see lib/handoff.ts), so
 * a link is only made when someone asks for one — and the confirmation says
 * what that means: whoever opens it sends the search text to this site as part
 * of the URL. Copying itself makes no request.
 */
function ShareSearch({ query, mode }: { query: string; mode: SearchMode }) {
  const toast = useToast()

  async function copy() {
    const params = new URLSearchParams({ q: query, ...(mode !== 'auto' ? { mode } : {}) })
    const url = `${window.location.origin}/recall?${params}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied. Opening it sends this search text to the site in the URL.', 'info')
    } catch {
      toast('Could not copy — your browser blocked clipboard access.', 'error')
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="muted inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[13px] font-medium transition-colors hover:bg-[var(--color-fill)] hover:text-[var(--color-label)]"
    >
      <Icon name="link" className="h-3.5 w-3.5" strokeWidth={2.2} />
      Copy link to this search
    </button>
  )
}

function AnswerCard({ answer }: { answer: NonNullable<RecallResult['answer']> }) {
  return (
    <section className="card-raised rise overflow-hidden" aria-label="Answer">
      {/* Provenance sits above the answer, not under it. Who computed this is
          part of reading it, not a footnote. */}
      <div
        className="flex flex-wrap items-center gap-2.5 px-5 py-3"
        style={{ boxShadow: 'inset 0 -1px 0 var(--color-border)' }}
      >
        <EngineBadge engine={answer.engine} />
        <span className="muted text-[12.5px] leading-snug">{answer.method}</span>
      </div>

      <div className="px-5 py-6 md:px-6">
        <p className="text-[28px] font-bold leading-[1.12] tracking-[-0.022em] md:text-[34px]">{answer.headline}</p>
        <div className="mt-3 space-y-1.5">
          {answer.lines.map((line, i) => (
            <p key={i} className="muted max-w-2xl text-[15px] leading-relaxed">
              {line}
            </p>
          ))}
        </div>

        {answer.entity && (
          <Link prefetch={false} href={`/entity/${answer.entity._id}`} className="btn-ghost mt-5">
            <span aria-hidden>{answer.entity.icon}</span>
            Open {answer.entity.name}
          </Link>
        )}
      </div>
    </section>
  )
}

const SCORE = {
  bm25: { label: 'BM25', digits: 2, title: 'Keyword relevance. Higher is better; comparable only within this search.' },
  cosine: { label: 'Similarity', digits: 3, title: 'Cosine similarity between your query’s embedding and this memory’s, from −1 to 1.' },
  rrf: { label: 'RRF', digits: 4, title: 'Reciprocal-rank-fusion score. It orders results; it is not a confidence.' },
} as const

/**
 * The engine's own numbers for one hit, and a plain-language reading of them.
 * The bar is this score over the top score in the same list — a proportion of
 * two real numbers, labelled as such, not a confidence.
 */
function Relevance({
  item,
  position,
  top,
  result,
  terms,
  details,
}: {
  item: Evidence
  position: number
  top: number
  result: RecallResult
  terms: string[]
  details: boolean
}) {
  const score = SCORE[item.scoreKind]
  const share = top > 0 ? Math.max(0.04, Math.min(1, item.score / top)) : 0
  const found = termsFound([item.memory.title, item.memory.content], terms)
  const byMeaningOnly = item.vectorRank !== null && item.textRank === null && result.ranker === 'hybrid'

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
        <span className="tnum font-semibold">#{position + 1}</span>
        <span className="flex items-center gap-2" title={score.title}>
          <span aria-hidden className="h-1 w-14 overflow-hidden rounded-full" style={{ background: 'var(--color-fill)' }}>
            <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: 'var(--color-label-2)' }} />
          </span>
          <span className="tnum muted font-mono">
            {score.label} {item.score.toFixed(score.digits)}
          </span>
        </span>
        {result.ranker === 'hybrid' && <RankMarks textRank={item.textRank} vectorRank={item.vectorRank} />}
        {byMeaningOnly && (
          <span className="chip py-0.5 font-semibold" style={{ background: 'color-mix(in oklab, var(--color-ios-purple) 12%, transparent)', color: 'var(--color-ios-purple)' }}>
            Found by meaning
          </span>
        )}
      </div>

      <details className="group text-[13px]" open={details || undefined}>
        <summary className="link inline-flex cursor-pointer items-center gap-1 font-medium">
          Why this result?
          <Icon name="chevron" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" strokeWidth={2.4} />
        </summary>
        <ul className="muted mt-2 space-y-1 leading-relaxed">
          <li>
            {found.length
              ? <>Contains your words: {found.map((w, i) => <span key={w}>{i > 0 && ', '}<mark>{w}</mark></span>)}.</>
              : 'Shares none of the words you typed.'}
          </li>
          {result.ranker !== 'semantic' && (
            <li>
              {item.textRank !== null
                ? `Keyword search (BM25) ranked it #${item.textRank + 1}.`
                : 'Keyword search did not return it.'}
            </li>
          )}
          {result.semanticUsed && (
            <li>
              {item.vectorRank !== null
                ? `Semantic search ranked it #${item.vectorRank + 1} by vector similarity.`
                : 'Semantic search did not return it in its top results.'}
            </li>
          )}
          {item.scoreKind === 'rrf' && (
            <li>Reciprocal rank fusion combined those positions into {item.score.toFixed(4)}; a hit both retrievers agree on rises.</li>
          )}
          {byMeaningOnly && (
            <li className="font-medium" style={{ color: 'var(--color-ios-purple)' }}>
              Keyword search alone could not have found this memory.
            </li>
          )}
        </ul>
      </details>
    </div>
  )
}

function Inspector({ result }: { result: RecallResult }) {
  const isAuto = result.mode === 'auto'
  const stages: Array<[string, string, boolean]> = [
    ...(isAuto
      ? ([
          ['Classify', `intent: ${result.intent}`, true],
          ['Resolve entity', 'BM25 over entity names, models, serials', true],
          [
            'Exact answer',
            result.answer && result.answer.engine !== 'hybrid' ? 'answered by the document engine' : 'no exact answer for this shape',
            !!result.answer,
          ],
        ] as Array<[string, string, boolean]>)
      : []),
    [
      'Keyword (BM25)',
      result.ranker === 'semantic' ? 'not used in this mode' : `${result.evidence.filter((e) => e.textRank !== null).length} hits`,
      result.ranker !== 'semantic',
    ],
    [
      // Named from the execution record: at this corpus size the index is an
      // exact scan, and calling it HNSW would claim a graph that isn't there.
      result.execution?.path === 'hnsw' ? 'Vector (HNSW)' : 'Vector (exact)',
      result.semanticUsed ? `${result.evidence.filter((e) => e.vectorRank !== null).length} hits` : 'off',
      result.semanticUsed,
    ],
    ['Fusion (RRF)', result.ranker === 'hybrid' ? 'reciprocal rank fusion' : 'not used', result.ranker === 'hybrid'],
  ]

  const metrics: Array<[string, string]> = [
    ['Mode', `${result.mode} → ${result.ranker}`],
    ['Total', `${result.timings.totalMs.toFixed(1)} ms`],
    ...(isAuto ? ([['Exact track', `${result.timings.structuredMs.toFixed(1)} ms`]] as Array<[string, string]>) : []),
    ['Ranking track', `${result.timings.retrievalMs.toFixed(1)} ms`],
    ['Results', String(result.evidence.length)],
    ['Score type', result.evidence[0]?.scoreKind.toUpperCase() ?? '—'],
    ...(result.execution
      ? ([
          ['Index path', result.execution.path.toUpperCase()],
          ['Distances computed', result.execution.distanceComputations.toLocaleString()],
          ...(result.execution.efSearch !== null ? [['efSearch', String(result.execution.efSearch)]] : []),
        ] as Array<[string, string]>)
      : []),
  ]

  return (
    <section className="card overflow-hidden" aria-label="Technical details">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5" style={{ boxShadow: 'inset 0 -1px 0 var(--color-border)' }}>
        <h2 className="text-[15px] font-semibold">How this was answered</h2>
        <span className="flex flex-wrap gap-1">
          {result.engines.map((engine) => (
            <EngineBadge key={engine} engine={engine} size="xs" />
          ))}
        </span>
      </div>

      <div className="grid gap-6 px-5 py-4 md:grid-cols-2">
        <ol className="space-y-2">
          {stages.map(([name, detail, ran]) => (
            <li key={name} className="flex items-baseline gap-3 text-[13px]">
              <span aria-hidden style={{ color: ran ? 'var(--color-ios-green)' : 'var(--color-label-3)' }}>
                {ran ? '●' : '○'}
              </span>
              <span className={`w-32 shrink-0 ${ran ? 'font-medium' : 'muted-more'}`}>{name}</span>
              <span className="muted">{detail}</span>
            </li>
          ))}
        </ol>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <dt className="muted">{label}</dt>
              <dd className="tnum mt-0.5 font-mono font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {result.execution && (
        <p className="muted px-5 pb-4 text-[12.5px]">Engine note: {result.execution.reason}</p>
      )}
      <p className="muted-more px-5 pb-4 text-[12px]">
        Timings are measured in this tab around each call to the database worker. No step of this
        search made a network request.
      </p>
    </section>
  )
}
