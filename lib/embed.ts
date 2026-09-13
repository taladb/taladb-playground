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
 * populated HNSW index from the first load. What the model is needed for is the
 * *query* side (a search phrase has to be encoded into the same space before it
 * can be compared to anything) and the *write* side (a memory the user writes
 * themselves has no vector until something produces one).
 *
 * Model parity with `scripts/generate-seed.ts` is mandatory. Two different
 * encoders fail silently — no error, just scores that mean nothing.
 */

import { EMBEDDING_MODEL, VECTOR_DIM } from './schema'

type Extractor = (
  text: string | string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>

export type EmbedderState =
  | { status: 'idle' }
  | { status: 'loading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string }

let extractorPromise: Promise<Extractor> | null = null
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

/**
 * Load the model, reporting download progress. Safe to call repeatedly — the
 * in-flight promise is shared, and transformers.js caches the weights in the
 * browser's Cache Storage, so a second visit resolves without network.
 */
export function loadEmbedder(): Promise<Extractor> {
  if (extractorPromise) return extractorPromise

  setState({ status: 'loading', progress: 0 })

  extractorPromise = import('@huggingface/transformers')
    .then(async ({ pipeline, env }) => {
      // No local model directory is served by this app, so don't probe for one.
      env.allowLocalModels = false

      const extractor = (await pipeline('feature-extraction', EMBEDDING_MODEL, {
        progress_callback: (p: { status: string; progress?: number }) => {
          if (p.status === 'progress' && typeof p.progress === 'number') {
            setState({ status: 'loading', progress: Math.round(p.progress) })
          }
        },
      })) as unknown as Extractor

      setState({ status: 'ready' })
      return extractor
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message })
      // Clear so a retry is possible rather than permanently poisoned.
      extractorPromise = null
      throw err
    })

  return extractorPromise
}

/** Embed one string. Loads the model first if it isn't resident yet. */
export async function embed(text: string): Promise<number[]> {
  const extractor = await loadEmbedder()
  const out = await extractor(text, { pooling: 'mean', normalize: true })
  const vec = Array.from(out.data)
  if (vec.length !== VECTOR_DIM) {
    throw new Error(`embedding width ${vec.length}, expected ${VECTOR_DIM}`)
  }
  return vec
}

/**
 * The text that actually gets embedded for a memory. Kept in one place because
 * it has to match what the seed generator embedded — a memory written in the
 * app and a memory from the corpus must land in the same space the same way.
 */
export function memoryEmbeddingText(title: string, content: string): string {
  return `${title}. ${content}`
}
