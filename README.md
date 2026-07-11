# Wanderdeck — a local-first booking demo on TalaDB 0.9

A full hotel/travel booking site whose **entire database runs in the browser**. There is no
backend database: the ~10,000-listing catalog, your bookings, saved stays, reviews, and an
encrypted payment vault all live in [TalaDB](https://github.com/thinkgrid-labs/taladb) 0.9 — a
Rust + WebAssembly engine persisting to OPFS. A tiny Next.js route handler exists only as the
**sync** peer.

Built with **Next.js 16** (App Router, Turbopack) + **React 19** + **Tailwind v4**, consuming the
published `taladb` / `@taladb/web` / `@taladb/react` / `@taladb/next` packages at **0.9.0**.

## The point of the demo

The **document database and its MongoDB-like query API power the whole site** — structured
filters, full-text search, compound indexes, the aggregation pipeline, live queries, encryption,
and offline-first sync. **Vector/semantic search is an AI feature and lives on its own page**
(`/discover`), because everyday browsing (city, price, guests, amenities) is exactly what
structured document queries are for.

## Pages & the TalaDB 0.9 feature each demonstrates

| Route | Feature |
|---|---|
| `/` **Explore** | Document query DSL — `$and`/`$or`, `$in`, `$gte`/`$lte` range, `$contains` FTS; compound `city+guests` index; live `useFind` |
| `/listing/[slug]` **Detail** | `useFindOne`; reviews; `$set`/`$inc` updates |
| `/book/[slug]` **Booking** | Offline-first `insert` — writes hit the device instantly, sync in the background |
| `/trips` **My trips** | The synced data — live `useFind`, `updateOne`/`deleteOne`, cross-tab reactivity, offline→reconnect merge |
| `/admin` **Host dashboard** | Aggregation pipeline — `$group`/`$sum`/`$avg` over 10k listings + bookings |
| `/account` **Vault + internals** | Encryption at rest — a separate `openDB(name, { passphrase })` DB (AES-GCM-256); `listIndexes`, `syncStatus`, `compact` |
| `/discover` **AI semantic search** | Vector search — on-device query embedding → `findNearest` (flat index, ~single-digit–tens of ms over 10k); hybrid metadata + vector in one call |
| `/api/sync/[[...action]]` | `@taladb/next` `createSyncHandlers` + `memorySyncStore` (push/pull) |

## Local development

```bash
pnpm install

# Generate seed data (writes public/seed/listings.json + embeddings.bin).
# Full run downloads the embedding model and embeds 10k listings (a few minutes):
pnpm seed
# Faster iteration — smaller catalog, no embeddings:
pnpm seed --count 500 --no-embeddings

pnpm dev            # Turbopack
pnpm dev:webpack    # webpack fallback if the worker/wasm ever misbundles
```

Open http://localhost:3000. On first load the catalog seeds into OPFS once (a progress banner
shows). Visiting `/discover` lazily loads the 15 MB embeddings and builds the vector index — only
that page pays for it.

## How it fits together

- **Client-only DB.** The name-based `<TalaDBProvider name="hotels-v1.db">` opens the DB in a
  `useEffect` (never during SSR) and renders a splash until ready, so no DB code runs on the server.
- **Sync scope.** `<SyncProvider options={{ collections: ['bookings','favorites','reviews'] }}>`
  syncs only user data — never the 10k catalog, which each device re-seeds locally.
- **Seeding.** Two stages, each guarded once-per-device: Stage A streams the document catalog +
  builds b-tree/FTS/compound indexes; Stage B (lazy, on `/discover`) loads embeddings + builds the
  flat vector index. HNSW is Node/RN-only (native threads), so the browser uses the exact `flat` index.
- **Config.** `next.config.ts` transpiles the TalaDB packages so Turbopack emits the worker + wasm,
  sets COOP/COEP (for transformers.js SIMD), and stubs the optional native `@taladb/node` addon.

## Production sync

The shipped `memorySyncStore()` is per-instance and fine for the local demo or a single running
instance. For durable cross-device sync on serverless (e.g. Vercel), implement the 2-method
`SyncStore` (`push`/`pull`, last-write-wins by `changed_at`) over Upstash Redis / Postgres / Turso,
or run `taladbSyncStore(await openDB(...))` on a long-lived Node host.
