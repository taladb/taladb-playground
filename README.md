# Keepsake — a local-first personal memory system on TalaDB

A private memory for your real world: your things, the people and places around them, and
everything that ever happened to each one — captured in a sentence, searchable offline, and
stored in a database that lives **inside your browser**.

There is no account, no server and no sync. The Rust/WASM engine, the documents, the full-text
indexes and the vector graph are all on your device, in OPFS. Close the tab and it is still yours.

Built with **Next.js 16** (App Router, Turbopack) + **React 19** + **Tailwind v4**, on
[**TalaDB 0.11.4**](https://github.com/taladb/taladb). Package manager and scripts run on **Bun**.

---

## What this demo is actually arguing

TalaDB is two engines in one file: a MongoDB-shaped **document database** and an embedded
**vector database**. Most demos show one or the other. The interesting claim is what happens when
an application needs both at once — and a personal memory system needs both constantly, because
the questions people ask about their own history split cleanly in two:

| The question | Engine | Why that one |
|---|---|---|
| *How much have I spent maintaining the bike?* | **Document** | `$match` + `$group`/`$sum`. It has to be **right**, so it is computed, never ranked |
| *Who has my camera?* | **Document** | Loans with no later return — a set difference over two indexed reads |
| *Which warranties expire soon?* | **Document** | Two-sided range scan on an indexed date |
| *Where is my drill?* | **Graph** | Latest `movement`, then a containment walk: Home → Garage → Cabinet → Shelf B |
| *bike keeps making a clicking noise* | **Vector** | The answer says "rattle" and "tapping". Zero keyword overlap. Similarity search finds it anyway |
| *RT38K5930S8* | **Keyword** | A model code. BM25 nails it; a vector has nothing useful to say about a SKU |
| *that camera I lent someone* | **Hybrid** | `hybridSearch` — both rankings fused by RRF in one call |

**The exact questions get exact answers.** Ranking is what happens when a question has no
computable answer — and only then. That ordering is the product, and the app shows its work at
every step rather than asking to be trusted.

### Seeing it happen

Every answer and every result row carries its attribution:

- **Answers** say which engine produced them and the method in one line
  (*"Loans with no later return for the same thing — two indexed reads, no ranking."*).
- **Evidence rows** show `kw #3 · vec —`, the per-retriever ranks `hybridSearch` returns. A row
  marked `kw — · vec #1` is a memory **keyword search could not have found**.
- **The inspector** reports the engine's own execution record: which index path ran (`exact` vs
  `hnsw`), the effective `efSearch`, how many distance computations it actually performed, and
  the total in milliseconds — with no network anywhere in it.

## Routes and the feature each one leans on

| Route | What it demonstrates |
|---|---|
| `/` **Home** | Capture-first entry; open loans and expiring warranties, both pure document queries |
| `/capture` | Deterministic extraction — verb table, date parser, currency parser, BM25 entity resolution. Every field explains itself; nothing is written until you confirm |
| `/things` | Compound `entityType + category` index; BM25 over a flattened `searchText`, so a serial number finds its thing |
| `/entity/[id]` | Timeline via array-membership index; graph location walk; spend aggregation; one-hop relations |
| `/recall` | **The flagship.** Classify → structured → BM25 → vector → graph, with the retrieval inspector |
| `/timeline` | `useAggregate` — a *live* paged pipeline, not a dead snapshot |
| `/insights` | `$group`/`$sum` over the whole corpus by thing, by event kind, by year |
| `/settings` | Which vector index is live and why, resumable rebuilds, `listIndexes`, `storageInfo`, `compact`, export/import |

## Local development

```bash
bun install

# Regenerate the corpus. Full run downloads the embedding model and embeds every memory:
bun run seed
# Faster iteration — corpus only, no vectors:
bun run seed --no-embeddings

bun run dev        # Turbopack
bun run verify     # exercises every lib/ module against the real engine (see below)
```

Open http://localhost:3000. The corpus seeds into OPFS once on first load; every visit after that
is a pure local read.

### `bun run verify`

The database runs in the browser, which normally makes the data path awkward to test. But every
module under `lib/` takes a `TalaDB` handle and knows nothing about which binding produced it — so
`scripts/verify.ts` drives the **identical code** against `@taladb/node`, seeds the shipped corpus,
builds the same indexes, and asserts on real results: that the location walk lands on Shelf B, that
the returned drill is not listed as lent out, that `hybridSearch` surfaces at least one document
keyword search never returned, and that the extractor pulls `₱1,200`, `today`, `Trek FX 3` and
`CycleHouse` out of one sentence. 40 checks, no mocks.

## How it fits together

- **One provider, no network.** `<TalaDBProvider name="keepsake.db">` opens the database in an
  effect (never during SSR) and renders a splash until ready. Nothing beneath it is
  server-rendered, which is correct for an app whose entire content is the user's private data.
- **The embedding lives on the memory document.** The instinct is to keep vectors in their own
  collection so ordinary reads stay lean — but `hybridSearch` can only fuse two rankings when the
  FTS index and the vector index are **on the same collection**. So the vector stays, and every
  list-shaped read drops it with `$project: { embedding: 0 }`.
- **AI is optional and the app says so.** Structured queries, BM25, timelines, aggregation and
  export all work with no model present. The 25 MB embedding model is downloaded on demand and buys
  exactly one thing: search by meaning. Enable it mid-session and your last query re-runs so you can
  watch the answer improve.
- **Vectors are never canonical.** They are regenerable from the memory text, which is why the
  export omits them by default and why losing them costs nothing but time.
- **Append-only where it matters.** A loan is never mutated into a return; a `return` memory closes
  it. The history stays honest, and "what have I lent out?" stays a query rather than a status
  column somebody has to remember to update.

## Notes on TalaDB 0.11

This app previously demonstrated 0.9 as a hotel-booking site. Three changes drove the rewrite:

- **Sync was removed in 0.11.0** — along with replication, conflict resolution and the
  `@taladb/next` package, which is no longer published. This app is local-only by design, so there
  is nothing left to configure; the old sync route, auth token and status badge are gone.
- **`useMutation` became `useWrite`** — a local write is not a network round-trip and should not
  borrow the name of one.
- **Persistent HNSW reached the browser in 0.11.4.** Until then the browser fell back to an exact
  scan because the graph needed native threads. Graphs now live in the same database as the
  documents, update in the same transaction as an embedding write, and survive a reload with no
  rebuild.

  This app still uses the **exact** index, deliberately. An approximate graph trades accuracy for
  fewer distance computations, and that only pays once scanning the collection is the expensive
  part. A personal memory holds a few hundred memories — scanning all of them is well under a
  millisecond — so a graph here would be slower *and* approximate. `lib/schema.ts` switches to
  HNSW automatically past 20,000 vectors, and `/settings` shows which index is live and why.

Turbopack needs **no configuration** from 0.11.1 onward — `next.config.ts` is down to a workspace
root pin and the COOP/COEP headers, which exist for transformers.js SIMD rather than for TalaDB.

## Credits

The product design follows a *Local-First Personal Memory System* specification: entity-first
rather than note-first, evidence-backed answers, three-band provenance (✓ confirmed, ◐ extracted,
◇ inferred), and the rule that AI never silently overwrites something a person confirmed.

The corpus is fiction — one household's bikes, appliances, receipts and repairs over three years —
written so the retrieval differences above are demonstrable rather than asserted.
