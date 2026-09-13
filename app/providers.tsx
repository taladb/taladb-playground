'use client'

import { TalaDBProvider } from '@taladb/react'
import { COLLECTION_OPTIONS, DB_NAME } from '@/lib/schema'
import { SeedGate } from '@/lib/seed'
import { Splash } from './components/Splash'

/**
 * One provider, no network.
 *
 * This used to wrap a replication provider as well — a sync endpoint, an auth
 * token and a poll interval. taladb 0.11.0 removed sync, replication and the
 * conflict-resolution APIs outright, so there is nothing left to configure:
 * the database on this device is the whole system, and the only server this app
 * talks to is the one that served its JavaScript.
 *
 * `collections` registers each collection's options once, so every hook beneath
 * this point — `useFind`, `useAggregate`, `useWrite` — resolves a *configured*
 * handle. Without it the hooks fall back to a bare `db.collection(name)` and a
 * write silently skips both the Zod schema and the `_v` stamp.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TalaDBProvider name={DB_NAME} fallback={<Splash />} collections={COLLECTION_OPTIONS}>
      <SeedGate>{children}</SeedGate>
    </TalaDBProvider>
  )
}
