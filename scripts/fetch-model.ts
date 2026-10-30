/**
 * Put the embedding model and the ONNX runtime it runs on under `public/`, so
 * the browser loads both from this app's own origin.
 *
 * Without this, transformers.js fetches the weights from huggingface.co and
 * the runtime from cdn.jsdelivr.net the first time semantic search is turned
 * on — two third parties learning that someone opened a "nothing leaves this
 * browser" app. Served from here, the only server the app ever talks to is the
 * one that served its JavaScript.
 *
 * Runs before `dev` and `build`. Idempotent: files already present at the
 * expected size are left alone, so only the first run downloads anything.
 *
 *   bun scripts/fetch-model.ts
 */
import { copyFile, mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { EMBEDDING_MODEL } from '../lib/schema'

const ROOT = join(import.meta.dirname, '..')

/**
 * Pinned, so every deploy serves the same weights the seed corpus was embedded
 * against. A moving `main` could change the vector space under a corpus whose
 * vectors were computed once and shipped.
 */
const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9'

/**
 * What the browser pipeline reads: the configs, the tokenizer and the 8-bit
 * weights (`dtype: 'q8'`, transformers.js's default on the wasm backend).
 */
const MODEL_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']

/** The runtime files transformers.js would otherwise load from jsDelivr. */
const ORT_FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

async function fetchModel(): Promise<void> {
  const dir = join(ROOT, 'public', 'models', EMBEDDING_MODEL)
  for (const file of MODEL_FILES) {
    const target = join(dir, file)
    if (await exists(target)) continue

    const url = `https://huggingface.co/${EMBEDDING_MODEL}/resolve/${REVISION}/${file}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    const body = new Uint8Array(await res.arrayBuffer())

    // Write beside the target and rename, so an interrupted download never
    // leaves a truncated file that the size check above would accept.
    await mkdir(dirname(target), { recursive: true })
    await writeFile(`${target}.part`, body)
    await rename(`${target}.part`, target)
    console.log(`  model  ${file} (${(body.byteLength / 1024 / 1024).toFixed(1)} MiB)`)
  }
}

/**
 * Versioned by the transformers.js release, because the runtime has to match
 * the library that loads it — and so the files can be cached as immutable.
 */
function ortVersion(): string {
  const pkg = join(ROOT, 'node_modules', '@huggingface', 'transformers', 'package.json')
  return (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version
}

async function copyRuntime(): Promise<void> {
  const from = join(ROOT, 'node_modules', '@huggingface', 'transformers', 'dist')
  const dir = join(ROOT, 'public', 'vendor', 'ort', ortVersion())
  await mkdir(dir, { recursive: true })
  for (const file of ORT_FILES) {
    const target = join(dir, file)
    if (await exists(target)) continue
    await copyFile(join(from, file), target)
    console.log(`  ort    ${file}`)
  }
}

if (import.meta.main) {
  await Promise.all([fetchModel(), copyRuntime()])
}
