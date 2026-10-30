/// <reference lib="webworker" />

/**
 * The embedding model, off the main thread.
 *
 * A forward pass of MiniLM is tens of milliseconds of solid compute, and
 * loading it parses 22 MB of weights. On the main thread that is a page that
 * stops scrolling while a query is embedded and freezes outright while the
 * semantic tier switches on — or for the whole of a backfill. Here it costs the
 * page nothing but a message each way.
 *
 * Everything is loaded from this app's own origin: the weights from
 * `/models/` and the ONNX runtime from `/vendor/ort/<version>/`, both put
 * there by `scripts/fetch-model.ts`. Remote models are switched off, so a
 * missing file fails loudly instead of quietly falling back to the Hub.
 */

import type { EmbedRequest, EmbedResponse } from './embed'

type Extractor = (
  text: string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>

let extractor: Promise<Extractor> | null = null

const post = (message: EmbedResponse, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer)

function load(model: string): Promise<Extractor> {
  extractor ??= import('@huggingface/transformers')
    .then(async ({ pipeline, env }) => {
      env.allowRemoteModels = false
      env.allowLocalModels = true
      env.localModelPath = '/models/'
      const wasm = env.backends.onnx.wasm
      if (wasm) wasm.wasmPaths = `/vendor/ort/${env.version}/`

      // transformers.js reports progress per file, and each file starts again
      // at 0% — so a single percentage jumps backwards three times during one
      // load. Summing bytes across every file seen so far gives a number that
      // only moves forward. The total grows as each new file starts, which is
      // why the UI shows bytes rather than claiming a percentage of the whole.
      const files = new Map<string, { loaded: number; total: number }>()
      const loaded = (await pipeline('feature-extraction', model, {
        dtype: 'q8',
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status !== 'progress' || !p.file || typeof p.total !== 'number') return
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
          let sumLoaded = 0
          let sumTotal = 0
          for (const f of files.values()) {
            sumLoaded += f.loaded
            sumTotal += f.total
          }
          post({ type: 'progress', loadedBytes: sumLoaded, totalBytes: sumTotal })
        },
      })) as unknown as Extractor
      post({ type: 'ready' })
      return loaded
    })
    .catch((err: unknown) => {
      extractor = null // a failed load can be retried
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      throw err
    })
  return extractor
}

self.onmessage = async (event: MessageEvent<EmbedRequest>) => {
  const request = event.data
  if (request.type === 'load') {
    await load(request.model).catch(() => {})
    return
  }

  try {
    const run = await load(request.model)
    const out = await run(request.texts, { pooling: 'mean', normalize: true })
    // One flat buffer for the whole batch, transferred rather than copied.
    const vectors = out.data
    post({ type: 'result', id: request.id, vectors }, [vectors.buffer])
  } catch (err) {
    post({ type: 'failed', id: request.id, message: err instanceof Error ? err.message : String(err) })
  }
}
