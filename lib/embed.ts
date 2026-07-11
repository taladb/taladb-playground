// On-device query embedding for the /discover semantic search. Uses the SAME
// model as the offline seed generator (Xenova/all-MiniLM-L6-v2, mean-pooled +
// normalized, 384-dim) — model parity is required for findNearest to be
// meaningful. Loaded lazily via dynamic import so its wasm/onnx assets are
// code-split away from the rest of the app.

type Extractor = (text: string, opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>

let extractorPromise: Promise<Extractor> | null = null

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then(async ({ pipeline, env }) => {
      // Allow remote model download (HF CDN) and cache in the browser.
      env.allowLocalModels = false
      return (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')) as unknown as Extractor
    })
  }
  return extractorPromise
}

/** Embed a query string into a 384-dim normalized vector. */
export async function embedQuery(text: string): Promise<number[]> {
  const extractor = await getExtractor()
  const out = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(out.data)
}

/** Warm the model in the background so the first search feels instant. */
export function warmEmbedder(): void {
  void getExtractor()
}
