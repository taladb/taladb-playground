'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useTalaDB } from '@taladb/react'
import type { MemoryPressure, TalaDB, VectorCacheStats, VectorIndexStatus } from 'taladb'
import {
  buildGraphIndex, collections, HNSW_FROM, returnToExactIndex, VECTOR_DIM,
} from '@/lib/schema'
import { resetDemoCorpus } from '@/lib/seed'
import { stats } from '@/lib/queries'
import { backfillEmbeddings } from '@/lib/mutations'
import { downloadPack, exportPack, importPack, type ImportReport } from '@/lib/memorypack'
import { embedMany, loadEmbedder, useEmbedderState } from '@/lib/embed'
import { useAsync } from '@/lib/use-async'
import { plural } from '@/lib/format'
import { EngineBadge } from '../components/EngineBadge'
import { ModelCard, modelStatusLabel } from '../components/ModelStatus'
import { PageHeader } from '../components/PageHeader'
import { ThemeSegmented } from '../components/ThemeToggle'
import { ConfirmDialog } from '../components/Dialog'
import { useToast } from '../components/Toast'

/**
 * Settings, and the engine room.
 *
 * Most of this page exists because the claims the rest of the app makes are
 * checkable, and a demo that says "runs on-device" should let you look. The
 * index panel reports what TalaDB actually built, the storage panel reports
 * what the browser actually granted, and the recall panel measures approximate
 * search against exact ground truth on this machine rather than quoting a
 * benchmark from somewhere else.
 */
export default function SettingsPage() {
  const db = useTalaDB()
  const counts = useAsync(() => stats(db), [db])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Appearance, the on-device model, and the engine room: what TalaDB actually built in this browser, and your data in and out."
      />

      <Panel title="Appearance">
        <ThemeSegmented />
      </Panel>

      <SemanticPanel db={db} embedded={counts.data?.embedded ?? 0} total={counts.data?.memoryCount ?? 0} />
      <VectorPanel db={db} />
      <IndexPanel db={db} />
      <StoragePanel db={db} />
      <DataPanel db={db} />
    </div>
  )
}

function Panel({
  title,
  badge,
  description,
  children,
}: {
  title: string
  badge?: React.ReactNode
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="card overflow-hidden">
      <header className="px-5 py-3.5" style={{ boxShadow: 'inset 0 -0.5px 0 var(--color-separator)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-xs leading-relaxed muted">
            {description}
          </p>
        )}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function Rows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="muted">{label}</dt>
          <dd className="tnum text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// --- semantic ---------------------------------------------------------------

function SemanticPanel({ db, embedded, total }: { db: TalaDB; embedded: number; total: number }) {
  const state = useEmbedderState()
  const [backfill, setBackfill] = useState<{ done: number; total: number } | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const missing = total - embedded

  async function runBackfill() {
    // Two runs at once would both read the same un-embedded rows and embed
    // each of them twice.
    if (backfilling) return
    setBackfilling(true)
    setError(null)
    try {
      await loadEmbedder()
      setBackfill({ done: 0, total: missing })
      const done = await backfillEmbeddings(db, (d, t) => setBackfill({ done: d, total: t }))
      setBackfill({ done, total: done })
    } catch (err) {
      setError(message(err))
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <Panel
      title="Semantic search"
      badge={<EngineBadge engine="vector" size="xs" />}
      description="An embedding model that runs entirely in this browser. Everything else in the app works without it — this only adds search by meaning."
    >
      <Rows
        rows={[
          ['Model', <span key="m" className="font-mono text-xs">all-MiniLM-L6-v2</span>],
          ['Dimensions', VECTOR_DIM],
          ['Status', modelStatusLabel(state)],
          ['Memories embedded', `${embedded.toLocaleString()} / ${total.toLocaleString()}`],
        ]}
      />

      {state.status !== 'ready' && (
        <div className="mt-4">
          <ModelCard compact />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {missing > 0 && (
          <button onClick={() => void runBackfill()} disabled={backfilling} className="btn-ghost text-sm">
            {backfilling ? 'Embedding…' : `Embed ${plural(missing, 'remaining memory', 'remaining memories')}`}
          </button>
        )}
      </div>

      {backfill && (
        <p className="mt-3 text-xs muted">
          Embedded {backfill.done} of {backfill.total}.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-[var(--color-ios-red)]">{error}</p>}

      <p className="mt-4 text-xs leading-relaxed muted">
        Vectors are never treated as canonical. Every one can be regenerated from the memory text,
        which is why the export leaves them out and why losing them costs nothing but time.
      </p>
    </Panel>
  )
}

// --- vector index -----------------------------------------------------------

function VectorPanel({ db }: { db: TalaDB }) {
  const [nonce, setNonce] = useState(0)
  const [rebuild, setRebuild] = useState<{ processed: number; total: number; state: string } | null>(null)
  const [recall, setRecall] = useState<{ recallAtK: number; exactMs: number; annMs: number; queries: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const status = useAsync<VectorIndexStatus | null>(async () => {
    const { memories } = collections(db)
    const indexes = await memories.listIndexes()
    if (!indexes.vector.includes('embedding')) return null
    return memories.vectorIndexStatus('embedding')
  }, [db, nonce])

  // One budget covers every decoded vector and graph in the database (0.12),
  // sized from the device's memory hint and shrunk under memory pressure.
  const cache = useAsync<VectorCacheStats | null>(
    () => collections(db).memories.vectorCacheStats().catch(() => null),
    [db, nonce],
  )

  /**
   * Build (or rebuild) the graph. On an exact index this *promotes* it to a
   * persistent HNSW graph — the engine has no "rebuild exact" — so the button
   * says what it does, and "Back to exact index" undoes it.
   */
  async function doBuildGraph() {
    setBusy('rebuild')
    setError(null)
    setRecall(null)
    const controller = new AbortController()
    abort.current = controller
    try {
      await buildGraphIndex(db, {
        signal: controller.signal,
        onProgress: (p) => setRebuild({ processed: p.processed, total: p.total, state: p.state }),
      })
    } catch (err) {
      if (!controller.signal.aborted) setError(message(err))
    } finally {
      setBusy(null)
      setNonce((n) => n + 1)
    }
  }

  async function doReturnToExact() {
    setBusy('exact')
    setError(null)
    setRecall(null)
    setRebuild(null)
    try {
      await returnToExactIndex(db)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(null)
      setNonce((n) => n + 1)
    }
  }

  /**
   * Tell the engine the device is short of memory, as the browser or OS would.
   * The shared budget drops and decoded vectors and graphs are given up; the
   * next search simply decodes again. "Recover" restores the budget.
   */
  async function doPressure(level: MemoryPressure) {
    setBusy('pressure')
    setError(null)
    try {
      await collections(db).memories.notifyMemoryPressure(level)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(null)
      setNonce((n) => n + 1)
    }
  }

  /**
   * Measure approximate search against exact ground truth, here, on this
   * machine, over this corpus. `measureVectorRecall` runs both paths on the
   * same snapshot and reports recall@k with the timings — which is the only
   * honest way to talk about ANN quality, since it depends entirely on the
   * embedding model and the data.
   */
  async function doMeasure() {
    setBusy('recall')
    try {
      await loadEmbedder()
      const queries = await embedMany([
        'bike chain replaced',
        'aircon not cooling',
        'lent to a friend',
        'warranty expiring soon',
        'strange noise when braking',
        'bought a new appliance',
        'moved to storage',
        'coffee beans',
      ])
      const report = await collections(db).memories.measureVectorRecall(
        'embedding',
        queries,
        10,
        undefined,
        { efSearch: 100 },
      )
      setRecall(report)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(null)
    }
  }

  const s = status.data
  const isGraph = !!s && s.state !== 'flat'

  return (
    <Panel
      title="Vector index"
      badge={<EngineBadge engine="vector" size="xs" />}
      description={
        isGraph && s.totalVectors < HNSW_FROM
          ? `You built an HNSW graph to compare. The app would not choose one below ${HNSW_FROM.toLocaleString()} vectors: at this size it is approximate and does not save enough work to be faster. Measure it, then go back to exact.`
          : 'Semantic search runs against an exact index here, on purpose: at a few hundred memories a full scan is well under a millisecond, so an approximate graph would be slower and less accurate at once. TalaDB builds a persistent HNSW graph instead once the collection is large enough to be worth it.'
      }
    >
      {status.loading && <p className="text-sm muted">Reading index status…</p>}

      {s && (
        <Rows
          rows={[
            ['State', <span key="s" className="uppercase">{s.state}</span>],
            ['Persistent', s.persistent ? 'yes — survives reload, no rebuild' : 'in memory only'],
            ['Vectors indexed', `${s.indexedVectors.toLocaleString()} / ${s.totalVectors.toLocaleString()}`],
            ['Deleted nodes', s.deletedNodes.toLocaleString()],
            ['Revision', s.revision],
            ...(s.options
              ? ([
                  ['Graph M', s.options.m],
                  ['efConstruction', s.options.efConstruction],
                  ['Quantization', s.options.quantization],
                ] as Array<[string, React.ReactNode]>)
              : []),
          ]}
        />
      )}

      {cache.data && (
        <div className="mt-4 border-t pt-4">
          <Rows
            rows={[
              ['Cache budget', `${mib(cache.data.budgetBytes)} (${cache.data.policy})`],
              ['Decoded and held', mib(cache.data.retainedBytes)],
              ['Memory pressure', cache.data.pressure],
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {cache.data.pressure === 'normal' ? (
              <button onClick={() => void doPressure('critical')} disabled={!!busy} className="btn-ghost text-sm">
                Simulate memory pressure
              </button>
            ) : (
              <button onClick={() => void doPressure('normal')} disabled={!!busy} className="btn-ghost text-sm">
                Recover
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed muted">
            Under pressure the budget shrinks and decoded vectors are released. Searches keep
            working — they decode from disk again — so the app degrades in speed, never in answers.
          </p>
        </div>
      )}

      {!s && !status.loading && (
        <p className="text-sm muted">
          No vector index yet — it is created once memories have embeddings.
        </p>
      )}

      {s?.state === 'flat' && (
        <p
          className="muted mt-3 rounded-[12px] p-3 text-[12px] leading-relaxed"
          style={{ background: 'color-mix(in oklab, var(--color-ios-gray) 12%, transparent)' }}
        >
          Every search here compares against all {s.totalVectors.toLocaleString()} vectors and
          returns the true nearest neighbours. There is no recall to measure, because nothing is
          being approximated.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {s && (
          <button onClick={() => void doBuildGraph()} disabled={!!busy} className="btn-ghost text-sm">
            {busy === 'rebuild' ? 'Building graph…' : isGraph ? 'Rebuild graph' : 'Try an HNSW graph'}
          </button>
        )}
        {isGraph && (
          <button onClick={() => void doMeasure()} disabled={!!busy} className="btn-ghost text-sm">
            {busy === 'recall' ? 'Measuring…' : 'Measure recall vs exact'}
          </button>
        )}
        {isGraph && s.totalVectors < HNSW_FROM && (
          <button onClick={() => void doReturnToExact()} disabled={!!busy} className="btn-ghost text-sm">
            {busy === 'exact' ? 'Switching…' : 'Back to exact index'}
          </button>
        )}
        {busy === 'rebuild' && (
          <button onClick={() => abort.current?.abort()} className="btn-ghost text-sm">
            Cancel
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-[var(--color-ios-red)]">{error}</p>}

      <p className="mt-4 text-xs muted">
        At a few hundred memories the trade-offs above barely show.{' '}
        <Link href="/lab" style={{ color: 'var(--color-ios-blue)' }}>
          See them at 10,000 in the Scale Lab
        </Link>
        .
      </p>

      {rebuild && (
        <p className="mt-3 text-xs muted">
          {rebuild.state} — {rebuild.processed} / {rebuild.total}. Rebuilds run in batches and keep
          the live graph available until the replacement is published atomically.
        </p>
      )}

      {recall && (
        <div className="mt-4 rounded-[12px] p-3"
          style={{ background: 'color-mix(in oklab, var(--color-ios-purple) 12%, transparent)' }}>
          <Rows
            rows={[
              ['Recall@10', `${(recall.recallAtK * 100).toFixed(1)}%`],
              ['Exact search', `${recall.exactMs.toFixed(1)} ms`],
              ['Approximate (HNSW)', `${recall.annMs.toFixed(1)} ms`],
              ['Queries measured', recall.queries],
            ]}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ios-purple)]">
            At this corpus size exact search is already fast, so the interesting number is the
            recall, not the speed-up — the graph is worth its cost at tens of thousands of vectors,
            not hundreds.
          </p>
        </div>
      )}
    </Panel>
  )
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

const mib = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MiB`

// --- document indexes -------------------------------------------------------

function IndexPanel({ db }: { db: TalaDB }) {
  const indexes = useAsync(async () => {
    const cols = collections(db)
    const names = ['entities', 'memories', 'relations', 'attachments'] as const
    return Promise.all(
      names.map(async (name) => ({
        name,
        info: await cols[name].listIndexes(),
      })),
    )
  }, [db])

  return (
    <Panel
      title="Indexes"
      badge={<EngineBadge engine="structured" size="xs" />}
      description="What the engine actually built. B-tree indexes serve filters and ranges, FTS serves BM25 ranking, and the vector index serves similarity — memories carry all three, which is what makes one hybrid query possible."
    >
      <div className="space-y-4">
        {indexes.data?.map(({ name, info }) => (
          <div key={name}>
            <p className="font-mono text-xs font-semibold">{name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {info.btree.map((f) => (
                <span key={`b-${f}`} className="chip py-0.5 font-mono text-[10px]">
                  {f}
                </span>
              ))}
              {info.fts.map((f) => (
                <span key={`f-${f}`} className="chip py-0.5 font-mono text-[10px]">
                  fts:{f}
                </span>
              ))}
              {info.vector.map((f) => (
                <span key={`v-${f}`} className="chip py-0.5 font-mono text-[10px]">
                  vec:{f}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// --- storage ----------------------------------------------------------------

function StoragePanel({ db }: { db: TalaDB }) {
  const [compacting, setCompacting] = useState(false)
  const info = useAsync(async () => (await db.storageInfo?.()) ?? null, [db])

  return (
    <Panel
      title="Storage"
      description="Where the database physically lives in this browser, and what the browser granted it."
    >
      {info.data ? (
        <Rows
          rows={[
            ['Backend', info.data.storage === 'opfs' ? 'OPFS (origin private file system)' : 'IndexedDB fallback'],
            ['Durable writes', info.data.durableWrites ? 'yes' : 'no — snapshots are debounced'],
            ['HNSW available', info.data.hnsw ? 'yes' : 'no — exact search only'],
            ['This tab owns storage', info.data.owner ? 'yes' : 'no — reads go through the owning tab'],
            ...(info.data.storageError
              ? ([['Storage error', info.data.storageError]] as Array<[string, React.ReactNode]>)
              : []),
          ]}
        />
      ) : (
        <p className="text-sm muted">Reading storage info…</p>
      )}

      <button
        onClick={async () => {
          setCompacting(true)
          try {
            await db.compact()
          } finally {
            setCompacting(false)
          }
        }}
        disabled={compacting}
        className="btn-ghost mt-4 text-sm"
      >
        {compacting ? 'Compacting…' : 'Compact database'}
      </button>

      <p className="mt-3 text-xs leading-relaxed muted">
        Multiple tabs share one database through the owning tab, so a write here shows up in the
        others without a refresh. Ownership moves automatically if this tab closes.
      </p>
    </Panel>
  )
}

// --- data -------------------------------------------------------------------

function DataPanel({ db }: { db: TalaDB }) {
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const [resetDone, setResetDone] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const toast = useToast()

  async function doExport(includeEmbeddings: boolean) {
    setBusy(true)
    setError(null)
    try {
      downloadPack(await exportPack(db, { includeEmbeddings }))
      toast('Export saved to your downloads')
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  async function doReset() {
    setBusy(true)
    setError(null)
    setReport(null)
    setResetDone(false)
    try {
      await resetDemoCorpus(db)
      setResetDone(true)
      toast('Sample memories restored')
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
      setConfirmReset(false)
    }
  }

  async function doImport(file: File) {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const next = await importPack(db, JSON.parse(await file.text()))
      setReport(next)
      toast(`Imported ${plural(next.memories, 'memory', 'memories')}`)
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Your data"
      description="Plain JSON. No key needed to read it, nothing in it that only this app can interpret."
    >
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void doExport(false)} disabled={busy} className="btn-ghost text-sm">
          Export
        </button>
        <button onClick={() => void doExport(true)} disabled={busy} className="btn-ghost text-sm">
          Export with vectors
        </button>
        <button onClick={() => fileInput.current?.click()} disabled={busy} className="btn-ghost text-sm">
          Import a pack
        </button>
        <button onClick={() => setConfirmReset(true)} disabled={busy} className="btn-ghost text-sm">
          Reset sample memories
        </button>
        <input
          ref={fileInput}
          type="file"
          aria-label="Choose a memory pack to import"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void doImport(file)
            e.target.value = ''
          }}
        />
      </div>

      {report && (
        <p className="mt-3 text-xs muted">
          Imported {report.entities} things, {report.memories} memories, {report.relations}{' '}
          connections.{' '}
          {report.skipped > 0 && `${report.skipped} were already here and were left alone. `}
          {report.invalid > 0 && (
            <span className="text-[var(--color-ios-red)]">
              {plural(report.invalid, 'row was', 'rows were')} not valid and could not be imported.
            </span>
          )}
        </p>
      )}

      {resetDone && (
        <p className="mt-3 text-xs muted">
          The demo corpus is back as it shipped, dated up to today. Your own memories are untouched.
        </p>
      )}

      {error && <p className="mt-3 text-xs text-[var(--color-ios-red)]">{error}</p>}

      <ConfirmDialog
        open={confirmReset}
        title="Reset the sample memories?"
        confirmLabel="Reset samples"
        busy={busy}
        onConfirm={() => void doReset()}
        onClose={() => setConfirmReset(false)}
      >
        <p>
          The demo household’s memories, things and connections go back to how they shipped,
          dated up to today. Edits or deletions you made to sample memories are undone.
        </p>
        <p className="font-medium text-[var(--color-label)]">
          Memories you wrote yourself are not touched.
        </p>
      </ConfirmDialog>

      <p className="mt-4 text-xs leading-relaxed muted">
        Importing the same pack twice is safe: documents keep their ids, so the second run is
        refused per-document rather than creating a second copy of everything.
      </p>
    </Panel>
  )
}
