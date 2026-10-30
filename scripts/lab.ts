/**
 * The scale lab, native: the same code as /lab, against `@taladb/node`.
 *
 * Run it next to the browser page to see what WASM and the phone-sized cache
 * budget cost on the same corpus and the same queries.
 *
 *   bun run lab            # 10,000 memories
 *   bun run lab 25000
 */
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { openDB } from 'taladb'
import {
  benchAnn, benchDocuments, benchExact, buildLabGraph, LAB_EF, labCache, labQueries, populate,
} from '../lib/lab'

const count = Number(process.argv[2] ?? 10_000)
const quantization = process.argv.includes('--binary') ? 'binary' : 'none'
const FILE = join(import.meta.dirname, '..', '.lab.db')

const ms = (n: number) => `${n < 10 ? n.toFixed(2) : n.toFixed(0)} ms`
const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(1)}%`)

await rm(FILE, { force: true, recursive: true })
const db = await openDB(FILE)

console.log(`\nScale lab — ${count.toLocaleString()} memories × ${384}d, native\n`)
const { writeMs, indexMs } = await populate(db, count)
console.log(`  write ${ms(writeMs)}, index ${ms(indexMs)}`)

const doc = await benchDocuments(db)
console.log('\nDocument engine (median)')
console.log(`  oldest 10, indexed sort     ${ms(doc.oldestPageMs)}`)
console.log(`  newest 10, indexed sort     ${ms(doc.newestPageMs)}`)
console.log(`  one-month range count       ${ms(doc.monthRangeMs)}  (${doc.monthRangeRows} rows)`)
console.log(`  unindexed filter, no match  ${ms(doc.unindexedMissMs)}`)

const queries = labQueries()
const exact = await benchExact(db, queries)
console.log('\nVector engine (median per query, k = 10)')
console.log(`  exact            ${ms(exact.medianMs).padEnd(9)} ${exact.distances} distances`)

const { buildMs } = await buildLabGraph(db, { quantization })
console.log(`  graph build      ${ms(buildMs)} (M=16, efConstruction=200, quantization=${quantization})`)
for (const ef of LAB_EF) {
  const r = await benchAnn(db, queries, ef)
  console.log(`  hnsw ef=${String(ef).padEnd(3)}      ${ms(r.medianMs).padEnd(9)} ${String(r.distances).padEnd(6)} distances  recall@10 ${pct(r.recallAt10)}`)
}

const cache = await labCache(db)
console.log(`\nCache: ${(cache.budgetBytes / 2 ** 20).toFixed(0)} MiB budget (${cache.policy}), ${(cache.retainedBytes / 2 ** 20).toFixed(1)} MiB held\n`)

await db.close()
await rm(FILE, { force: true, recursive: true })
