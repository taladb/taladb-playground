'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { useTalaDB } from '@taladb/react'
import type { TalaDB, VectorIndexStatus } from 'taladb'
import { collections, VECTOR_DIM } from '@/lib/schema'
import { stats } from '@/lib/queries'
import { backfillEmbeddings } from '@/lib/mutations'
import { downloadPack, exportPack, importPack, type ImportReport } from '@/lib/memorypack'
import {
  embed, getEmbedderState, loadEmbedder, subscribeEmbedder, type EmbedderState,
} from '@/lib/embed'
import { useAsync } from '@/lib/use-async'
import { plural } from '@/lib/format'
import { EngineBadge } from '../components/EngineBadge'

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
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>

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
      <header className="border-b bg-stone-50 px-5 py-3 dark:bg-stone-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
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
          <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
          <dd className="tnum text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// --- semantic ---------------------------------------------------------------

function useEmbedderState(): EmbedderState {
  return useSyncExternalStore(subscribeEmbedder, getEmbedderState, () => getEmbedderState())
}

function SemanticPanel({ db, embedded, total }: { db: TalaDB; embedded: number; total: number }) {
  const state = useEmbedderState()
  const [backfill, setBackfill] = useState<{ done: number; total: number } | null>(null)
  const missing = total - embedded

  async function runBackfill() {
    await loadEmbedder()
    setBackfill({ done: 0, total: missing })
    const done = await backfillEmbeddings(db, (d, t) => setBackfill({ done: d, total: t }))
    setBackfill({ done, total: done })
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
          [
            'Status',
            state.status === 'ready'
              ? 'Loaded and running on-device'
              : state.status === 'loading'
                ? `Downloading — ${state.progress}%`
                : state.status === 'error'
                  ? state.message
                  : 'Not downloaded',
          ],
          ['Memories embedded', `${embedded.toLocaleString()} / ${total.toLocaleString()}`],
        ]}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {state.status !== 'ready' && (
          <button onClick={() => void loadEmbedder()} className="btn-ghost text-sm">
            Download model (~25 MB)
          </button>
        )}
        {missing > 0 && (
          <button onClick={() => void runBackfill()} className="btn-ghost text-sm">
            Embed {plural(missing, 'remaining memory', 'remaining memories')}
          </button>
        )}
      </div>

      {backfill && (
        <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
          Embedded {backfill.done} of {backfill.total}.
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
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
  const abort = useRef<AbortController | null>(null)

  const status = useAsync<VectorIndexStatus | null>(async () => {
    const { memories } = collections(db)
    const indexes = await memories.listIndexes()
    if (!indexes.vector.includes('embedding')) return null
    return memories.vectorIndexStatus('embedding')
  }, [db, nonce])

  async function doRebuild() {
    setBusy('rebuild')
    abort.current = new AbortController()
    try {
      await collections(db).memories.rebuildVectorIndex('embedding', {
        batchSize: 32,
        signal: abort.current.signal,
        onProgress: (p) => setRebuild({ processed: p.processed, total: p.total, state: p.state }),
      })
      setNonce((n) => n + 1)
    } finally {
      setBusy(null)
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
      const queries = await Promise.all(
        [
          'bike chain replaced',
          'aircon not cooling',
          'lent to a friend',
          'warranty expiring soon',
          'strange noise when braking',
          'bought a new appliance',
          'moved to storage',
          'coffee beans',
        ].map((q) => embed(q)),
      )
      const report = await collections(db).memories.measureVectorRecall(
        'embedding',
        queries,
        10,
        undefined,
        { efSearch: 100 },
      )
      setRecall(report)
    } finally {
      setBusy(null)
    }
  }

  const s = status.data

  return (
    <Panel
      title="Vector index"
      badge={<EngineBadge engine="vector" size="xs" />}
      description="Persistent HNSW graphs landed on the browser in TalaDB 0.11.4. Before that the browser had to fall back to an exact scan, because the graph needed native threads."
    >
      {status.loading && <p className="text-sm text-stone-500">Reading index status…</p>}

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

      {!s && !status.loading && (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          No vector index yet — it is created once memories have embeddings.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => void doRebuild()} disabled={!!busy} className="btn-ghost text-sm">
          {busy === 'rebuild' ? 'Rebuilding…' : 'Rebuild index'}
        </button>
        <button onClick={() => void doMeasure()} disabled={!!busy} className="btn-ghost text-sm">
          {busy === 'recall' ? 'Measuring…' : 'Measure recall vs exact'}
        </button>
        {busy === 'rebuild' && (
          <button onClick={() => abort.current?.abort()} className="btn-ghost text-sm">
            Cancel
          </button>
        )}
      </div>

      {rebuild && (
        <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
          {rebuild.state} — {rebuild.processed} / {rebuild.total}. Rebuilds run in batches and keep
          the live graph available until the replacement is published atomically.
        </p>
      )}

      {recall && (
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
          <Rows
            rows={[
              ['Recall@10', `${(recall.recallAtK * 100).toFixed(1)}%`],
              ['Exact search', `${recall.exactMs.toFixed(1)} ms`],
              ['Approximate (HNSW)', `${recall.annMs.toFixed(1)} ms`],
              ['Queries measured', recall.queries],
            ]}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-violet-900 dark:text-violet-300">
            At this corpus size exact search is already fast, so the interesting number is the
            recall, not the speed-up — the graph is worth its cost at tens of thousands of vectors,
            not hundreds.
          </p>
        </div>
      )}
    </Panel>
  )
}

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
                <span key={`b-${f}`} className="chip border-sky-300 bg-sky-50 py-0.5 font-mono text-[10px] text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
                  {f}
                </span>
              ))}
              {info.fts.map((f) => (
                <span key={`f-${f}`} className="chip border-amber-300 bg-amber-50 py-0.5 font-mono text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                  fts:{f}
                </span>
              ))}
              {info.vector.map((f) => (
                <span key={`v-${f}`} className="chip border-violet-300 bg-violet-50 py-0.5 font-mono text-[10px] text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
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
        <p className="text-sm text-stone-500">Reading storage info…</p>
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

      <p className="mt-3 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
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

  async function doExport(includeEmbeddings: boolean) {
    setBusy(true)
    try {
      downloadPack(await exportPack(db, { includeEmbeddings }))
    } finally {
      setBusy(false)
    }
  }

  async function doImport(file: File) {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      setReport(await importPack(db, JSON.parse(await file.text())))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
        <input
          ref={fileInput}
          type="file"
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
        <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
          Imported {report.entities} things, {report.memories} memories, {report.relations}{' '}
          connections.{' '}
          {report.skipped > 0 && `${report.skipped} were already here and were left alone.`}
        </p>
      )}

      {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <p className="mt-4 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
        Importing the same pack twice is safe: documents keep their ids, so the second run is
        refused per-document rather than creating a second copy of everything.
      </p>
    </Panel>
  )
}
