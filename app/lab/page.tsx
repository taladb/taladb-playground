'use client'

import { useEffect, useRef, useState } from 'react'
import { openDB, type TalaDB, type VectorCacheStats, type VectorQuantization } from 'taladb'
import {
  benchAnn, benchDocuments, benchExact, buildLabGraph, LAB_DB, LAB_EF, LAB_SIZES, labCache,
  labCollection, labQueries, populate, clearLab, type DocumentBench, type VectorRun,
} from '@/lib/lab'
import { HNSW_FROM } from '@/lib/schema'
import { EngineBadge } from '../components/EngineBadge'

/**
 * The scale lab.
 *
 * Keepsake holds a few hundred memories, which is the right size for a person
 * and too small to show what the engine does at volume. This page fills a
 * second, separate database with tens of thousands of synthetic memories and
 * measures — on this device, in this browser — the paths the app would take at
 * that size: indexed sorted pages, range scans, unindexed filters, an exact
 * vector scan against an HNSW graph, and what the graph's speed costs in
 * recall. Nothing here touches the Keepsake database.
 */

interface Results {
  count: number
  writeMs: number | null
  indexMs: number | null
  documents: DocumentBench | null
  exact: VectorRun | null
  graphBuildMs: number | null
  quantization: VectorQuantization
  ann: VectorRun[]
  cache: VectorCacheStats | null
}

type Step = 'idle' | 'writing' | 'documents' | 'exact' | 'graph' | 'ann' | 'done'

const STEP_LABEL: Record<Step, string> = {
  idle: '',
  writing: 'Writing synthetic memories',
  documents: 'Measuring the document engine',
  exact: 'Measuring exact vector search',
  graph: 'Building the HNSW graph',
  ann: 'Measuring graph search and recall',
  done: 'Done',
}

const ms = (n: number) => `${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString()} ms`
const mib = (n: number) => `${(n / 2 ** 20).toFixed(1)} MiB`

export default function LabPage() {
  const [db, setDb] = useState<TalaDB | null>(null)
  const [existing, setExisting] = useState<number | null>(null)
  const [size, setSize] = useState<number>(LAB_SIZES[1])
  const [quantization, setQuantization] = useState<VectorQuantization>('binary')
  const [step, setStep] = useState<Step>('idle')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<Results | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  // Its own database, opened here and closed on the way out, so the lab can
  // never write into the visitor's Keepsake.
  useEffect(() => {
    let handle: TalaDB | null = null
    let cancelled = false
    openDB(LAB_DB)
      .then(async (opened) => {
        handle = opened
        if (cancelled) return opened.close()
        setDb(opened)
        setExisting(await labCollection(opened).count())
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
      abort.current?.abort()
      void handle?.close()
    }
  }, [])

  const busy = step !== 'idle' && step !== 'done'

  async function run(generate: boolean) {
    if (!db) return
    const controller = new AbortController()
    abort.current = controller
    const stop = () => {
      if (controller.signal.aborted) throw new Error('Stopped.')
    }

    setError(null)
    const count = generate ? size : existing ?? 0
    const out: Results = {
      count, writeMs: null, indexMs: null, documents: null, exact: null,
      graphBuildMs: null, quantization, ann: [], cache: null,
    }
    setResults({ ...out })

    try {
      if (generate) {
        setStep('writing')
        const t = await populate(db, size, (p) => setProgress({ done: p.loaded, total: p.total }))
        Object.assign(out, t)
        setExisting(size)
        setResults({ ...out })
      }
      stop()

      setStep('documents')
      out.documents = await benchDocuments(db)
      setResults({ ...out })
      stop()

      const queries = labQueries()
      setStep('exact')
      out.exact = await benchExact(db, queries)
      setResults({ ...out })
      stop()

      setStep('graph')
      setProgress(null)
      out.graphBuildMs = (
        await buildLabGraph(db, {
          quantization,
          signal: controller.signal,
          onProgress: (done, total) => setProgress({ done, total }),
        })
      ).buildMs
      setResults({ ...out })
      stop()

      setStep('ann')
      for (const ef of LAB_EF) {
        out.ann = [...out.ann, await benchAnn(db, queries, ef)]
        setResults({ ...out })
        stop()
      }

      out.cache = await labCache(db)
      setResults({ ...out })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('idle')
    } finally {
      setProgress(null)
    }
  }

  async function clear() {
    if (!db) return
    setError(null)
    try {
      await clearLab(db)
      setExisting(0)
      setResults(null)
      setStep('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight md:text-4xl">Scale Lab</h1>
        <p className="mt-2 max-w-2xl text-sm muted">
          Your memory holds a few hundred entries, and at that size every query is cheap however it
          runs. This fills a separate database in this browser with tens of thousands of synthetic
          memories and measures what the engine does at that size — on this device, with nothing
          sent anywhere. Your own memories are not touched.
        </p>
      </section>

      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="segmented" role="group" aria-label="Corpus size">
            {LAB_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => setSize(n)}
                aria-pressed={size === n}
                disabled={busy}
                className="segment tnum"
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="muted">Graph vectors</span>
            <select
              value={quantization}
              onChange={(e) => setQuantization(e.target.value as VectorQuantization)}
              disabled={busy}
              className="field w-auto py-1.5"
            >
              <option value="binary">Binary-quantized (builds ~2× faster)</option>
              <option value="none">Full precision</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => void run(true)} disabled={!db || busy} className="btn-primary text-sm">
            Generate {size.toLocaleString()} and measure
          </button>
          {!!existing && (
            <button onClick={() => void run(false)} disabled={busy} className="btn-ghost text-sm">
              Measure the {existing.toLocaleString()} already here
            </button>
          )}
          {busy ? (
            <button onClick={() => abort.current?.abort()} className="btn-ghost text-sm">
              Stop
            </button>
          ) : (
            !!existing && (
              <button onClick={() => void clear()} className="btn-ghost text-sm">
                Clear lab
              </button>
            )
          )}
        </div>

        {busy && (
          <div>
            <p role="status" aria-live="polite" className="text-sm">
              <span className="spinner mr-2 inline-block h-3.5 w-3.5 align-[-2px]" />
              {STEP_LABEL[step]}
              {progress && progress.total > 0 && (
                <span className="tnum muted"> — {progress.done.toLocaleString()} / {progress.total.toLocaleString()}</span>
              )}
            </p>
            {step === 'graph' && (
              <p className="mt-1 text-xs muted">
                The longest step: every vector is linked into the graph. Search keeps working on the
                exact index until the finished graph is published.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-[var(--color-ios-red)]">{error}</p>}
      </section>

      {results && <ResultsView results={results} />}
    </div>
  )
}

function ResultsView({ results }: { results: Results }) {
  const { documents: d, exact, ann } = results
  return (
    <div className="space-y-6">
      {results.writeMs !== null && (
        <p className="text-sm muted">
          Wrote {results.count.toLocaleString()} memories in {ms(results.writeMs)} and indexed them in{' '}
          {ms(results.indexMs ?? 0)}.
        </p>
      )}

      {d && (
        <section className="card overflow-hidden">
          <Header
            title="Document engine"
            badge={<EngineBadge engine="structured" size="xs" />}
            note="Median of nine runs. What a timeline, a date filter and an unindexed search cost at this size."
          />
          <Table
            rows={[
              ['Oldest 10, sorted by date', ms(d.oldestPageMs),
                'Reads ten index entries and stops (0.13). Before, the whole index was copied to make one page.'],
              ['Newest 10, sorted by date', ms(d.newestPageMs),
                'Still walks the index backwards, but holds only the page — memory is bounded by the limit.'],
              [`One month by date (${d.monthRangeRows.toLocaleString()} rows)`, ms(d.monthRangeMs),
                'One scan between two index keys (0.13), instead of two open-ended halves intersected.'],
              ['Unindexed filter, no match', ms(d.unindexedMissMs),
                'Decodes only the field the filter reads — never the 384-float vector on each document (0.13).'],
            ]}
          />
        </section>
      )}

      {exact && (
        <section className="card overflow-hidden">
          <Header
            title="Vector engine"
            badge={<EngineBadge engine="vector" size="xs" />}
            note={`Median per query over 20 queries, top 10. Exact search compares every vector and is the ground truth recall is measured against.${
              results.graphBuildMs !== null
                ? ` The graph took ${ms(results.graphBuildMs)} to build (M 16, efConstruction 200, ${results.quantization === 'binary' ? 'binary-quantized' : 'full precision'}).`
                : ''
            }`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs muted">
                  <th className="px-5 py-2 font-medium">Search</th>
                  <th className="px-3 py-2 text-right font-medium">Time</th>
                  <th className="px-3 py-2 text-right font-medium">Distances</th>
                  <th className="px-5 py-2 text-right font-medium">Recall@10</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {[exact, ...ann].map((r) => (
                  <tr key={r.efSearch ?? 'exact'} className="border-t">
                    <td className="px-5 py-2">
                      {r.efSearch === null ? 'Exact scan' : `HNSW, efSearch ${r.efSearch}`}
                    </td>
                    <td className="px-3 py-2 text-right">{ms(r.medianMs)}</td>
                    <td className="px-3 py-2 text-right">{r.distances.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right">
                      {r.recallAt10 === null ? '—' : `${(r.recallAt10 * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ann.length > 0 && (
            <p className="border-t px-5 py-3 text-sm leading-relaxed">
              {ann.some((r) => r.medianMs < exact.medianMs && (r.recallAt10 ?? 0) >= 0.95)
                ? 'On this device the graph is already faster than the exact scan at high recall.'
                : `On this device the exact scan is still the faster search at ${results.count.toLocaleString()} memories — and always the exact one. That is why Keepsake keeps its exact index until ${HNSW_FROM.toLocaleString()}.`}
            </p>
          )}
          {ann.length > 0 && (
            <p className="border-t px-5 py-3 text-xs leading-relaxed muted">
              The graph compares a fraction of the vectors the exact scan does. Whether that is
              faster depends on how much of the corpus fits in the cache below: a vector read
              from storage costs far more than a distance. Raising efSearch buys recall with work.
              Recall here is measured against exact search on this corpus, not quoted.
            </p>
          )}
        </section>
      )}

      {results.cache && (
        <section className="card overflow-hidden">
          <Header
            title="Cache"
            note={`One budget covers every decoded vector and graph. In the browser and on phones it starts at 8 MiB${
              results.cache.policy === 'adaptive' ? ' and adapts to the memory this device reports' : ''
            }; native starts at 64 MiB. A ${results.count.toLocaleString()} × 384 corpus is ${mib(results.count * 384 * 4)} of vectors.`}
          />
          <Table
            rows={[
              ['Budget', `${mib(results.cache.budgetBytes)} (${results.cache.policy})`, ''],
              ['Held now', mib(results.cache.retainedBytes),
                'Vectors that do not all fit are partly kept in spare budget (0.13), so a repeated exact search decodes only the rest.'],
              ['Peak', mib(results.cache.peakBytes), ''],
            ]}
          />
        </section>
      )}
    </div>
  )
}

function Header({ title, badge, note }: { title: string; badge?: React.ReactNode; note?: string }) {
  return (
    <header className="px-5 py-3.5" style={{ boxShadow: 'inset 0 -0.5px 0 var(--color-separator)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {badge}
      </div>
      {note && <p className="mt-1 text-xs leading-relaxed muted">{note}</p>}
    </header>
  )
}

function Table({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <dl className="divide-y text-sm">
      {rows.map(([label, value, why]) => (
        <div key={label} className="px-5 py-2.5">
          <div className="flex items-baseline justify-between gap-4">
            <dt>{label}</dt>
            <dd className="tnum shrink-0 font-medium">{value}</dd>
          </div>
          {why && <p className="mt-0.5 text-xs leading-relaxed muted">{why}</p>}
        </div>
      ))}
    </dl>
  )
}
