'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTalaDB } from '@taladb/react'
import type { VectorSearchResult } from 'taladb'
import type { Listing } from '@/lib/types'
import { CITIES } from '@/lib/types'
import { collections } from '@/lib/db-schema'
import { useSeedStatus } from '@/lib/seed'
import { embedQuery, warmEmbedder } from '@/lib/embed'

const EXAMPLES = [
  'a quiet place near the beach to unwind',
  'romantic cabin with a fireplace in the mountains',
  'bright apartment good for remote work',
  'family villa with a pool and garden',
]

export default function DiscoverPage() {
  const db = useTalaDB()
  const { docReady, vectorReady, vectorSeeding, vectorLoaded, vectorTotal, startVectorSeed } = useSeedStatus()
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [results, setResults] = useState<VectorSearchResult<Listing>[]>([])
  const [searching, setSearching] = useState(false)
  const [ms, setMs] = useState<number | null>(null)

  // Kick off the lazy Stage-B vector seed + warm the embedder on first visit.
  useEffect(() => {
    if (docReady && !vectorReady) startVectorSeed()
    if (vectorReady) warmEmbedder()
  }, [docReady, vectorReady, startVectorSeed])

  async function run(q: string) {
    const text = q.trim()
    if (!text || !vectorReady) return
    setSearching(true)
    setQuery(text)
    try {
      const vec = await embedQuery(text)
      const { listings } = collections(db)
      const filter = city ? { city } : undefined
      const t0 = performance.now()
      const hits = await listings.findNearest('embedding', vec, 12, filter)
      setMs(Math.round((performance.now() - t0) * 10) / 10)
      setResults(hits)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-6 text-white sm:p-8">
        <div className="mb-2 inline-block rounded bg-white/20 px-2 py-0.5 text-xs font-bold uppercase">AI · Vector search</div>
        <h1 className="text-2xl font-bold sm:text-3xl">Describe your ideal stay</h1>
        <p className="mt-1 max-w-2xl text-sm text-violet-50">
          This page is the <strong>vector database</strong>, kept separate on purpose. Your words are
          turned into a 384-dim embedding <em>in your browser</em>, then matched against listing
          embeddings with <code className="font-mono">findNearest</code> — semantic similarity, not keywords.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run(query)}
            placeholder="e.g. a peaceful retreat surrounded by nature"
            disabled={!vectorReady}
            className="flex-1 rounded-xl bg-white/15 px-4 py-2.5 text-sm text-white placeholder:text-violet-100 backdrop-blur focus:outline-none disabled:opacity-60"
          />
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-xl bg-white/15 px-3 py-2.5 text-sm text-white backdrop-blur focus:outline-none"
          >
            <option value="" className="text-slate-900">Any city</option>
            {CITIES.map((c) => (
              <option key={c} value={c} className="text-slate-900">
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={() => run(query)}
            disabled={!vectorReady || searching}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => run(ex)}
              disabled={!vectorReady}
              className="rounded-full bg-white/15 px-3 py-1 text-xs text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {!vectorReady && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm dark:border-violet-900 dark:bg-violet-950/40">
          <div className="flex items-center gap-3">
            <div className="spinner h-5 w-5" />
            <div>
              <p className="font-medium text-violet-900 dark:text-violet-200">
                Preparing AI search…
              </p>
              <p className="text-violet-700 dark:text-violet-300/80">
                {vectorSeeding
                  ? `Loading embeddings into the on-device vector index — ${vectorLoaded.toLocaleString()}/${vectorTotal.toLocaleString()}`
                  : 'Downloading embeddings (loaded only for this page, once per device).'}
              </p>
            </div>
          </div>
        </div>
      )}

      {ms !== null && vectorReady && (
        <p className="text-sm text-slate-500">
          Ranked {results.length} of the catalog by cosine similarity in{' '}
          <span className="font-semibold text-slate-900 dark:text-white">{ms} ms</span>
          {city ? ` · filtered to ${city} (hybrid search — one findNearest call)` : ''}.
        </p>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map(({ document: l, score }) => (
            <Link
              key={l.slug}
              href={`/listing/${l.slug}`}
              className="group flex gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.image} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                    {(score * 100).toFixed(0)}% match
                  </span>
                  <span className="text-xs text-slate-400">
                    {l.city} · ${l.pricePerNight}
                  </span>
                </div>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">{l.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{l.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 font-semibold">How this works</h2>
        <ol className="ml-4 list-decimal space-y-1 text-slate-600 dark:text-slate-300">
          <li>An offline job embeds every listing&apos;s description into a 384-dim vector and ships them as a binary file.</li>
          <li>On first visit here, those vectors load into TalaDB&apos;s <code className="font-mono text-xs">flat</code> vector index (HNSW needs native threads — Node/RN only).</li>
          <li>Your query is embedded <em>in the browser</em> with the same model, then <code className="font-mono text-xs">findNearest</code> ranks listings by cosine similarity.</li>
          <li>Add a city and the same call becomes <strong>hybrid</strong> — a metadata filter plus vector ranking, in one query.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-400">
          This is the AI-shaped capability (semantic search, the retrieval half of RAG). The rest of the
          site never needs it — that&apos;s the point of keeping it on its own page.
        </p>
      </section>
    </div>
  )
}
