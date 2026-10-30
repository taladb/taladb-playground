'use client'

import Link from 'next/link'
import { useTalaDB } from '@taladb/react'
import { collections, EMBEDDING_MODEL, VECTOR_DIM } from '@/lib/schema'
import { useEmbedderState } from '@/lib/embed'
import { useAsync } from '@/lib/use-async'
import { EngineBadge } from '../components/EngineBadge'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { modelStatusLabel } from '../components/ModelStatus'
import type { Engine } from '@/lib/retrieval'

/**
 * How it works — the claims, in plain words, with the evidence underneath.
 *
 * The top half is for anyone: where the data lives, what the network is and is
 * not used for, how each kind of search finds things. The bottom half is for
 * developers and reads its values live from the engine, so it cannot drift
 * from what this browser is actually running.
 */

const WAYS: Array<{ engine: Engine; title: string; body: string; q: string; mode: string }> = [
  {
    engine: 'structured',
    title: 'Exact answers',
    body: 'Questions with a computable answer — a total, a loan, a warranty date — are answered by indexed queries and aggregation. Nothing is guessed or generated.',
    q: 'how much have I spent maintaining the bike?',
    mode: 'auto',
  },
  {
    engine: 'keyword',
    title: 'Keyword search',
    body: 'BM25 full-text ranking finds the words you typed and rewards rare ones. Best for names, places and model numbers.',
    q: 'RT38K5930S8',
    mode: 'keyword',
  },
  {
    engine: 'vector',
    title: 'Semantic search',
    body: 'An embedding model turns text into 384 numbers that capture meaning. Memories close to your query in that space match, even with no words in common.',
    q: 'bike keeps making a clicking noise',
    mode: 'semantic',
  },
  {
    engine: 'hybrid',
    title: 'Hybrid search',
    body: 'One TalaDB call runs both rankings over the same collection and fuses them by reciprocal rank — the precision of keywords with the reach of meaning.',
    q: 'that camera I lent someone',
    mode: 'hybrid',
  },
  {
    engine: 'graph',
    title: 'Connections',
    body: 'Things are linked to places, people and each other. “Where is my drill?” walks those links: Home → Garage → Tool Cabinet → Shelf B.',
    q: 'where is my drill?',
    mode: 'auto',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="space-y-12">
      <PageHeader
        eyebrow="How it works"
        title="A whole database, inside this browser tab"
        description="Keepsake is built on TalaDB, an embedded document and vector database written in Rust and compiled to WebAssembly. It runs on your device, so your memories never need to leave it."
      />

      <Architecture />

      <section className="space-y-4" aria-labelledby="network-title">
        <h2 id="network-title">What the network is used for</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-5">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <Icon name="arrow" className="h-4 w-4" strokeWidth={2.2} /> Downloads from this site
            </p>
            <ul className="muted mt-3 space-y-2 text-[14px] leading-relaxed">
              <li>The app itself — its code, styles and fonts.</li>
              <li>The sample household, once, on your first visit.</li>
              <li>The embedding model and its runtime, only if you turn on semantic search. Your browser caches them.</li>
            </ul>
          </div>
          <div className="card p-5">
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <Icon name="lock" className="h-4 w-4" strokeWidth={2.2} /> Never sent anywhere
            </p>
            <ul className="muted mt-3 space-y-2 text-[14px] leading-relaxed">
              <li>Your memories, things and connections.</li>
              <li>What you search for, and the results.</li>
              <li>The embeddings computed from your text.</li>
            </ul>
            <p className="muted-more mt-3 text-[12.5px]">There is no account, no analytics and no tracking in this app.</p>
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="ways-title">
        <h2 id="ways-title">Five ways to find something</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {WAYS.map((w) => (
            <div key={w.title} className="card flex flex-col p-5">
              <EngineBadge engine={w.engine} size="xs" />
              <p className="mt-3 text-[15px] font-semibold">{w.title}</p>
              <p className="muted mt-1.5 flex-1 text-[14px] leading-relaxed">{w.body}</p>
              <Link
                href={`/recall?q=${encodeURIComponent(w.q)}${w.mode !== 'auto' ? `&mode=${w.mode}` : ''}`}
                className="link mt-4 inline-flex items-center gap-1 text-[13.5px] font-medium"
              >
                Try “{w.q}”
                <Icon name="arrow" className="h-3.5 w-3.5" strokeWidth={2.2} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="limits-title">
        <h2 id="limits-title">Good to know</h2>
        <ul className="card divide-y overflow-hidden text-[14px]">
          {(
            [
              ['shield', 'Local means local', 'Clearing this site’s data in your browser deletes the database with it. Export a copy from Settings any time — it is plain JSON.'],
              ['database', 'The browser decides how long data stays', 'Unless you ask the browser to keep this site’s storage (the status menu at the top offers it), it may clear it when the device is low on space.'],
              ['phone', 'This is a demo', 'It is filled with sample memories. To keep your own, Kepta for Android is the same product on the same engine, PIN-locked and encrypted on the phone.'],
            ] as Array<[IconName, string, string]>
          ).map(([icon, title, body]) => (
            <li key={title} className="flex gap-3 px-5 py-4">
              <Icon name={icon} className="muted mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="muted mt-0.5 leading-relaxed">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <DeveloperDetails />
    </div>
  )
}

/** The moving parts, drawn as the boxes they are. */
function Architecture() {
  return (
    <section aria-labelledby="arch-title" className="space-y-4">
      <h2 id="arch-title">Where your data lives</h2>
      <div className="card p-5 md:p-6">
        <p className="eyebrow mb-4 flex items-center gap-2">
          <Icon name="monitor" className="h-3.5 w-3.5" strokeWidth={2.2} /> Your browser, on this device
        </p>
        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]">
          <Box icon="home" title="Keepsake" body="The interface you are using. It asks questions and shows answers." />
          <Arrow />
          <Box
            icon="database"
            title="TalaDB worker"
            body="Rust compiled to WebAssembly, in a background worker. Documents, b-tree, full-text and vector indexes, live queries."
            strong
          />
          <Arrow />
          <Box icon="layers" title="Browser storage" body="A private file system only this site can open (OPFS), or IndexedDB when OPFS is missing." />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]">
          <div className="hidden md:block" />
          <div className="hidden md:block w-6" />
          <Box
            icon="cpu"
            title="Embedding worker (optional)"
            body="all-MiniLM-L6-v2 on an ONNX WebAssembly runtime. Turns text into vectors for search by meaning."
          />
        </div>
        <p className="muted mt-5 text-[13px] leading-relaxed">
          Open Keepsake in a second tab and both use the same database: one tab’s worker owns the
          file, the others send their reads and writes to it, and ownership moves over if that tab
          closes. A memory saved in one tab appears in the others without a reload.
        </p>
      </div>
    </section>
  )
}

function Box({ icon, title, body, strong }: { icon: IconName; title: string; body: string; strong?: boolean }) {
  return (
    <div
      className="rounded-[14px] p-4"
      style={
        strong
          ? { background: 'color-mix(in oklab, var(--color-ios-blue) 8%, var(--color-card))', border: '1px solid color-mix(in oklab, var(--color-ios-blue) 30%, transparent)' }
          : { background: 'var(--color-fill)', border: '1px solid var(--color-border)' }
      }
    >
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <Icon name={icon} className="h-4 w-4" strokeWidth={2.1} />
        {title}
      </p>
      <p className="muted mt-1.5 text-[13px] leading-relaxed">{body}</p>
    </div>
  )
}

function Arrow() {
  return (
    <div aria-hidden className="muted-more flex items-center justify-center">
      <Icon name="arrow" className="h-4 w-4 rotate-90 md:rotate-0" strokeWidth={2} />
    </div>
  )
}

/** Live from the engine — not a description of it. */
function DeveloperDetails() {
  const db = useTalaDB()
  const embedder = useEmbedderState()
  const live = useAsync(async () => {
    const { memories } = collections(db)
    const [info, indexes] = await Promise.all([db.storageInfo?.() ?? null, memories.listIndexes()])
    const vector = indexes.vector.includes('embedding') ? await memories.vectorIndexStatus('embedding') : null
    return { info, indexes, vector }
  }, [db])

  const rows: Array<[string, string]> = live.data
    ? [
        ['TalaDB', `v${process.env.NEXT_PUBLIC_TALADB_VERSION} (@taladb/web)`],
        ['Storage backend', live.data.info ? (live.data.info.storage === 'opfs' ? 'OPFS' : 'IndexedDB snapshot') : 'not reported'],
        ['Durable writes', live.data.info ? (live.data.info.durableWrites ? 'yes — a write resolves once storage has committed it' : 'debounced snapshots') : '—'],
        ['This tab owns the file', live.data.info ? (live.data.info.owner ? 'yes' : 'no — requests go to the owning tab') : '—'],
        ['memories · b-tree', live.data.indexes.btree.join(', ') || '—'],
        ['memories · full-text', live.data.indexes.fts.join(', ') || '—'],
        [
          'memories · vector',
          live.data.vector
            ? `embedding — ${live.data.vector.state === 'flat' ? 'exact' : live.data.vector.state}, ${live.data.vector.totalVectors.toLocaleString()} × ${VECTOR_DIM}d${live.data.vector.persistent ? ', persistent' : ''}`
            : 'none yet',
        ],
        ['Embedding model', `${EMBEDDING_MODEL} — ${modelStatusLabel(embedder).toLowerCase()}`],
      ]
    : []

  return (
    <section aria-labelledby="dev-title" className="space-y-4">
      <div>
        <p className="eyebrow">For developers</p>
        <h2 id="dev-title" className="mt-1.5">Under the hood, live</h2>
        <p className="muted mt-2 max-w-2xl text-[14px] leading-relaxed">
          Read from the engine in this browser as the page opened. The exact index is deliberate: at
          a few hundred memories a full scan is under a millisecond, so an approximate HNSW graph
          would be slower and less accurate. The app switches to one past 20,000 vectors —{' '}
          <Link href="/lab" className="link">see that trade-off at scale</Link>.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <dl className="card divide-y overflow-hidden text-[13px]">
          {live.loading && <p className="muted px-4 py-3">Reading from the engine…</p>}
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-4 px-4 py-2.5">
              <dt className="muted w-36 shrink-0">{k}</dt>
              <dd className="min-w-0 break-words font-mono text-[12px] font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="card overflow-hidden">
          <p className="muted px-4 py-2.5 text-[12px]" style={{ boxShadow: 'inset 0 -1px 0 var(--color-border)' }}>
            The hybrid query behind Search — lib/retrieval.ts
          </p>
          <pre className="scrollbar-thin overflow-x-auto p-4 font-mono text-[12px] leading-relaxed">
{`const vector = await embed(query)   // on-device, in a worker

const hits = await memories.hybridSearch(
  { textField: 'content', text: query },   // BM25
  { vectorField: 'embedding', vector },    // cosine
  8,
)

// each hit: { document, score,
//             textRank, vectorRank }      // RRF-fused`}
          </pre>
        </div>
      </div>
    </section>
  )
}
