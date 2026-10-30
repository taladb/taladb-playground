'use client'

/**
 * On-device embedding.
 *
 * The model is downloaded on demand, never at startup. That is a product
 * decision as much as a performance one: the whole app — capture, timelines,
 * structured queries, keyword search, aggregation, export — works with no model
 * present at all, and the download only buys the semantic tier on top.
 *
 * The seeded corpus ships with its vectors precomputed, so the database has a
 * populated vector index from the first load. What the model is needed for is
 * the *query* side (a search phrase has to be encoded into the same space
 * before it can be compared to anything) and the *write* side (a memory the
 * user writes themselves has no vector until something produces one).
 *
 * The model runs in a Web Worker (`embed.worker.ts`) and is served from this
 * app's own origin. This module is the main-thread handle: it owns the worker,
 * matches replies to requests, and keeps the load state the UI renders.
 *
 * Model parity with `scripts/generate-seed.ts` is mandatory. Two different
 * encoders fail silently — no error, just scores that mean nothing.
 */

import { EMBEDDING_MODEL, VECTOR_DIM } from './schema'

/** Main thread → worker. */
export type EmbedRequest =
  | { type: 'load'; model: string }
  | { type: 'embed'; id: number; model: string; texts: string[] }

/** Worker → main thread. */
export type EmbedResponse =
  | { type: 'progress'; progress: number }
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'result'; id: number; vectors: Float32Array }
  | { type: 'failed'; id: number; message: string }

export type EmbedderState =
  | { status: 'idle' }
  | { status: 'loading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string }

let state: EmbedderState = { status: 'idle' }
const listeners = new Set<(s: EmbedderState) => void>()

function setState(next: EmbedderState) {
  state = next
  for (const fn of listeners) fn(next)
}

export function getEmbedderState(): EmbedderState {
  return state
}

export function subscribeEmbedder(fn: (s: EmbedderState) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** True once the model is resident and `embed` will resolve without a download. */
export function isEmbedderReady(): boolean {
  return state.status === 'ready'
}

// --- the worker --------------------------------------------------------------

let worker: Worker | null = null
let loading: Promise<void> | null = null
let settleLoad: { resolve: () => void; reject: (err: Error) => void } | null = null
let nextId = 0
const pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (err: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<EmbedResponse>) => {
    const msg = event.data
    switch (msg.type) {
      case 'progress':
        setState({ status: 'loading', progress: msg.progress })
        break
      case 'ready':
        setState({ status: 'ready' })
        settleLoad?.resolve()
        settleLoad = null
        break
      case 'error':
        setState({ status: 'error', message: msg.message })
        settleLoad?.reject(new Error(msg.message))
        settleLoad = null
        // Clear so a retry is possible rather than permanently poisoned.
        loading = null
        break
      case 'result':
        pending.get(msg.id)?.resolve(msg.vectors)
        pending.delete(msg.id)
        break
      case 'failed':
        pending.get(msg.id)?.reject(new Error(msg.message))
        pending.delete(msg.id)
        break
    }
  }
  worker.onerror = (event) => {
    // The worker itself failed to start or crashed: nothing in flight can
    // finish, so fail all of it and let the next call start a fresh one.
    const err = new Error(event.message || 'embedding worker failed')
    setState({ status: 'error', message: err.message })
    settleLoad?.reject(err)
    settleLoad = null
    for (const p of pending.values()) p.reject(err)
    pending.clear()
    worker?.terminate()
    worker = null
    loading = null
  }
  return worker
}

/**
 * Load the model, reporting download progress. Safe to call repeatedly — the
 * in-flight load is shared, and transformers.js caches the weights in the
 * browser's Cache Storage, so a second visit resolves without a download.
 */
export function loadEmbedder(): Promise<void> {
  if (state.status === 'ready') return Promise.resolve()
  if (loading) return loading

  setState({ status: 'loading', progress: 0 })
  loading = new Promise<void>((resolve, reject) => {
    settleLoad = { resolve, reject }
    getWorker().postMessage({ type: 'load', model: EMBEDDING_MODEL } satisfies EmbedRequest)
  })
  return loading
}

/**
 * Embed several strings in one forward pass. Loads the model first if it isn't
 * resident yet. One batch is one message each way, which is why a backfill
 * goes through here rather than calling `embed` in a loop.
 */
export async function embedMany(texts: string[]): Promise<number[][]> {
  if (!texts.length) return []
  await loadEmbedder()

  const id = nextId++
  const flat = await new Promise<Float32Array>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ type: 'embed', id, model: EMBEDDING_MODEL, texts } satisfies EmbedRequest)
  })

  if (flat.length !== texts.length * VECTOR_DIM) {
    throw new Error(`embedding width ${flat.length / texts.length}, expected ${VECTOR_DIM}`)
  }
  return texts.map((_, i) => Array.from(flat.subarray(i * VECTOR_DIM, (i + 1) * VECTOR_DIM)))
}

/** Embed one string. Loads the model first if it isn't resident yet. */
export async function embed(text: string): Promise<number[]> {
  const [vector] = await embedMany([text])
  return vector
}

/**
 * The text that actually gets embedded for a memory. Kept in one place because
 * it has to match what the seed generator embedded — a memory written in the
 * app and a memory from the corpus must land in the same space the same way.
 */
export function memoryEmbeddingText(title: string, content: string): string {
  return `${title}. ${content}`
}
