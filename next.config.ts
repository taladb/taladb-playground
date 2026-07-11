import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const projectRoot = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Pin the workspace root (multiple lockfiles exist in the parent tree) and
  // opt into Turbopack. `taladb`'s node entry statically references the optional
  // native `@taladb/node` addon inside createNodeDB(), which never runs in the
  // browser (or during client-component SSR, which only renders the fallback).
  // Alias it to a stub so Turbopack can resolve the specifier at build time.
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      '@taladb/node': './lib/taladb-node-stub.js',
    },
  },

  // Force Next's compiler to trace/emit the TalaDB browser worker + wasm.
  // The browser client loads the DB via runtime URLs that are hardcoded inside
  // node_modules:
  //   taladb  ->  new Worker(new URL('@taladb/web/worker/taladb.worker.js', import.meta.url))
  //           ->  worker: import('../pkg/taladb_web.js')
  //           ->  fetch(new URL('taladb_web_bg.wasm', import.meta.url))
  // Without transpiling these packages, Next treats them as opaque externals
  // and ships the worker specifier unresolved.
  transpilePackages: ['taladb', '@taladb/web', '@taladb/react', '@taladb/next'],

  // Native N-API addon — only reached if the sync route uses taladbSyncStore.
  // It must never be bundled into a client or edge chunk.
  serverExternalPackages: ['@taladb/node'],

  async headers() {
    // OPFS + single-threaded (--target web) wasm do NOT strictly require cross
    // origin isolation, but keeping COOP/COEP lets transformers.js use
    // SharedArrayBuffer/SIMD for faster on-device embedding on /discover.
    // `credentialless` keeps cross-origin (no-cors) images loading.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ]
  },

  // Only consulted when running the webpack compiler (`next dev/build --webpack`),
  // the fallback if Turbopack fails to emit the prebuilt worker's nested import.
  webpack(config) {
    config.experiments = { ...config.experiments, asyncWebAssembly: true }
    config.resolve = config.resolve || {}
    config.resolve.alias = { ...config.resolve.alias, '@taladb/node': false }
    return config
  },
}

export default nextConfig
