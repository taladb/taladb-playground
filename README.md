# Keepsake — a local-first personal memory system on TalaDB

A private memory for your real world: your things, the people and places around them, and
everything that ever happened to each one — captured in a sentence, searchable offline, and
stored in a database that lives **inside your browser**.

There is no account, no server and no sync. The Rust/WASM engine, the documents, the full-text
indexes and the vector graph are all on your device, in OPFS. Close the tab and it is still yours.

Built with **Next.js 16** (App Router, Turbopack) + **React 19** + **Tailwind v4**, on
[**TalaDB 0.13.0**](https://github.com/taladb/taladb). Package manager and scripts run on **Bun 1.4.4**.

The web app runs on a seeded demo corpus. To keep your own memories, the same product is on
Android as [**Kepta**](https://play.google.com/store/apps/details?id=dev.thinkgrid.kepta) —
PIN-locked and encrypted on the phone, on the same engine. Every page here links to it.

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
| `/` **Home** | A first-visit introduction (dismissible) that says what the app is and that the data is sample data; search and capture entry points; open loans and expiring warranties, both pure document queries |
| `/capture` | Deterministic extraction — verb table, date parser, currency parser, BM25 entity resolution. Every field explains itself; nothing is written until you confirm |
| `/things` | Compound `entityType + category` index; BM25 over a flattened `searchText`, so a serial number finds its thing |
| `/entity/[id]` | Timeline via array-membership index; graph location walk; spend aggregation; one-hop relations |
| `/memory/[id]` | One memory in full; edit its words, date or amount; delete it (its edges go with it, and a reopened loan or an earlier location comes back); "similar memories" from the stored vector, no model needed |
| `/recall` | **The flagship — Search.** Search as you type, in four modes: *Smart* (classify → exact answer → best ranking), *Keyword* (BM25), *Semantic* (vector) and *Hybrid* (RRF). Matched words are marked, every hit shows the engine's own score and per-retriever ranks, "Why this result?" explains it from that data, a technical view reports the execution record, and a link to the search is made only when you ask for one |
| `/how-it-works` | What runs where, what the network is and is not used for, the five ways of finding something — and live engine values for developers |
| `/timeline` | `useAggregate` — a *live* paged pipeline, not a dead snapshot |
| `/insights` | `$group`/`$sum` over the whole corpus by thing, by event kind, by year |
| `/settings` | Appearance; which vector index is live and why; build an HNSW graph to measure recall against exact, then go back; simulate memory pressure on the shared cache budget; `listIndexes`, `storageInfo`, `compact`, export/import, reset the sample memories |

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

## Deploying

`vercel.json` pins the Bun runtime:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "bunVersion": "1.4.x"
}
```

Bun is picked up as the **package manager** from `bun.lock` alone — no
configuration, and note the preset does not detect the legacy `bun.lockb`
format. `bunVersion` is what selects the **runtime** for Vercel Functions;
`1.4.x` is the Zig-to-Rust rewrite, `1.x` the previous line.

The `dev` and `build` scripts run `bun run --bun next …` so Next itself executes
under Bun rather than Node. Vercel documents that as required for Next.js with
ISR; this app has no ISR, so it is here for parity between local and deployed
behaviour rather than out of necessity.

Worth knowing before you wire up a project: almost nothing here runs on a
server. Every route but `/entity/[id]` is static, and that one only renders the
provider's fallback, because TalaDB opens in an effect and never during SSR. The
runtime choice is close to cosmetic for this app — which is rather the point of
a local-first database.

### `bun run verify`

The database runs in the browser, which normally makes the data path awkward to test. But every
module under `lib/` takes a `TalaDB` handle and knows nothing about which binding produced it — so
`scripts/verify.ts` drives the **identical code** against `@taladb/node`, seeds the shipped corpus,
builds the same indexes, and asserts on real results: that the location walk lands on Shelf B, that
the returned drill is not listed as lent out, that `hybridSearch` surfaces at least one document
keyword search never returned, and that the extractor pulls `$40`, `today`, `Trek FX 3` and
`CycleHouse` out of one sentence. It also seeds through the same module the browser uses, so
it checks that the corpus is dated up to today, that re-seeding leaves the visitor's own memories
alone, and that the Settings graph experiment and memory-pressure controls do what they say.
It covers the Search page's modes, the matched-word highlighter, editing and deleting memories
(including the loans and locations a deletion has to put back), and that every amount is in dollars.
91 checks, no mocks.

## How it fits together

- **One provider, no network.** `<TalaDBProvider name="keepsake.db">` opens the database in an
  effect (never during SSR) and renders a splash until ready. Nothing beneath it is
  server-rendered, which is correct for an app whose entire content is the user's private data.
- **The embedding lives on the memory document.** The instinct is to keep vectors in their own
  collection so ordinary reads stay lean — but `hybridSearch` can only fuse two rankings when the
  FTS index and the vector index are **on the same collection**. So the vector stays, and every
  list-shaped read drops it with `$project: { embedding: 0 }`.
- **AI is optional and the app says so.** Structured queries, BM25, timelines, aggregation and
  export all work with no model present. The embedding model (23 MB, plus a 22 MB WebAssembly
  runtime, both served from this app's origin) is downloaded on demand and buys
  exactly one thing: search by meaning. Enable it mid-session and your last query re-runs so you can
  watch the answer improve.
- **What you type stays in the tab.** A search or a sentence typed on one page reaches the next
  through an in-memory hand-off (`lib/handoff.ts`), never the URL: putting it in the query
  string makes the App Router fetch that URL's server payload, and the words would travel with
  it. Links to individual memories and things are not prefetched, for the same reason — the
  ids of what a search returned are nobody else's business.
- **Amounts are US dollars.** Every new memory is recorded in `USD`; one saved before the
  switch keeps the currency it was written in and still displays in it.
- **Vectors are never canonical.** They are regenerable from the memory text, which is why the
  export omits them by default and why losing them costs nothing but time.
- **Append-only where it matters.** A loan is never mutated into a return; a `return` memory closes
  it. The history stays honest, and "what have I lent out?" stays a query rather than a status
  column somebody has to remember to update.

## The demo corpus moves with the calendar

The corpus is fiction written on one day, and a demo built on loans, warranties and "this year"
goes stale from that day on. So the first visit moves every date in it — the date fields and the
dates written in the text, together — by whole days, so that the newest memory is from this week.
Every corpus memory also carries `sample: true` — that flag is how the app labels sample data
and counts what the visitor wrote. Seeded ids are derived from the corpus itself, which is what lets a re-seed (a `SEED_VERSION` bump,
or **Reset sample memories** in `/settings`) replace exactly the corpus and leave anything the visitor
wrote.

## Notes on TalaDB 0.13

Nothing in the app had to change to run on 0.13.0. What it gets for free:

- **Two-sided ranges are a real range scan now.** "Which warranties expire soon?" is
  `{ $gte: now, $lte: until }` on an indexed date; until 0.13 that collected both open-ended halves
  and intersected them.
- **Sorted pages hold only the page.** "Recently remembered" and the unfiltered timeline start with
  `$sort` + `$limit` on the indexed `occurredAt`. Newest-first still walks the index, but no longer
  copies all of it to produce six rows.
- **Unindexed filters decode less.** The backfill's `embedding: { $exists: false }` scan reads only
  the field it tests and skips the rest of each document — which, on a memory, is a 384-float
  vector.
- **Exact cosine search caches each vector's norm**, so the exact index this app uses at its size
  is the one that got faster.

## Notes on TalaDB 0.12

Nothing in the app had to change to run on 0.12.0, but two things it does are better for it:

- **Stopwords are dropped from ranked text search.** Recall and capture hand whole sentences to
  BM25 — "who has my camera?" — and every one of "who", "has" and "my" used to count as a match.
  The engine now drops them from the query, so ranking is decided by the words that carry meaning.
  No index rebuild was needed: filtering happens at query time.
- **One memory budget covers every decoded vector and graph**, sized from the device's memory hint
  and shrunk under memory pressure. `/settings` reports the budget and what is held against it.

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
