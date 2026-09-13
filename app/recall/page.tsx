'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useTalaDB } from '@taladb/react'
import { recall, type RecallResult } from '@/lib/retrieval'
import { useDesktopFocus } from '@/lib/use-desktop-focus'
import {
  getEmbedderState, loadEmbedder, subscribeEmbedder, type EmbedderState,
} from '@/lib/embed'
import { MemoryCard, MemoryThread } from '../components/MemoryCard'
import { EngineBadge, RankMarks } from '../components/EngineBadge'

/**
 * Recall — ask a question about your own history.
 *
 * The page is built around showing its work. Every answer says which engine
 * produced it and why, every evidence row says where each retriever ranked it,
 * and the inspector at the bottom reports the actual execution path the vector
 * index took and how many distance computations it did.
 *
 * That transparency is the point. "Local-first AI search" is a claim anyone can
 * print on a landing page; a result that says *keyword search never returned
 * this document, the vector index found it in 41 distance computations, and the
 * whole thing took 6 ms without a network request* is the claim demonstrated.
 */

const EXAMPLES: Array<{ q: string; why: string }> = [
  { q: 'bike keeps making a clicking noise', why: 'No shared keywords with the answer — vector only' },
  { q: 'who has my camera?', why: 'Exact: loans with no matching return' },
  { q: 'how much have I spent maintaining the bike?', why: 'Exact: $group / $sum in the engine' },
  { q: 'where is my drill?', why: 'Graph walk up the place hierarchy' },
  { q: 'why did I choose the Samsung refrigerator?', why: 'Reasoning is prose — retrieval owns it' },
  { q: 'RT38K5930S8', why: 'A model code — keyword wins, vector is useless here' },
  { q: 'when was the aircon last serviced?', why: 'Newest memory of that type, sorted by date' },
  { q: 'what warranties are expiring soon?', why: 'Range scan on the warranty index' },
]

function useEmbedderState(): EmbedderState {
  return useSyncExternalStore(subscribeEmbedder, getEmbedderState, () => getEmbedderState())
}

export default function RecallPage() {
  const db = useTalaDB()
  const embedder = useEmbedderState()

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<RecallResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useDesktopFocus<HTMLInputElement>()

  const run = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      setBusy(true)
      setError(null)
      try {
        setResult(await recall(db, trimmed))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [db],
  )

  // Re-run the last query once the model finishes loading, so enabling the
  // semantic tier visibly upgrades the answer in front of the user rather than
  // asking them to search again to see the difference.
  useEffect(() => {
    if (embedder.status === 'ready' && result && !result.semanticUsed) {
      void run(result.query)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedder.status])

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight md:text-4xl">
          What do I already know about this?
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
          Ask in your own words. Questions with an exact answer get one — computed from the
          database, not generated. The rest are ranked, and you can see exactly how.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(query)
          }}
          className="mt-5 flex gap-2"
        >
          <label htmlFor="recall-query" className="sr-only">
            Ask a question about your history
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="When did I last replace the bicycle chain?"
            ref={inputRef}
            id="recall-query"
            name="q"
            type="search"
            autoComplete="off"
            spellCheck={false}
            className="field text-base"
          />
          <button type="submit" disabled={busy || !query.trim()} className="btn-primary shrink-0">
            {busy ? <span className="spinner h-4 w-4" /> : 'Ask'}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example.q}
              title={example.why}
              onClick={() => {
                setQuery(example.q)
                void run(example.q)
              }}
              className="chip border-stone-200 bg-white text-stone-600 hover:border-amber-400 hover:text-amber-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:text-amber-400"
            >
              {example.q}
            </button>
          ))}
        </div>
      </section>

      <SemanticTier state={embedder} onEnable={() => void loadEmbedder()} />

      {error && (
        <div className="card border-rose-300 p-4 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
          {error}
        </div>
      )}

      {result && <Results result={result} />}
    </div>
  )
}

/**
 * The tier switch.
 *
 * The app runs at tier 1 — structured queries plus BM25 — on any device, with
 * no download. The model buys tier 2, and the panel says so plainly rather than
 * pretending the app is broken without it.
 */
function SemanticTier({ state, onEnable }: { state: EmbedderState; onEnable: () => void }) {
  if (state.status === 'ready') {
    return (
      <div className="card flex items-center gap-3 border-violet-300 bg-violet-50/60 p-3 text-sm dark:border-violet-900 dark:bg-violet-950/30">
        <EngineBadge engine="vector" size="xs" />
        <p className="text-violet-900 dark:text-violet-200">
          Semantic search is on. Queries are embedded on this device and fused with keyword
          ranking.
        </p>
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <span className="spinner h-4 w-4" />
          <p className="text-sm">Downloading the embedding model — {state.progress}%</p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div
            className="h-full rounded-full bg-violet-500 transition-[width] duration-300"
            style={{ width: `${state.progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          Once. Cached in this browser, then it runs offline like everything else.
        </p>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-sm font-semibold">Semantic search is off</h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            Everything works without it: exact answers, keyword ranking, timelines, aggregation.
            Turning it on downloads a 25 MB embedding model that runs entirely on this device, and
            lets a search for <em>“clicking noise”</em> find a memory that only ever said{' '}
            <em>“rattle”</em>.
          </p>
          {state.status === 'error' && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
          )}
        </div>
        <button onClick={onEnable} className="btn-ghost shrink-0 text-sm">
          Enable semantic search
        </button>
      </div>
    </div>
  )
}

function Results({ result }: { result: RecallResult }) {
  return (
    <div className="space-y-8">
      {result.answer && (
        <section className="card-raised overflow-hidden">
          {/* Provenance sits above the answer, not under it. Who computed this
              is part of reading it, not a footnote. */}
          <div className="flex flex-wrap items-center gap-2.5 border-b bg-stone-50/80 px-5 py-3 dark:bg-stone-900/60">
            <EngineBadge engine={result.answer.engine} />
            <span className="text-xs leading-snug text-stone-500 dark:text-stone-400">
              {result.answer.method}
            </span>
          </div>

          <div className="px-5 py-6 md:px-6">
            <p className="font-serif text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              {result.answer.headline}
            </p>
            <div className="mt-3 space-y-2">
              {result.answer.lines.map((line, i) => (
                <p
                  key={i}
                  className="max-w-2xl text-[15px] leading-relaxed text-stone-600 dark:text-stone-300"
                >
                  {line}
                </p>
              ))}
            </div>

            {result.answer.entity && (
              <Link href={`/entity/${result.answer.entity._id}`} className="btn-ghost mt-5">
                <span aria-hidden>{result.answer.entity.icon}</span>
                Open {result.answer.entity.name}
              </Link>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="eyebrow">{result.answer ? 'Evidence' : 'Closest Memories'}</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {result.semanticUsed
              ? 'Keyword and vector rankings, fused'
              : 'Keyword ranking only — semantic search is off'}
          </p>
        </div>

        {result.evidence.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="text-3xl" aria-hidden>
              🔍
            </span>
            <p className="font-serif text-lg font-medium">Nothing matched</p>
            <p className="max-w-sm text-sm text-stone-500 dark:text-stone-400">
              Every word here is searched against memories you wrote. There is no corpus behind
              this beyond your own.
            </p>
          </div>
        ) : (
          <MemoryThread>
            {result.evidence.map((item, i) => (
              <MemoryCard key={item.memory._id} memory={item.memory} index={i}>
                <div className="mt-2.5 border-t pt-2.5">
                  <RankMarks textRank={item.textRank} vectorRank={item.vectorRank} />
                </div>
              </MemoryCard>
            ))}
          </MemoryThread>
        )}
      </section>

      <Inspector result={result} />
    </div>
  )
}

function Inspector({ result }: { result: RecallResult }) {
  const stages: Array<[string, string, boolean]> = [
    ['Classify', `intent: ${result.intent}`, true],
    ['Resolve entity', 'BM25 over entity names, models, serials', true],
    [
      'Structured',
      result.answer && result.answer.engine !== 'hybrid'
        ? 'answered exactly'
        : 'no exact answer for this shape',
      !!result.answer,
    ],
    ['Keyword (BM25)', `${result.evidence.filter((e) => e.textRank !== null).length} hits`, true],
    [
      'Vector (HNSW)',
      result.semanticUsed
        ? `${result.evidence.filter((e) => e.vectorRank !== null).length} hits`
        : 'off',
      result.semanticUsed,
    ],
    ['Fusion (RRF)', result.semanticUsed ? 'reciprocal rank fusion' : 'not needed', result.semanticUsed],
  ]

  return (
    <details className="card overflow-hidden">
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium select-none">
        How this was answered
        <span className="tnum ml-2 font-normal text-stone-500 dark:text-stone-400">
          {result.timings.totalMs.toFixed(1)} ms, entirely on-device
        </span>
      </summary>

      <div className="space-y-4 border-t px-5 py-4">
        <ol className="space-y-1.5">
          {stages.map(([name, detail, ran]) => (
            <li key={name} className="flex items-baseline gap-3 text-sm">
              <span className={ran ? 'text-emerald-600 dark:text-emerald-400' : 'opacity-30'}>
                {ran ? '●' : '○'}
              </span>
              <span className={`w-36 shrink-0 ${ran ? '' : 'text-stone-400 dark:text-stone-600'}`}>
                {name}
              </span>
              <span className="text-xs text-stone-500 dark:text-stone-400">{detail}</span>
            </li>
          ))}
        </ol>

        <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-stone-500 dark:text-stone-400">Structured</dt>
            <dd className="tnum mt-0.5 font-medium">{result.timings.structuredMs.toFixed(1)} ms</dd>
          </div>
          <div>
            <dt className="text-stone-500 dark:text-stone-400">Retrieval</dt>
            <dd className="tnum mt-0.5 font-medium">{result.timings.retrievalMs.toFixed(1)} ms</dd>
          </div>
          {result.execution && (
            <>
              <div>
                <dt className="text-stone-500 dark:text-stone-400">Index path</dt>
                <dd className="mt-0.5 font-medium uppercase">{result.execution.path}</dd>
              </div>
              <div>
                <dt className="text-stone-500 dark:text-stone-400">Distances computed</dt>
                <dd className="tnum mt-0.5 font-medium">
                  {result.execution.distanceComputations.toLocaleString()}
                </dd>
              </div>
            </>
          )}
        </dl>

        {result.execution && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {result.execution.reason}
            {result.execution.efSearch !== null && ` · efSearch ${result.execution.efSearch}`}
          </p>
        )}

        <p className="border-t pt-3 text-xs text-stone-500 dark:text-stone-400">
          Engines used:{' '}
          <span className="inline-flex flex-wrap gap-1 align-middle">
            {result.engines.map((engine) => (
              <EngineBadge key={engine} engine={engine} size="xs" />
            ))}
          </span>
        </p>
      </div>
    </details>
  )
}
