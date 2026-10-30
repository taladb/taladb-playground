import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

const root = dirname(fileURLToPath(import.meta.url))

// The engine version the footer names, read from what is actually installed so
// a bump can never leave the page claiming an older one. `taladb` does not
// export its package.json, so read the file rather than resolving it.
const taladbVersion = (
  JSON.parse(readFileSync(join(root, 'node_modules/taladb/package.json'), 'utf8')) as { version: string }
).version

/**
 * Almost nothing is needed here any more.
 *
 * Up to taladb 0.11.0 this file had to transpile the TalaDB packages, alias the
 * optional native `@taladb/node` addon to a stub, and mark it server-external,
 * or Turbopack shipped the worker specifier unresolved. 0.11.1 fixed Node
 * adapter resolution in browser builds, and the docs are explicit that
 * Turbopack now needs no configuration at all.
 *
 * What remains is the workspace root pin (sibling projects in the parent tree
 * each carry a lockfile) and cross-origin isolation, which is not for TalaDB —
 * OPFS and the single-threaded `--target web` wasm work fine without it. It is
 * for transformers.js, which only reaches SharedArrayBuffer + SIMD on a
 * cross-origin-isolated page. That is the difference between embedding a
 * memory in ~30 ms and ~120 ms. `credentialless` keeps no-cors images loading.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root,
  },

  env: {
    NEXT_PUBLIC_TALADB_VERSION: taladbVersion,
  },

  // Next 16 writes AGENTS.md / CLAUDE.md into the repo root on dev start. This
  // is a demo repo whose README is its documentation, so keep the root clean.
  agentRules: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      // Self-hosted by scripts/fetch-model.ts. The runtime path carries the
      // transformers.js version, so it never changes in place; the model path
      // is pinned to one revision in that script.
      {
        source: '/vendor/ort/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/models/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
    ]
  },
}

export default nextConfig
