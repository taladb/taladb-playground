'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useTalaDB } from '@taladb/react'
import { ensureDocSeed, ensureUserIndexes, ensureVectorSeed, isVectorSeeded } from './db-schema'

interface SeedStatus {
  /** Document catalog ready (Stage A complete). */
  docReady: boolean
  /** Rows loaded / total during Stage A. */
  docLoaded: number
  docTotal: number
  /** Vector index ready (Stage B complete). */
  vectorReady: boolean
  vectorLoaded: number
  vectorTotal: number
  vectorSeeding: boolean
  /** Kick off the lazy Stage-B vector seed (called by /discover). */
  startVectorSeed: () => void
  error: string | null
}

const SeedContext = createContext<SeedStatus | null>(null)

export function useSeedStatus(): SeedStatus {
  const ctx = useContext(SeedContext)
  if (!ctx) throw new Error('useSeedStatus must be used within <SeedGate>')
  return ctx
}

export function SeedGate({ children }: { children: React.ReactNode }) {
  const db = useTalaDB()
  const [docReady, setDocReady] = useState(false)
  const [docLoaded, setDocLoaded] = useState(0)
  const [docTotal, setDocTotal] = useState(0)
  const [vectorReady, setVectorReady] = useState(false)
  const [vectorLoaded, setVectorLoaded] = useState(0)
  const [vectorTotal, setVectorTotal] = useState(0)
  const [vectorSeeding, setVectorSeeding] = useState(false)
  const [wantVectors, setWantVectors] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stage A: document catalog + user indexes.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensureUserIndexes(db)
        await ensureDocSeed(db, (loaded, total) => {
          if (cancelled) return
          setDocLoaded(loaded)
          setDocTotal(total)
        })
        if (!cancelled) {
          setDocReady(true)
          setVectorReady(await isVectorSeeded(db))
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [db])

  // Stage B: lazy vector seed, triggered by startVectorSeed(). A ref guards
  // against a double-start; note we deliberately do NOT depend on vectorSeeding
  // here — doing so would re-run the effect (and its cleanup) the instant
  // seeding begins, cancelling the in-flight seed before it can complete.
  const vectorStarted = useRef(false)
  useEffect(() => {
    if (!wantVectors || !docReady || vectorReady || vectorStarted.current) return
    vectorStarted.current = true
    setVectorSeeding(true)
    ;(async () => {
      try {
        await ensureVectorSeed(db, (loaded, total) => {
          setVectorLoaded(loaded)
          setVectorTotal(total)
        })
        setVectorReady(true)
      } catch (e) {
        vectorStarted.current = false // allow retry
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setVectorSeeding(false)
      }
    })()
  }, [wantVectors, docReady, vectorReady, db])

  const value: SeedStatus = {
    docReady,
    docLoaded,
    docTotal,
    vectorReady,
    vectorLoaded,
    vectorTotal,
    vectorSeeding,
    startVectorSeed: () => setWantVectors(true),
    error,
  }

  return <SeedContext.Provider value={value}>{children}</SeedContext.Provider>
}
