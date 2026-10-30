'use client'

import { useEffect, useState } from 'react'
import { useTalaDB } from '@taladb/react'
import type { TalaDB } from 'taladb'
import { ensureIndexes, ensureVectorIndex, isSeeded, markSeeded, SEED_VERSION } from './schema'
import { writeCorpus as writeCorpusDocs, type Corpus } from './corpus'

// ---------------------------------------------------------------------------
// First-run seeding.
//
// The corpus is a static asset, so this is a pure local import: fetch two
// files, write them to the device, build the indexes once. It happens exactly
// once per browser — every visit after this one opens straight onto data that
// is already on disk, with no network in the path at all.
// ---------------------------------------------------------------------------

export interface SeedProgress {
  phase: 'idle' | 'fetching' | 'entities' | 'memories' | 'relations' | 'indexing' | 'done'
  loaded: number
  total: number
}

// React 19 effect semantics (and StrictMode) can run the gate's effect twice.
// Without this lock the second pass races the first and the corpus lands twice.
let seedPromise: Promise<void> | null = null

function runSeed(db: TalaDB, onProgress: (p: SeedProgress) => void): Promise<void> {
  if (!seedPromise) {
    seedPromise = seed(db, onProgress).catch((err) => {
      seedPromise = null // let a failed run be retried
      throw err
    })
  }
  return seedPromise
}

async function seed(db: TalaDB, onProgress: (p: SeedProgress) => void): Promise<void> {
  const alreadySeeded = await isSeeded(db, 'corpus', SEED_VERSION)
  if (!alreadySeeded) await writeCorpus(db, onProgress)

  // Indexes are built LAST on a first run, so each one is a single backfill
  // over a populated collection rather than per-insert upkeep across 300
  // writes. On every later open both calls are cheap no-ops.
  onProgress({ phase: 'indexing', loaded: 0, total: 0 })
  await ensureIndexes(db)
  await ensureVectorIndex(db)

  if (!alreadySeeded) await markSeeded(db, 'corpus', SEED_VERSION)
  onProgress({ phase: 'done', loaded: 0, total: 0 })
}

/**
 * Put the demo corpus back the way it shipped, moved so that it ends today.
 *
 * Anything the visitor wrote themselves — memories, new things, the edges their
 * captures created — stays. Only documents with a corpus-derived id are
 * replaced.
 */
export async function resetDemoCorpus(
  db: TalaDB,
  onProgress: (p: SeedProgress) => void = () => {},
): Promise<void> {
  await writeCorpus(db, onProgress)
  await ensureIndexes(db)
  await ensureVectorIndex(db)
  await markSeeded(db, 'corpus', SEED_VERSION)
  onProgress({ phase: 'done', loaded: 0, total: 0 })
}

async function writeCorpus(db: TalaDB, onProgress: (p: SeedProgress) => void): Promise<void> {
  onProgress({ phase: 'fetching', loaded: 0, total: 0 })

  const [corpus, vectorBuffer] = await Promise.all([
    fetch('/seed/corpus.json').then((r) => {
      if (!r.ok) throw new Error(`corpus.json (${r.status})`)
      return r.json() as Promise<Corpus>
    }),
    fetch('/seed/embeddings.bin').then((r) => (r.ok ? r.arrayBuffer() : null)),
  ])

  await writeCorpusDocs(db, corpus, vectorBuffer ? new Float32Array(vectorBuffer) : null, {
    onProgress: (phase, loaded, total) => onProgress({ phase, loaded, total }),
  })
}

const PHASE_LABEL: Record<SeedProgress['phase'], string> = {
  idle: 'Starting',
  fetching: 'Loading your memories',
  entities: 'Adding things, people and places',
  memories: 'Writing the timeline',
  relations: 'Connecting everything up',
  indexing: 'Building search indexes',
  done: 'Ready',
}

/**
 * Blocks children until the device has a populated database. Only the very
 * first visit ever sees this; afterwards the marker check resolves in one
 * indexed lookup and the gate opens in the same frame.
 */
export function SeedGate({ children }: { children: React.ReactNode }) {
  const db = useTalaDB()
  const [progress, setProgress] = useState<SeedProgress>({ phase: 'idle', loaded: 0, total: 0 })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    runSeed(db, (p) => {
      if (!cancelled) setProgress(p)
    })
      .then(() => !cancelled && setReady(true))
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [db])

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div
          className="card max-w-md p-6"
          style={{ background: 'color-mix(in oklab, var(--color-ios-red) 12%, transparent)' }}
        >
          <h2 className="text-[17px] font-semibold text-[var(--color-ios-red)]">
            Could not set up your memory
          </h2>
          <p className="muted mt-2 text-[14px]">{error}</p>
        </div>
      </div>
    )
  }

  if (!ready) {
    const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : null
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden>
          <rect width="32" height="32" rx="8" fill="var(--color-ios-blue)" />
          <path
            d="M8 23 Q12 9 16 16 Q20 23 24 9"
            stroke="white"
            strokeWidth="2.25"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="8" cy="23" r="2.4" fill="white" />
          <circle cx="16" cy="16" r="2.4" fill="white" />
          <circle cx="24" cy="9" r="2.4" fill="white" />
        </svg>

        <div className="text-center">
          <p role="status" aria-live="polite" className="text-[17px] font-semibold">
            {PHASE_LABEL[progress.phase]}
          </p>
          <p className="mt-1.5 text-sm muted">
            Setting up once on this device. Nothing leaves it.
          </p>
        </div>

        <div
          className="h-1.5 w-64 overflow-hidden rounded-full "
          role="progressbar"
          aria-valuenow={pct ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-[var(--color-ios-blue)] transition-[width] duration-300"
            style={{ width: pct === null ? '25%' : `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
